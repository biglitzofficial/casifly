import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export function useNetConnectivity() {
  const [snapshot, setSnapshot] = useState<NetInfoState | null>(null);

  useEffect(() => {
    let active = true;
    void NetInfo.fetch().then((s) => {
      if (active) setSnapshot(s);
    });
    const unsubscribe = NetInfo.addEventListener((s) => setSnapshot(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  /**
   * Offline when disconnected, or Android/iOS positively reports “no Internet”.
   * `isInternetReachable === null` is common briefly after resume — treated as unknown (not offline).
   */
  const definitelyOffline =
    snapshot != null &&
    (snapshot.isConnected === false ||
      snapshot.isInternetReachable === false);

  async function refresh() {
    const next = await NetInfo.fetch();
    setSnapshot(next);
    return next;
  }

  return { snapshot, definitelyOffline, refreshNetworkState: refresh };
}
