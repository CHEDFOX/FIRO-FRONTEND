# Firo — operator console

A private dashboard for running Firo. Not part of the product, not something a
user ever sees.

```
Overview   headline numbers, 30-day trends, what the population likes
Users      every account, their Explorer DNA, their saves, moderation
Content    the catalogue — create and edit destinations without touching code
Map        every experience plotted, sized by how often it is saved
Live       signups, saves and interactions as they happen
Audit      every change made here, with the row before and after
```

## Running it

No build step, no dependencies. Serve the folder and open it.

```bash
cd admin
python3 -m http.server 4111
```

Open <http://127.0.0.1:4111>, set the API URL on the sign-in screen, and sign in
with an account that has the `admin` role.

To get that role, see `docs/ADMIN-CONSOLE.md` in the backend repo — the short
version is `ADMIN_EMAILS=you@yourdomain.com` before you register, or
`pnpm admin:grant you@yourdomain.com` on the server afterwards.

> **Do not deploy this to a public URL.** It shows every account's email,
> behaviour and taste profile. Running it locally against the production API is
> the intended setup: the data comes over HTTPS, and the page itself never
> leaves your machine.

## Files

| File | |
|---|---|
| `index.html` | Shell: the sign-in card and the tab bar |
| `admin-api.js` | API client — envelope handling, the SSE stream, token storage |
| `admin-ui.js` | DOM builder, formatting, the trend chart and the world map |
| `admin.js` | Router and the six views |
| `admin.css` | Styling |
| `world-land.js` | Coastlines as one SVG path (generated; see below) |

No framework and no chart library, on purpose. The console is a handful of
tables and two drawings — a dependency tree would cost more than it saves, and
every number on screen can be traced to the line that produced it.

### The map

Equirectangular, drawn in SVG with the coastlines embedded in `world-land.js`.
No tiles, no map library, no network call, so it renders identically offline,
behind a corporate proxy, and in a screenshot.

The land data is generated from Natural Earth 1:110m via
[`world-atlas`](https://github.com/topojson/world-atlas) (public domain),
projected with the same formula `admin-ui.js` uses for pins —
`x = (lng + 180) × 2`, `y = (90 − lat) × 2` into a 720×360 viewBox — so the two
always line up. Regenerate only if that projection changes.

Dot **area** scales with saves rather than radius: a radius-scaled dot
exaggerates a popular place by the square of its popularity.

### Live updates

The Live tab opens `GET /v1/admin/stream` with `fetch` and reads the
Server-Sent Events off the response body. It uses `fetch` rather than
`EventSource` because `EventSource` cannot set an `Authorization` header, and
the alternative — an admin token in the query string — ends up in access logs
and browser history.

If streaming is blocked (some proxies buffer responses and the stream never
arrives), it falls back to polling `/v1/admin/activity` every 5 seconds and says
so in the header, rather than silently freezing.

## Relationship to `web/`

`web/` is the product client — the onboarding journey and the feed. This is a
separate app with its own API client and its own token storage key
(`firo.admin.accessToken`), so signing into one has no effect on the other and
admin credentials never end up in the product bundle.
