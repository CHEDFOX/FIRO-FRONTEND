# Firo — web client (end-to-end prototype)

A deliberately plain web client that proves the whole Firo journey works against
the real backend:

```
welcome → sign up → onboarding taste picker → Explorer DNA → personalised feed → save
```

## Why this exists

Two reasons, both practical:

1. **It is verifiable.** It runs in a real browser, so the full flow can be
   driven and asserted automatically — unlike hand-written mobile code that
   cannot be compiled in a headless environment.
2. **It is not throwaway.** The architecture always planned a web surface, and
   because the backend decides *what* to show, this client and the future mobile
   client consume the identical API.

**The premium visual design is the final phase of the project.** This styling is
intentionally restrained; judge the behaviour, not the look.

## Running it

Start the backend first (default `http://127.0.0.1:3000`):

```bash
cd ../../FIRO-BACKEND
pnpm build && CORS_ORIGINS="*" JWT_SECRET="dev-secret-at-least-16-chars" node dist/main.js
```

Then serve these files from any static server:

```bash
cd web
python3 -m http.server 4173 --bind 127.0.0.1
# open http://127.0.0.1:4173
```

To point at a deployed API, either set it before the scripts load:

```html
<script>window.FIRO_API_BASE = 'https://your-api-host';</script>
```

or from the browser console: `localStorage.setItem('firo.apiBase', 'https://your-api-host')`.

## Files

| File | Role |
|---|---|
| `index.html` | Shell and script order |
| `api.js` | API client — envelope handling, the canonical error model, token storage |
| `app.js` | The screen flow, as a small explicit state machine |
| `styles.css` | Minimal dark styling |

## Two things worth knowing

- **`/health` is not enveloped.** Every other endpoint returns
  `{ data, meta, error }`, but `/health` deliberately returns a plain body for
  load balancers. The client passes `raw: true` for it; assuming otherwise
  silently breaks the connection check.
- **Render from state, never mutate nodes.** Any `setState` rebuilds the DOM, so
  a handler that writes directly onto a captured element loses the change on the
  next render. Saved ids live in state for exactly this reason.

## Not implemented here

Offline caching, the 3D world map, search, deep links, accessibility polish, and
the real visual identity. This is the flow, not the product.
