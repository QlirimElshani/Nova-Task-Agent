import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { NovaMark } from '@/components/NovaMark';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/store/auth';

const SPLASH_MIN_MS = 1400;

/**
 * Splash - shown on every launch. Once the persisted auth state resolves (and a
 * short minimum has elapsed so the brand moment is visible), it redirects:
 *   signed in            → the app (tabs)
 *   onboarding not seen  → onboarding
 *   otherwise            → login
 */
export default function SplashScreen() {
  const router = useRouter();
  const { status, onboardingDone } = useAuth();
  const [minElapsed, setMinElapsed] = useState(false);
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [pulse]);

  useEffect(() => {
    // Wait until the minimum splash time has elapsed AND both the session and
    // the onboarding flag have resolved - never redirect on partial state.
    if (!minElapsed || status === 'loading' || onboardingDone === null) return;
    if (status === 'signedIn') router.replace('/(tabs)');
    else if (!onboardingDone) router.replace('/(auth)/onboarding');
    else router.replace('/(auth)/login');
  }, [minElapsed, status, onboardingDone, router]);

  return (
    <Pressable style={styles.root} onPress={() => setMinElapsed(true)}>
      {/* Ambient halo centered behind the whole brand group, so its soft edge
          never bisects the tagline. */}
      <Animated.View style={[styles.glow, { opacity: pulse }]} pointerEvents="none" />
      <View style={styles.brand}>
        <NovaMark size={78} radius={24} />
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Nova</Text>
          <Text style={styles.sub}>Your AI task companion</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  // Centered in the root (same center as the brand group). Large and soft so it
  // reads as an ambient glow rather than a hard circle cutting across the text.
  glow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(124,92,255,0.22)',
  },
  brand: { alignItems: 'center', gap: 26 },
  titleWrap: { alignItems: 'center' },
  title: { fontSize: 38, fontWeight: '600', color: Colors.textBright, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: Colors.textSecondary, marginTop: 6, textAlign: 'center' },
});
