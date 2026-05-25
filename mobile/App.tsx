import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, type ApiUser } from './lib/api';
import { getStoredToken } from './lib/authToken';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txnCount, setTxnCount] = useState<number | null>(null);

  const loadDashboard = useCallback(async () => {
    const rows = await api.getTransactions();
    setTxnCount(Array.isArray(rows) ? rows.length : 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getStoredToken();
        if (!token) return;
        const me = await api.getMe();
        if (!cancelled) {
          setUser(me);
          await loadDashboard();
        }
      } catch {
        await api.logout();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  async function onLogin() {
    setError(null);
    setLoading(true);
    try {
      const { user: u } = await api.login(email.trim(), password);
      setUser(u);
      setPassword('');
      await loadDashboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    setTxnCount(null);
    await api.logout();
    setUser(null);
  }

  if (booting) {
    return (
      <View style={[styles.centered, styles.screen]}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.muted}>Loading session…</Text>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!user) {
    return (
      <KeyboardAvoidingView
        style={[styles.screen, styles.centered]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <StatusBar style="light" />
        <View style={styles.card}>
          <Text style={styles.title}>Casifly</Text>
          <Text style={styles.subtitle}>Same account and data as the web app</Text>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#64748b"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#64748b"
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={onLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>
          <Text style={styles.hint}>
            API: {api.getBaseUrl()}
            {'\n'}
            Android emulator often needs http://10.0.2.2:3001/api — set EXPO_PUBLIC_API_URL.
          </Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.screen, styles.homeContent]} keyboardShouldPersistTaps="handled">
      <StatusBar style="light" />
      <Text style={styles.title}>Casifly</Text>
      <Text style={styles.welcome}>Signed in as {user.name}</Text>
      <Text style={styles.meta}>
        {user.email} · {user.role}
      </Text>
      <View style={styles.statCard}>
        <Text style={styles.statLabel}>Transactions (from server)</Text>
        <Text style={styles.statValue}>{txnCount === null ? '—' : String(txnCount)}</Text>
        <Text style={styles.muted}>Matches web when using the same backend and login.</Text>
      </View>
      <Pressable style={styles.secondaryButton} onPress={loadDashboard}>
        <Text style={styles.secondaryButtonText}>Refresh</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={onLogout}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: '#0f172a',
    padding: 24,
  },
  centered: {
    justifyContent: 'center',
  },
  homeContent: {
    paddingTop: 56,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    marginBottom: 24,
  },
  welcome: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e2e8f0',
    marginTop: 8,
  },
  meta: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#f8fafc',
    marginBottom: 14,
    backgroundColor: '#1e293b',
  },
  button: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#475569',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: '#fca5a5',
    marginBottom: 8,
    fontSize: 14,
  },
  hint: {
    marginTop: 20,
    fontSize: 12,
    color: '#64748b',
    lineHeight: 18,
  },
  muted: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 12,
  },
  statCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 6,
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '700',
  },
});
