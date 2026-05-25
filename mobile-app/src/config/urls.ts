import Constants from 'expo-constants';

/** Fallback when env/config embed are missing — must be a hostname that resolves for your APK users. */

const DOCUMENTED_DEFAULT = 'https://casifly.biglitz.in/#home';

/**
 * Target URL for the embedded SPA. Expo inlines EXPO_PUBLIC_* at bundle time,
 * while `app.config.ts` also embeds `extra.websiteUrl` for deterministic release builds.
 */
export function resolveWebsiteUrl(): string {
  const fromEnv =
    typeof process.env.EXPO_PUBLIC_WEB_URL === 'string' ? process.env.EXPO_PUBLIC_WEB_URL.trim() : '';
  const embedded = Constants.expoConfig?.extra?.websiteUrl;
  const fromExtra = typeof embedded === 'string' && embedded.trim() ? embedded.trim() : '';
  const base = fromEnv || fromExtra || DOCUMENTED_DEFAULT;
  return base.replace(/\/$/, '');
}
