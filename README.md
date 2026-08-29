# CeeBee — v1

Personal AI assistant: calendar, email, and reminders, with Gemini as the
brain. Built as a Next.js app that works as an installable PWA on both iOS
and Android.

## What's wired up so far

- Google OAuth (Calendar + Gmail scopes)
- Calendar: create events (with optional Google Meet link), list upcoming events
- Gmail: list recent emails, send email
- Gemini agent loop with tool-calling connecting all of the above
- A simple chat UI, installable as a home-screen app

## 1. Install dependencies

```bash
npm install
```

## 2. Set up your `.env`

Copy `.env.example` to `.env` and fill in your real values (you've already
got most of these from earlier setup):

```bash
cp .env.example .env
```

## 3. Set up Supabase

1. In your Supabase project, go to **SQL Editor -> New query**
2. Paste the contents of `supabase/schema.sql` and run it
3. This creates the `google_accounts` table CeeBee uses to store your Google
   refresh tokens

## 4. Update your Google OAuth redirect URI

In Google Cloud Console -> your OAuth Client -> Authorized redirect URIs, make
sure it matches whatever you set as `GOOGLE_REDIRECT_URI` in `.env`
(default: `http://localhost:3000/api/auth/google/callback`).

## 5. Run it locally

```bash
npm run dev
```

Visit `http://localhost:3000`.

## 6. Connect your Google account

Visit `http://localhost:3000/api/auth/google` -- this sends you through
Google's consent screen. Once approved, you'll be redirected back and your
refresh token gets stored in Supabase automatically.

To connect a second Google account later, visit
`/api/auth/google?label=work` (or any label you want) -- it'll be stored
separately and you can reference it by label later.

## 7. Try it

Back on the home page, try asking:
- "What's on my calendar today?"
- "Schedule a call with client@example.com tomorrow at 3pm with a Meet link"
- "Check my recent emails"

## Deploying (so it works on your phone too)

Once this works locally, deploy to **Vercel** (free tier is enough):

```bash
npm install -g vercel
vercel
```

Then add all your `.env` values as Environment Variables in the Vercel
project dashboard, and update `GOOGLE_REDIRECT_URI` (both in `.env` on
Vercel, and in Google Cloud Console) to your real deployed URL, e.g.
`https://ceebee.vercel.app/api/auth/google/callback`.

Once deployed, open the URL on your phone's browser and use "Add to Home
Screen" (iOS Safari) or the install prompt (Android Chrome) to install it
like a native app.

## What's NOT built yet (intentionally deferred)

- WhatsApp integration (dropped -- see project notes)
- Voice trigger (Siri Shortcuts / Android App Actions) -- these get set up
  outside the codebase once the app is deployed and has a real URL to point at
- Reminders/alarms beyond what Calendar events + notifications provide
- Multi-account UI (backend supports labeled accounts already; no account
  switcher in the UI yet)

## A note on the Gemini model

This uses `gemini-2.0-flash` in `src/lib/agent.ts` -- Google's free-tier
model. If you hit rate limits or want to try a newer version, that's the
line to change.
