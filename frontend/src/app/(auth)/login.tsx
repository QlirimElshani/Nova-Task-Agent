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

import { ApiError } from '@/lib/api';
import { AuthInput } from '@/components/AuthInput';
import { FormErrorBanner } from '@/components/FormErrorBanner';
import { GradientButton } from '@/components/GradientButton';
import { NovaMark } from '@/components/NovaMark';
import { Colors } from '@/constants/theme';
import { isValidEmail, MIN_PASSWORD } from '@/lib/validation';
import { useAuth } from '@/store/auth';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    const next: typeof errors = {};
    if (!isValidEmail(email)) next.email = 'Enter a valid email address.';
    if (password.length < MIN_PASSWORD)
      next.password = `Password must be at least ${MIN_PASSWORD} characters.`;
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await signIn({ email: email.trim(), password });
      // The (auth) layout redirects to the app once signed in.
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not sign in.';
      // An invalid email/password (401) belongs under the password field where
      // the user is looking; a server/network problem (anything else) isn't tied
      // to a single field, so it goes in the banner above the form.
      if (e instanceof ApiError && e.status === 401) {
        setErrors({ password: message });
      } else {
        setFormError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled">
        <NovaMark size={52} radius={16} />
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to pick up where you left off.</Text>

        <FormErrorBanner message={formError} />

        <View style={styles.form}>
          <AuthInput
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.email}
          />
          <AuthInput
            label="Password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
            }}
            placeholder="••••••••"
            secure
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            error={errors.password}
            accessory={
              <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
                <Text style={styles.link}>Forgot?</Text>
              </Pressable>
            }
          />
        </View>

        <GradientButton
          label={submitting ? 'Signing in…' : 'Sign in'}
          onPress={submit}
          height={56}
          disabled={submitting}
          style={styles.submit}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>New to Nova? </Text>
          <Pressable onPress={() => router.push('/(auth)/signup')} hitSlop={8}>
            <Text style={styles.footerLink}>Create account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: 26, flexGrow: 1 },
  title: { fontSize: 30, fontWeight: '600', color: Colors.textBright, letterSpacing: -0.4, marginTop: 26 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, marginTop: 7 },

  form: { marginTop: 30, gap: 16 },
  link: { fontSize: 13, color: Colors.primaryLight, fontWeight: '500' },
  submit: { marginTop: 26 },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 'auto', paddingTop: 30 },
  footerText: { fontSize: 14, color: Colors.textSecondary },
  footerLink: { fontSize: 14, color: Colors.primaryLight, fontWeight: '600' },
});
