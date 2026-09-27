/**
 * Client for the Firo API.
 *
 * Mirrors the backend's envelope ({ data, meta, error }) and its error codes,
 * and refreshes the session silently: access tokens last fifteen minutes, and a
 * daily app opened each morning would otherwise greet its user with a sign-in
 * screen every single day.
 */
(function () {
  'use strict';

  const BASE_KEY = 'firo.apiBase';
  const TOKEN_KEY = 'firo.accessToken';
  const REFRESH_KEY = 'firo.refreshToken';

  function readStore(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      /* storage blocked: the session simply won't survive a reload */
    }
  }

  // `?api=https://api.example.com` points this client at a server and
  // remembers it — handy on a phone, where there is no console to type into.
  (function adoptApiFromQuery() {
    const fromQuery = new URLSearchParams(location.search).get('api');
    if (fromQuery) {
      writeStore(BASE_KEY, fromQuery.replace(/\/+$/, ''));
    }
  })();

  class ApiError extends Error {
    constructor(code, message, status, details) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }

  /** One refresh in flight at a time, shared by every request that hit a 401. */
  let refreshing = null;

  const api = {
    ApiError,

    get baseUrl() {
      return window.FIRO_API_BASE || readStore(BASE_KEY) || 'http://127.0.0.1:3000';
    },

    get accessToken() {
      return readStore(TOKEN_KEY);
    },

    get refreshToken() {
      return readStore(REFRESH_KEY);
    },

    get hasSession() {
      return Boolean(readStore(TOKEN_KEY) || readStore(REFRESH_KEY));
    },

    setTokens(tokens) {
      writeStore(TOKEN_KEY, tokens ? tokens.accessToken : null);
      writeStore(REFRESH_KEY, tokens ? tokens.refreshToken : null);
    },

    async request(path, options, isRetry) {
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
          'Firo is out of reach for a moment. Check your connection.',
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
          throw new ApiError('api.bad_response', 'Something came back garbled.', response.status, null);
        }
      }

      if (
        response.status === 401 &&
        opts.auth !== false &&
        !isRetry &&
        this.refreshToken &&
        path.indexOf('/v1/auth/') !== 0
      ) {
        const refreshed = await this.refresh();
        if (refreshed) {
          return this.request(path, options, true);
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

      return payload ? payload.data : null;
    },

    /** Returns true when the session was renewed, false when it is gone. */
    refresh() {
      if (!refreshing) {
        const refreshToken = this.refreshToken;
        refreshing = (async () => {
          try {
            const result = await this.request(
              '/v1/auth/refresh',
              { method: 'POST', body: { refreshToken: refreshToken }, auth: false },
              true,
            );
            this.setTokens(result.tokens);
            return true;
          } catch (error) {
            // A rejected refresh means the session is over (expired, revoked,
            // or reused elsewhere). Clearing it sends the user back to Open
            // instead of looping on 401s.
            this.setTokens(null);
            return false;
          } finally {
            refreshing = null;
          }
        })();
      }
      return refreshing;
    },

    // --- session -----------------------------------------------------------

    startGuest() {
      return this.request('/v1/auth/guest', {
        method: 'POST',
        body: { locale: navigator.language || 'en' },
        auth: false,
      });
    },

    claim(input) {
      return this.request('/v1/auth/claim', { method: 'POST', body: input });
    },

    login(email, password) {
      return this.request('/v1/auth/login', {
        method: 'POST',
        body: { email: email, password: password },
        auth: false,
      });
    },

    async logout() {
      const refreshToken = this.refreshToken;
      if (refreshToken) {
        await this.request('/v1/auth/logout', {
          method: 'POST',
          body: { refreshToken: refreshToken },
        }).catch(function () {
          /* signing out locally is what matters */
        });
      }
      this.setTokens(null);
    },

    me() {
      return this.request('/v1/auth/me');
    },

    // --- onboarding --------------------------------------------------------

    onboardingFlow() {
      return this.request('/v1/onboarding', { auth: false });
    },

    submitOnboarding(answers) {
      return this.request('/v1/onboarding/answers', { method: 'POST', body: { answers: answers } });
    },

    dna() {
      return this.request('/v1/me/dna');
    },

    // --- the ritual --------------------------------------------------------

    today(timeZone) {
      return this.request('/v1/today?tz=' + encodeURIComponent(timeZone));
    },

    days(month, timeZone) {
      const params = new URLSearchParams({ tz: timeZone });
      if (month) {
        params.set('month', month);
      }
      return this.request('/v1/days?' + params.toString());
    },

    world() {
      return this.request('/v1/world');
    },

    experience(idOrSlug) {
      return this.request('/v1/experiences/' + encodeURIComponent(idOrSlug), { auth: false });
    },

    setRhythm(mode, timeZone) {
      return this.request('/v1/me/rhythm', {
        method: 'PUT',
        body: { mode: mode, tz: timeZone },
      });
    },

    rhythm() {
      return this.request('/v1/me/rhythm');
    },

    setTomorrow(surprise, toward) {
      return this.request('/v1/tomorrow', {
        method: 'PUT',
        body: { surprise: surprise, toward: toward || null },
      });
    },

    keep(experienceId) {
      return this.request('/v1/saves', { method: 'POST', body: { experienceId: experienceId } });
    },

    unkeep(experienceId) {
      return this.request('/v1/saves/' + encodeURIComponent(experienceId), { method: 'DELETE' });
    },

    signal(kind, experienceId, extra) {
      const body = Object.assign({ kind: kind, experienceId: experienceId }, extra || {});
      // Signals are how the engine learns; losing one must never interrupt the
      // person, so failures are swallowed here rather than surfaced.
      return this.request('/v1/signals', { method: 'POST', body: body }).catch(function () {
        return null;
      });
    },
  };

  window.firoApi = api;
})();
