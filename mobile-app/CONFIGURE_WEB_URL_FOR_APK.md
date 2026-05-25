# Fixing `ERR_NAME_NOT_RESOLVED` (or “CASIFLY is unreachable”) in the installed APK

`net::ERR_NAME_NOT_RESOLVED` means Android **could not look up the hostname** in DNS. The URL compiled into your APK does not point at a real, public website (or DNS is not set up yet).

The template used **`https://app.casifly.app`** as a **documentation example** (see root `DEPLOY.md`). That host **does not resolve** unless **you** own DNS and point it at your hosting.

## 1. Confirm the URL on your phone

On the Android device **Chrome**:

- Open whatever URL your deployment actually uses (Railway preview URL, Vercel, Render, custom domain, etc.).
- If Chrome cannot open it either, fix hosting/DNS **before** rebuilding the APK.

## 2. Point the APK at your real URL

Metro/EAS bake the URL **at build time** using, in priority order:

1. **`process.env.EXPO_PUBLIC_WEB_URL`**
2. **`extra.websiteUrl`** from `app.config.ts`
3. Defaults in code

### Option A — Quickest for local APK builds

Edit **`app.config.ts`** and change:

```ts
const DEFAULT_WEB_URL = 'https://YOUR-REAL-DEPLOYED-SITE.EXAMPLE/';
```

(and remove the typo trailing slash inconsistency — we strip trailing slashes, but prefer no trailing slash)

Then rebuild:

```powershell
npm run eas:apk:preview
```

### Option B — Use Expo / EAS environment variables (recommended for teams)

1. Expo dashboard → your **casifly-mobile** project → **Environment variables**
2. Add **`EXPO_PUBLIC_WEB_URL`** = your full `https://…` URL
3. Scope it to **preview** (and **production** if you use that profile)
4. Run a new EAS build

> **Note:** A file named **`.env` on your PC is usually gitignored**, so it is **not** uploaded to EAS unless you configure that flow. Rely on **dashboard env vars** or edit **`app.config.ts`** committed value.

### Option C — `eas.json` (only if you are OK committing the URL)

Add under the profile:

```json
"preview": {
  "distribution": "internal",
  "env": {
    "EXPO_PUBLIC_WEB_URL": "https://your-real-site.example"
  },
  "android": { "buildType": "apk" }
}
```

## 3. HTTP (non-HTTPS) dev URLs

If the URL starts with **`http://`**, the app enables Android cleartext in `app.config.ts`. Production should still use **`https://`** when possible.

## 4. Reinstall

Each APK embeds its own URL—you must install the **new** APK after rebuilding.
