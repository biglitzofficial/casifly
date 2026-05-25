import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { resolveWebsiteUrl } from '../config/urls';
import { brandColors } from '../constants/theme';
import { OfflineBanner } from '../components/OfflineBanner';
import { PageLoadSpinner } from '../components/PageLoadSpinner';
import { SiteUnavailableNotice } from '../components/SiteUnavailableNotice';
import { useNetConnectivity } from '../hooks/useNetConnectivity';

/**
 * Human-readable copy for common Chromium failures (DNS mismatch is frequent when the APK default URL was never swapped).
 */
function webLoadFailureMessage(rawDescription: string | undefined, attemptedUrl: string): string {
  const raw = (rawDescription || '').trim();
  if (/ERR_NAME_NOT_RESOLVED/i.test(raw)) {
    return `DNS lookup failed (${raw}). This build loads “${attemptedUrl}”—that host does not exist on the public internet or DNS is not set. Set your real site in app.config.ts (DEFAULT_WEB_URL) or EXPO_PUBLIC_WEB_URL for EAS, then rebuild the APK. See CONFIGURE_WEB_URL_FOR_APK.md.`;
  }
  if (/ERR_CONNECTION_REFUSED/i.test(raw)) {
    return `Connection refused (${raw}). Check that “${attemptedUrl}” is reachable with HTTPS from a normal browser.`;
  }
  if (/ERR_CERT_/i.test(raw) || /SSL/i.test(raw)) {
    return `TLS / certificate problem (${raw}). Use a valid HTTPS certificate for “${attemptedUrl}”.`;
  }
  return raw || 'Network connection lost while loading CASIFLY.';
}

/**
 * Loads the CASIFLY web app inside a managed Web shell (Safe Area, IME, PTR, connectivity, splash hand-off).
 */
export default function CasiflyWebPortal() {
  const websiteUrl = resolveWebsiteUrl();
  const { height } = useWindowDimensions();
  const webRef = useRef<WebView>(null);
  /** Hardware back pops in-page history instead of exiting when possible. */
  const canGoBackRef = useRef(false);

  const { snapshot, definitelyOffline, refreshNetworkState } = useNetConnectivity();
  const connectivityKnown = snapshot !== null;

  const [transportErrorDescription, setTransportErrorDescription] = useState<string | null>(null);
  const [httpFailureSummary, setHttpFailureSummary] = useState<string | null>(null);
  /** First meaningful paint / navigation finished — drives splash dismissal + overlay spinner timing. */
  const [initialLoadCommitted, setInitialLoadCommitted] = useState(false);
  /** Pull-to-refresh lifecycle (released when `reload` settles). */
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);

  const blockingColdStartOffline = definitelyOffline && !initialLoadCommitted;
  const fatalSiteFailure = !!(transportErrorDescription || httpFailureSummary);

  const hideSplash = useCallback(async () => {
    try {
      await SplashScreen.hideAsync();
    } catch {
      /* Splash may already be hidden — benign in Expo Go / reload paths. */
    }
  }, []);

  /** Only evaluate offline gating once NetInfo has delivered its first snapshot. */
  useEffect(() => {
    if (!connectivityKnown) return;
    if (blockingColdStartOffline || fatalSiteFailure || initialLoadCommitted) {
      void hideSplash();
    }
  }, [
    blockingColdStartOffline,
    connectivityKnown,
    fatalSiteFailure,
    hideSplash,
    initialLoadCommitted,
  ]);

  /** Safety valve so the splash overlay never survives a hung TLS handshake indefinitely. */
  useEffect(() => {
    const t = setTimeout(() => void hideSplash(), 24000);
    return () => clearTimeout(t);
  }, [hideSplash]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  /** Native refresh gesture — verifies reachability before asking WebKit/Chromium to reload. */
  const handlePullRefresh = async () => {
    setPullRefreshing(true);
    const snapshot = await refreshNetworkState();
    const reachable = snapshot.isConnected === true && snapshot.isInternetReachable !== false;

    if (!reachable) {
      setPullRefreshing(false);
      return;
    }

    setTransportErrorDescription(null);
    setHttpFailureSummary(null);
    webRef.current?.reload();
  };

  /** Full-screen retries after either transport or HTTP failures. */
  const handleRecoverFromFatal = async () => {
    setRetryBusy(true);
    try {
      await refreshNetworkState();
      setTransportErrorDescription(null);
      setHttpFailureSummary(null);
      webRef.current?.reload();
    } finally {
      setRetryBusy(false);
    }
  };

  const handleColdStartNetworkRetry = async () => {
    setRetryBusy(true);
    try {
      await refreshNetworkState();
    } finally {
      setRetryBusy(false);
    }
  };

  const showBusyOverlay =
    connectivityKnown &&
    !fatalSiteFailure &&
    !initialLoadCommitted &&
    !blockingColdStartOffline;

  if (!connectivityKnown) {
    return (
      <KeyboardAvoidingView
        style={styles.keyboardHost}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.shell} edges={['top', 'bottom', 'left', 'right']}>
          {/* Native splash (Expo splash screen) carries the UX here — DOM not mounted yet. */}
          <StatusBar style="light" />
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardHost}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.shell} edges={['top', 'bottom', 'left', 'right']}>
        {/* Light icons on saturated indigo — matches adaptive icon + splash framing. */}
        <StatusBar style="light" />

        {/* Mid-session airplane mode / flaky Wi‑Fi: keep cached DOM while notifying the operator. */}
        {!blockingColdStartOffline && (
          <OfflineBanner visible={definitelyOffline && initialLoadCommitted} />
        )}

        {blockingColdStartOffline ? (
          <SiteUnavailableNotice
            title="You’re offline"
            message="Connect to mobile data or Wi‑Fi, then retry to reach CASIFLY."
            busy={retryBusy}
            onRetry={handleColdStartNetworkRetry}
          />
        ) : (
          <>
            {fatalSiteFailure ? (
              <View style={styles.fatalLayer}>
                <SiteUnavailableNotice
                  title="CASIFLY is unreachable"
                  message={
                    transportErrorDescription ??
                    httpFailureSummary ??
                    'The server responded with an error.'
                  }
                  busy={retryBusy}
                  onRetry={handleRecoverFromFatal}
                />
              </View>
            ) : null}

            {/*
             * Nested ScrollView + RefreshControl mirrors common WebView wrappers. `nestedScrollEnabled`
             * is required so inner WebView gestures still propagate on Android.
             */}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[styles.scrollContent, { minHeight: height }]}
              refreshControl={
                <RefreshControl
                  refreshing={pullRefreshing}
                  onRefresh={() => void handlePullRefresh()}
                  tintColor={brandColors.surfaceText}
                  colors={[brandColors.surfaceText]}
                  progressBackgroundColor={brandColors.screenBgAlt}
                />
              }
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'on-drag' : 'none'}>
              <View style={[styles.webHost, { minHeight: height }]}>
                <WebView
                  ref={webRef}
                  source={{ uri: websiteUrl }}
                  style={[styles.web, fatalSiteFailure ? styles.webHiddenFatal : undefined]}
                  nestedScrollEnabled
                  /*
                   * `containerStyle` tints the native wrapper so Android never flashes Chromium’s pure white backdrop
                   * while HTML/CSS hydrate (before the SPA paints).
                   */
                  containerStyle={{ backgroundColor: brandColors.screenBg }}
                  /*
                   * Some corporate portals still downgrade mixed content — “compatibility” mirrors Chrome desktop defaults.
                   * Production CASIFLY is HTTPS-first; callers can swap via EXPO_PUBLIC_WEB_URL for staging.
                   */
                  mixedContentMode="compatibility"
                  javaScriptEnabled
                  domStorageEnabled
                  /*
                   * `false` avoids surprise external browser windows that bypass Safe Area & back handling —
                   * most OAuth setups still work inside the same JS window for same-origin SPA flows.
                   */
                  setSupportMultipleWindows={false}
                  allowsFullscreenVideo
                  mediaPlaybackRequiresUserAction={false}
                  allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
                  applicationNameForUserAgent={
                    Platform.OS === 'android'
                      ? 'CASIFLYMobile/1.0 Android'
                      : 'CASIFLYMobile/1.0 iOS'
                  }
                  onNavigationStateChange={(navState: WebViewNavigation) => {
                    canGoBackRef.current = navState.canGoBack ?? false;
                  }}
                  onLoadEnd={() => {
                    setInitialLoadCommitted(true);
                    setPullRefreshing(false);
                  }}
                  onError={(e) => {
                    setTransportErrorDescription(
                      webLoadFailureMessage(e.nativeEvent.description, websiteUrl),
                    );
                    setPullRefreshing(false);
                  }}
                  onHttpError={(e) => {
                    const { statusCode, description } = e.nativeEvent;
                    setHttpFailureSummary(
                      `Server issue (HTTP ${statusCode})${description ? ` — ${description}` : ''}`,
                    );
                    setPullRefreshing(false);
                  }}
                />
              </View>
            </ScrollView>

            <PageLoadSpinner visible={showBusyOverlay} />
          </>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardHost: {
    flex: 1,
    backgroundColor: brandColors.screenBg,
  },
  shell: {
    flex: 1,
    backgroundColor: brandColors.screenBg,
  },
  scroll: {
    flex: 1,
    backgroundColor: brandColors.screenBg,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: brandColors.screenBg,
  },
  webHost: {
    flex: 1,
    backgroundColor: brandColors.screenBg,
  },
  web: {
    flex: 1,
    backgroundColor: brandColors.screenBg,
  },
  webHiddenFatal: {
    opacity: 0,
  },
  fatalLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 25,
    backgroundColor: brandColors.screenBg,
    justifyContent: 'center',
  },
});
