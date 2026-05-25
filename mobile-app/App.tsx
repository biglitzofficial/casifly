import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import CasiflyRoot from './src/CasiflyRoot';

// Keep Expo’s splash up until CASIFLY is ready — prevents an empty native frame flashing before WebView attaches.
void SplashScreen.preventAutoHideAsync();

export default function App() {
  return (
    <SafeAreaProvider>
      <CasiflyRoot />
    </SafeAreaProvider>
  );
}
