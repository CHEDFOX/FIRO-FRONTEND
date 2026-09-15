/**
 * API client for the Firo operator console.
 *
 * Separate from web/api.js on purpose. That client is the product; this one
 * talks to /v1/admin, holds an administrator's token, and must never be bundled
 * into anything a normal user loads.
 */
(function () {
  'use strict';

  const BASE_KEY = 'firo.admin.apiBase';
  const TOKEN_KEY = 'firo.admin.accessToken';
  const REFRESH_KEY = 'firo.admin.refreshToken';

  class ApiError extends Error {
    constructor(code, message, status, details) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  const api = {
    ApiError,

    get baseUrl() {
      return (
        window.FIRO_API_BASE || localStorage.getItem(BASE_KEY) || 'http://127.0.0.1:3000'
      );
    },
    set baseUrl(value) {
      localStorage.setItem(BASE_KEY, String(value).replace(/\/+$/, ''));
    },

    get accessToken() {
      return localStorage.getItem(TOKEN_KEY);
    },
    setTokens(tokens) {
      if (!tokens) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        return;
      }
      localStorage.setItem(TOKEN_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    },

    async request(path, options) {
      const opts = options || {};
      const headers = { Accept: 'application/json' };
      if (opts.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (opts.auth !== false && this.accessToken) {
        headers.Authorization = 'Bearer ' + this.accessToken;
      }

      let response;
      try {
        response = await fetch(this.baseUrl + path, {
          method: opts.method || 'GET',
          headers: headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        });
      } catch (networkError) {
        throw new ApiError(
          'network.unreachable',
          'Cannot reach the Firo API at ' + this.baseUrl + '.',
          0,
          null,
        );
      }

      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (parseError) {
          throw new ApiError(
            'api.bad_response',
            'The API returned a malformed response.',
            response.status,
            null,
          );
        }
      }

      if (!response.ok) {
        const err = (payload && payload.error) || {};
        throw new ApiError(
          err.code || 'api.error',
          err.message || 'Request failed (' + response.status + ')',
          response.status,
          err.details || null,
        );
      }

      if (opts.raw) {
        return payload;
      }
      return payload ? payload.data : null;
    },

    // --- session -----------------------------------------------------------

    login(email, password) {
      return this.request('/v1/auth/login', {
        method: 'POST',
        body: { email: email, password: password },
        auth: false,
      });
    },

    me() {
      return this.request('/v1/auth/me');
    },

    // --- console -----------------------------------------------------------

    overview() {
      return this.request('/v1/admin/overview');
    },

    users(params) {
      return this.request('/v1/admin/users?' + query(params));
    },

    user(id) {
      return this.request('/v1/admin/users/' + encodeURIComponent(id));
    },

    setUserStatus(id, status) {
      return this.request('/v1/admin/users/' + encodeURIComponent(id) + '/status', {
        method: 'PUT',
        body: { status: status },
      });
    },

    setUserRoles(id, roles) {
      return this.request('/v1/admin/users/' + encodeURIComponent(id) + '/roles', {
        method: 'PUT',
        body: { roles: roles },
      });
    },

    content(params) {
      return this.request('/v1/admin/content?' + query(params));
    },

    createExperience(body) {
      return this.request('/v1/admin/content', { method: 'POST', body: body });
    },

    updateExperience(id, body) {
      return this.request('/v1/admin/content/' + encodeURIComponent(id), {
        method: 'PUT',
        body: body,
      });
    },

    deleteExperience(id) {
      return this.request('/v1/admin/content/' + encodeURIComponent(id), { method: 'DELETE' });
    },

    places() {
      return this.request('/v1/admin/places');
    },

    mapPoints() {
      return this.request('/v1/admin/map');
    },

    activity(since, limit) {
      const params = { limit: limit || 50 };
      if (since) {
        params.since = since;
      }
      return this.request('/v1/admin/activity?' + query(params));
    },

    audit(limit) {
      return this.request('/v1/admin/audit?' + query({ limit: limit || 50 }));
    },

    /**
     * Opens the live activity stream.
     *
     * Uses fetch rather than EventSource deliberately: EventSource cannot send
     * an Authorization header, so it would force the admin token into the query
     * string, where it lands in access logs and browser history. Returns a
     * handle with close().
     */
    openStream(handlers) {
      const controller = new AbortController();
      const url = this.baseUrl + '/v1/admin/stream';
      const token = this.accessToken;

      (async () => {
        try {
          const response = await fetch(url, {
            headers: { Accept: 'text/event-stream', Authorization: 'Bearer ' + token },
            signal: controller.signal,
          });
          if (!response.ok || !response.body) {
            throw new Error('stream unavailable (' + response.status + ')');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) {
              break;
            }
            buffer += decoder.decode(chunk.value, { stream: true });

            // SSE frames are separated by a blank line.
            let split = buffer.indexOf('\n\n');
            while (split !== -1) {
              const frame = buffer.slice(0, split);
              buffer = buffer.slice(split + 2);
              const parsed = parseFrame(frame);
              if (parsed) {
                handlers.onEvent(parsed.event, parsed.data);
              }
              split = buffer.indexOf('\n\n');
            }
          }
          handlers.onClose && handlers.onClose(null);
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }
          handlers.onClose && handlers.onClose(error);
        }
      })();

      return {
        close() {
          controller.abort();
        },
      };
    },
  };

  function parseFrame(frame) {
    let event = 'message';
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) {
      return null;
    }
    try {
      return { event: event, data: JSON.parse(dataLines.join('\n')) };
    } catch (error) {
      return null;
    }
  }

  function query(params) {
    const search = new URLSearchParams();
    Object.keys(params || {}).forEach(function (key) {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    });
    return search.toString();
  }

  window.firoAdminApi = api;
})();
