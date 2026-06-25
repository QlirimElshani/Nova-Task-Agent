import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckGlyph, SendGlyph } from '@/components/Glyphs';
import { GradientButton } from '@/components/GradientButton';
import { NovaMark } from '@/components/NovaMark';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/store/auth';

const SLIDES = [
  {
    icon: <SendGlyph color={Colors.primaryLight} size={40} />,
    title: 'Just say it',
    sub: "Type a task the way you'd text a friend. No forms, no fuss.",
  },
  {
    icon: <NovaMark size={56} radius={18} />,
    title: 'Nova builds it',
    sub: 'Your words become a structured task - title, details and a date - in seconds.',
  },
  {
    icon: <CheckGlyph color={Colors.primaryLight} size={42} />,
    title: 'Stay on track',
    sub: 'Check things off, search and filter. Your whole day, organized.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useAuth();
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  const finish = async () => {
    await completeOnboarding();
    router.replace('/(auth)/login');
  };

  const next = () => (last ? finish() : setIndex((i) => i + 1));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.skipRow}>
        <Pressable onPress={finish} hitSlop={10}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.iconHalo}>
          <View style={styles.iconCard}>{slide.icon}</View>
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.sub}>{slide.sub}</Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <GradientButton label={last ? 'Get started' : 'Continue'} onPress={next} height={56} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 26 },
  skipRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  skip: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500', padding: 6 },

  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconHalo: {
    width: 150,
    height: 150,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 46,
    backgroundColor: 'rgba(124,92,255,0.12)',
  },
  iconCard: {
    width: 118,
    height: 118,
    borderRadius: 30,
    backgroundColor: 'rgba(18,17,26,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 28, fontWeight: '600', color: Colors.textBright, textAlign: 'center', letterSpacing: -0.4 },
  sub: {
    fontSize: 15.5,
    lineHeight: 24,
    color: '#9A9AAB',
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 280,
  },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 26 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)' },
  dotActive: { width: 22, backgroundColor: Colors.primary },
});
