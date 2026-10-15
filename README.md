# Slate

A planner for tasks, calendar, habits, and countdowns. The website and the iPhone/iPad app share one passphrase-locked store on Cloudflare R2.

## Web

Requires Node.js. From `web/`:

```bash
cp .env.example .env.local
node --experimental-strip-types scripts/hash-passphrase.mjs "your passphrase"
npm install
npm run dev
```

Put the printed `scrypt$...` value in `SYNC_PASSPHRASE_HASH`. Fill in `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `SESSION_SECRET`. Google Calendar is optional. See the comments in `.env.example` for the OAuth redirect.

The app is at [http://localhost:3000](http://localhost:3000). Unlock with the same passphrase. `web/.env.local` and `web/.passphrase` stay out of git.

```bash
npm test
npx tsc --noEmit
```

## iOS

Open `ios/Slate.xcodeproj` in Xcode and run the Slate scheme. The app talks to the web server. On a simulator, `http://127.0.0.1:3000` is the default. On a phone or iPad, set Server in the app to a reachable address for this Mac. Use the same passphrase.

## What syncs

Lists, tasks, tags, habits, habit check-ins, and countdowns sync through `/api/sync`. A Google Calendar refresh token, when you sign in, is stored encrypted on the server so every unlocked device can read the same calendars.
