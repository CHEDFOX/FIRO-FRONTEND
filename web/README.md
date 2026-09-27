# Firo — web client

One place a day. Nothing to buy.

This is the product client for Firo's daily ritual. It is plain HTML, CSS and
JavaScript with no build step, and it talks to the real backend.

```
first visit   Open → four choices → Forming → When → Keep your DNA? → Today
every day     Arrive → Today → (read more) → Days · World
```

## The screens

| Screen | What happens |
|---|---|
| **Open** | "One place a day. Nothing to buy." Tapping *Begin* creates a guest account (`POST /v1/auth/guest`), so there is no sign-up wall. |
| **Four choices** | Big picture cards from `GET /v1/onboarding`. Two-option steps move on by themselves after a tap; any step can be skipped. |
| **Forming** | The first sketch of the user's taste in a few words (`sketch` from `POST /v1/onboarding/answers`). |
| **When** | Morning, evening, or "I'll come by myself" (`PUT /v1/me/rhythm`). |
| **Keep your DNA?** | Optional email and password (`POST /v1/auth/claim`). The guest account becomes a real one in place: same id, same profile, same days. |
| **Arrive** | The first open of a new day shows only the date and one sentence ("Somewhere cold and quiet, today.") until the user taps. |
| **Today** | The day's place, full screen (`GET /v1/today`). One circle to keep it. One quiet line saying why it was chosen. |
| **Read more** | The story, the best season, what it feels like, where it is. Nothing to book. Time spent here is sent as a `dwell` signal. |
| **Days** | The month as a quilt of colours, one per day opened, with a dot for each kept place and one sentence about the month (`GET /v1/days`). |
| **World** | Kept places on a map, one sentence about their shape, and one question about tomorrow. Answering *Yes* steers tomorrow's pick (`PUT /v1/tomorrow`). Settings live here too. |

The words on these screens (greeting, reason, the month's sentence, the
world's question) come from the server, so they can be improved without
shipping a new client.

The colours follow the time of day: warmer in the morning, dimmer and cooler
in the evening and at night.

Places without a photograph yet are drawn as a landscape from their tags
(`landscape.js`). An uploaded image replaces the drawing automatically.

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

To point at another API, open the page once with `?api=`:

```
http://127.0.0.1:4173/?api=https://api.your-domain.com
```

It is remembered on that device. You can also set `window.FIRO_API_BASE`
before the scripts load.

## Files

| File | Role |
|---|---|
| `index.html` | Shell, fonts, script order |
| `api.js` | API client: envelope handling, error codes, token storage, silent refresh |
| `app.js` | Every screen, as a small state machine |
| `landscape.js` | Drawn landscapes for places without photographs |
| `world-land.js` | World outline for the map |
| `styles.css` | The look: warm dark ground, Instrument Serif and Public Sans |

## Not built yet

- **Notifications.** The chosen time is stored, but nothing sends a message
  yet. That needs push credentials (APNs and FCM) or a web push setup.
- **Sign in with Apple or Google.** Needs developer accounts and keys. Email
  and password work today.
