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

`web/.env.local` is the only place these values live. Never commit it.

| Variable | Required | What it is |
| --- | --- | --- |
| `R2_ENDPOINT` | yes | Cloudflare R2 S3 endpoint |
| `R2_BUCKET` | yes | Bucket name (`void` in `.env.example`) |
| `R2_ACCESS_KEY_ID` | yes | R2 access key |
| `R2_SECRET_ACCESS_KEY` | yes | R2 secret key |
| `SYNC_PASSPHRASE_HASH` | yes | Output of the hash command above |
| `SESSION_SECRET` | yes | Random string that signs the unlock cookie. `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | no | Google Calendar OAuth client |
| `GOOGLE_CLIENT_SECRET` | no | Matching OAuth secret. Stays on the server |

Google Calendar needs an authorized JavaScript origin of `http://localhost:3000` and a redirect URI of `http://localhost:3000/api/google/callback`. Add the same callback path for any other origin you sign in from.

The app is at [http://localhost:3000](http://localhost:3000). Unlock with the same passphrase. `web/.env.local` and `web/.passphrase` stay out of git.

```bash
npm test
npx tsc --noEmit
```

## iOS

Open `ios/Slate.xcodeproj` in Xcode and run the Slate scheme. The app talks to the web server. On a simulator, `http://127.0.0.1:3000` is the default. On a phone or iPad, set Server in the app to a reachable address for this Mac. Use the same passphrase.

## What syncs

Lists, tasks, tags, habits, habit check-ins, and countdowns sync through `/api/sync`. A Google Calendar refresh token, when you sign in, is stored encrypted on the server so every unlocked device can read the same calendars.
