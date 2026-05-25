import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
type Props = { visible: boolean };

/**
 * Lightweight strip when connectivity drops mid-session (SPA may still render from memory/cache).
 */
export function OfflineBanner({ visible }: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  return (
    <View
      accessibilityRole="alert"
      pointerEvents="none"
      style={[styles.bar, { top: Math.max(insets.top, 6) }]}>
      <Text style={styles.copy}>Offline — reconnect to sync with CASIFLY.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    right: 12,
    left: 12,
    zIndex: 20,
    backgroundColor: 'rgba(239,68,68,0.95)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  copy: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
