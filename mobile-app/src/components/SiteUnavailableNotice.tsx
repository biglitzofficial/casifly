import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { brandColors } from '../constants/theme';

type Props = {
  title: string;
  message: string;
  /** Primary action — typically retries network check or triggers a WebView reload. */
  onRetry: () => void | Promise<void>;
  busy?: boolean;
};

/**
 * Blocking state when navigation or transport fails (distinct from transient WebView quirks).
 */
export function SiteUnavailableNotice({ title, message, onRetry, busy }: Props) {
  return (
    <View style={styles.root} accessibilityLiveRegion="polite">
      {busy ? <ActivityIndicator accessibilityLabel="Please wait" size="large" color={brandColors.accent} /> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.button}
        onPress={() => void onRetry()}
        disabled={!!busy}>
        <Text style={styles.buttonLabel}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brandColors.screenBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 28,
  },
  title: {
    color: brandColors.surfaceText,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: brandColors.mutedText,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    backgroundColor: brandColors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    minWidth: 160,
  },
  buttonLabel: {
    color: brandColors.screenBgAlt,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 16,
  },
});
