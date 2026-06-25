import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthInput } from '@/components/AuthInput';
import { FormErrorBanner } from '@/components/FormErrorBanner';
import { CheckGlyph, Chevron } from '@/components/Glyphs';
import { GradientButton } from '@/components/GradientButton';
import { Colors, Radius } from '@/constants/theme';
import { isValidEmail } from '@/lib/validation';
import { useAuth } from '@/store/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { requestReset } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const goLogin = () => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'));

  const submit = async () => {
    if (submitting) return;
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      await requestReset(email.trim());
      setSent(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not send the reset link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={goLogin} style={styles.back} hitSlop={8}>
          <Chevron direction="left" color="#C9C9D6" size={18} />
        </Pressable>

        {sent ? (
          <View style={styles.sentWrap}>
            <View style={styles.checkCircle}>
              <CheckGlyph color={Colors.green} size={38} />
            </View>
            <Text style={styles.sentTitle}>Check your inbox</Text>
            <Text style={styles.sentSub}>
              We sent a reset link to <Text style={styles.email}>{email.trim()}</Text>. Follow it to
              set a new password.
            </Text>
            <GradientButton label="Back to sign in" onPress={goLogin} height={56} style={styles.submit} />
          </View>
        ) : (
          <View>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>
              Enter the email tied to your account and we&apos;ll send a reset link.
            </Text>

            <FormErrorBanner message={formError} />

            <View style={styles.form}>
              <AuthInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="go"
                onSubmitEditing={submit}
                error={error}
              />
            </View>

            <GradientButton
              label={submitting ? 'Sending…' : 'Send reset link'}
              onPress={submit}
              height={56}
              disabled={submitting}
              style={styles.submit}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: 26, flexGrow: 1 },
  back: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: { fontSize: 30, fontWeight: '600', color: Colors.textBright, letterSpacing: -0.4 },
  subtitle: { fontSize: 15, lineHeight: 22, color: Colors.textSecondary, marginTop: 9 },

  form: { marginTop: 30 },
  submit: { marginTop: 24 },

  sentWrap: { alignItems: 'center', paddingTop: 30 },
  checkCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(52,211,153,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  sentTitle: { fontSize: 26, fontWeight: '600', color: Colors.textBright },
  sentSub: {
    fontSize: 15,
    lineHeight: 24,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 290,
  },
  email: { color: '#C9C9D6' },
});
