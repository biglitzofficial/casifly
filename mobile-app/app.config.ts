/**
 * Default WebView URL for released APKs. Override with EXPO_PUBLIC_WEB_URL at build time if needed.
 * Hash matches the CASIFLY web app landing route (SPA).
 */
const DEFAULT_WEB_URL = 'https://casifly.biglitz.in/#home';

const websiteUrl =
  typeof process.env.EXPO_PUBLIC_WEB_URL === 'string' && process.env.EXPO_PUBLIC_WEB_URL.trim()
    ? process.env.EXPO_PUBLIC_WEB_URL.trim().replace(/\/$/, '')
    : DEFAULT_WEB_URL;

/** From `eas init` → @sudhikumaran/casifly-mobile (cannot be auto-written into TS config). Override via env in CI if needed. */
const EAS_PROJECT_ID_DEFAULT = '7217e151-73fc-4f8d-89ec-d0ac801bbd18';

const easProjectId =
  process.env.EXPO_PROJECT_ID ?? process.env.EAS_PROJECT_ID ?? EAS_PROJECT_ID_DEFAULT;

/**
 * Static + dynamic Expo config (splash framing lives on expo-splash-screen plugin below).
 */
const config = {
  name: 'CASIFLY',
  slug: 'casifly-mobile',
  version: '1.0.1',
  orientation: 'portrait',
  scheme: 'casifly',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',

  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.casifly.mobile',
    userInterfaceStyle: 'automatic',
  },

  android: {
    /** Bump this (or use EAS production `autoIncrement`) before each Play Store upload. */
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: '#312e81',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    package: 'com.casifly.mobile',
    // Production CASIFLY is HTTPS; enabling cleartext is only necessary for http:// dev URLs via EXPO_PUBLIC_WEB_URL.
    usesCleartextTraffic: websiteUrl.startsWith('http://'),
    predictiveBackGestureEnabled: false,
    // Shrinks/resizes layout when IME opens — important for long web forms inside WebView on Android.
    softwareKeyboardLayoutMode: 'resize',
  },

  web: {
    favicon: './assets/favicon.png',
  },

  extra: {
    websiteUrl,
    eas: {
      projectId: easProjectId,
    },
  },

  plugins: [
    [
      'expo-splash-screen',
      {
        backgroundColor: '#312e81',
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        dark: {
          backgroundColor: '#0f172a',
          image: './assets/splash-icon.png',
        },
      },
    ],
  ],
} satisfies Record<string, unknown>;

export default config;
