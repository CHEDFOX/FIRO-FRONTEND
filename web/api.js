/**
 * Thin client for the Firo API.
 *
 * Mirrors the backend's response envelope ({ data, meta, error }) and its
 * canonical error model, so failures surface as real messages rather than
 * "something went wrong". Tokens live in localStorage for this prototype; a
 * production client uses platform secure storage.
 */
(function () {
  'use strict';

  const DEFAULT_BASE =
    window.FIRO_API_BASE || localStorage.getItem('firo.apiBase') || 'http://127.0.0.1:3000';

  const TOKEN_KEY = 'firo.accessToken';
  const REFRESH_KEY = 'firo.refreshToken';

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
    baseUrl: DEFAULT_BASE,
    ApiError,

    get accessToken() {
      return localStorage.getItem(TOKEN_KEY);
    },
    get refreshToken() {
      return localStorage.getItem(REFRESH_KEY);
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
        throw new ApiError('network.unreachable', 'Cannot reach the Firo API.', 0, null);
      }

      // 204 and other empty bodies are valid; do not attempt to parse them.
      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (parseError) {
          throw new ApiError('api.bad_response', 'The API returned a malformed response.', response.status, null);
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

      // Most endpoints return the standard envelope, but a few are deliberately
      // raw (/health is un-enveloped so load balancers get a plain body), so
      // callers say which they expect rather than us guessing.
      if (opts.raw) {
        return payload;
      }
      return payload ? payload.data : null;
    },

    // --- endpoints ---------------------------------------------------------

    health() {
      return this.request('/health', { auth: false, raw: true });
    },

    register(input) {
      return this.request('/v1/auth/register', { method: 'POST', body: input, auth: false });
    },

    login(input) {
      return this.request('/v1/auth/login', { method: 'POST', body: input, auth: false });
    },

    me() {
      return this.request('/v1/auth/me');
    },

    onboardingFlow() {
      return this.request('/v1/onboarding', { auth: false });
    },

    submitOnboarding(answers) {
      return this.request('/v1/onboarding/answers', {
        method: 'POST',
        body: { answers: answers },
      });
    },

    dna() {
      return this.request('/v1/me/dna');
    },

    feed(limit, sessionId) {
      const params = new URLSearchParams({ limit: String(limit || 12) });
      if (sessionId) {
        params.set('sessionId', sessionId);
      }
      return this.request('/v1/feed?' + params.toString());
    },

    signal(kind, experienceId, extra) {
      const body = Object.assign({ kind: kind, experienceId: experienceId }, extra || {});
      return this.request('/v1/signals', { method: 'POST', body: body });
    },

    save(experienceId) {
      return this.request('/v1/saves', { method: 'POST', body: { experienceId: experienceId } });
    },

    saves() {
      return this.request('/v1/saves');
    },
  };

  window.firoApi = api;
})();
