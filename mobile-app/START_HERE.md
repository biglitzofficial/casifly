# Get the CASIFLY app running — follow in order

## Part 1 — Already done on this machine ✓

- Dependencies installed (`npm install` in `mobile-app`)
- TypeScript builds clean (`npm run lint:tsc`)
- Expo project config is valid

## Part 2 — You run this (every time)

**1.** Open PowerShell:

```powershell
cd D:\casifly\mobile-app
npx expo start
```

**2.** Wait until you see the Metro menu (QR code in terminal + URL).

**3.** Open the app on a device:

| Option | What to do |
|--------|------------|
| **Physical Android phone** | Install **[Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)** from Play Store → scan the QR from the terminal (use *Camera*, or Expo Go → *Scan QR*). |
| **Physical iPhone** | Install Expo Go from App Store → camera scan (same LAN as PC). |
| **Android Emulator** | With emulator running from Android Studio → in the Expo terminal press **`a`**. |

If the QR scan fails because of Wi‑Fi isolation or firewall:

```powershell
npx expo start --tunnel
```

(Tunnel needs a Expo account login when prompted.)

## Part 3 — Make sure the site loads

By default the app opens **`https://app.casifly.app`** (from your repo’s `DEPLOY.md`).

- If that site is **live** → the WebView should show CASIFLY.
- If you need **staging** or **another URL**, create a file **`D:\casifly\mobile-app\.env`**:

```
EXPO_PUBLIC_WEB_URL=https://your-real-url.example
```

Stop Metro (`Ctrl+C`) and run `npx expo start` again.

For a **local Vite server** from your PC (`http://192.168.1.xx:5173`), use your PC’s LAN IP and port; cleartext is allowed when the URL starts with **`http://`**.

## Part 4 — Installable APK (standalone — not Expo Go)

Expo Go is only for development. For an **installable .apk**:

**Follow:** [`INSTALL_ANDROID_APK.md`](INSTALL_ANDROID_APK.md).

```powershell
cd D:\casifly\mobile-app
npx expo login
npx eas-cli init
npm run eas:apk:preview
```

When the build completes, download the APK from **expo.dev** → transfer to phone → Install.

---

**Troubleshooting:** Blank screen usually means URL unreachable from the phone, or HTTPS/certificate problems. Try the same URL in the phone browser first.
