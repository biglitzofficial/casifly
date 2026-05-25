import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { brandColors } from '../constants/theme';

type Props = { visible: boolean };

/**
 * Spinner shown until the SPA reaches its first `onLoadEnd` event (splash matches same background color).
 */
export function PageLoadSpinner({ visible }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <ActivityIndicator size="large" color={brandColors.surfaceText} accessibilityLabel="Loading CASIFLY" />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brandColors.screenBg,
    zIndex: 5,
  },
});
