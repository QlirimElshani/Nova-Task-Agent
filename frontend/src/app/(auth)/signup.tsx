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
import { Chevron } from '@/components/Glyphs';
import { GradientButton } from '@/components/GradientButton';
import { Colors, Radius } from '@/constants/theme';
import { isValidEmail, MIN_PASSWORD } from '@/lib/validation';
import { useAuth } from '@/store/auth';

type Errors = { name?: string; email?: string; password?: string; confirm?: string };

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'));

  const submit = async () => {
    if (submitting) return;
    const next: Errors = {};
    if (!name.trim()) next.name = 'Please enter your name.';
    if (!isValidEmail(email)) next.email = 'Enter a valid email address.';
    if (password.length < MIN_PASSWORD)
      next.password = `Password must be at least ${MIN_PASSWORD} characters.`;
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await signUp({ name: name.trim(), email: email.trim(), password });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not create your account.';
      // A 409 means the email is already registered - show it under the email
      // field. Other failures (server/network) aren't field-specific -> banner.
      if (e instanceof ApiError && e.status === 409) {
        setErrors({ email: 'That email is already registered. Try signing in instead.' });
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={goBack} style={styles.back} hitSlop={8}>
          <Chevron direction="left" color="#C9C9D6" size={18} />
        </Pressable>

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Start turning thoughts into done.</Text>

        <FormErrorBanner message={formError} />

        <View style={styles.form}>
          <AuthInput
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Alex Rivera"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            error={errors.name}
          />
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
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secure
            autoComplete="password-new"
            textContentType="newPassword"
            error={errors.password}
          />
          <AuthInput
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Re-enter password"
            secure
            returnKeyType="go"
            onSubmitEditing={submit}
            error={errors.confirm}
          />
        </View>

        <GradientButton
          label={submitting ? 'Creating…' : 'Create account'}
          onPress={submit}
          height={56}
          disabled={submitting}
          style={styles.submit}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Pressable onPress={goBack} hitSlop={8}>
            <Text style={styles.footerLink}>Sign in</Text>
          </Pressable>
        </View>
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
  subtitle: { fontSize: 15, color: Colors.textSecondary, marginTop: 7 },

  form: { marginTop: 28, gap: 15 },
  submit: { marginTop: 26 },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 'auto', paddingTop: 26 },
  footerText: { fontSize: 14, color: Colors.textSecondary },
  footerLink: { fontSize: 14, color: Colors.primaryLight, fontWeight: '600' },
});
