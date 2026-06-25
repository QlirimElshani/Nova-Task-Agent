import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';

import { Colors, Radius } from '@/constants/theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  secure?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
  /** Optional control rendered at the top-right of the label row (e.g. "Forgot?"). */
  accessory?: React.ReactNode;
};

/** Labeled field matching the Nova design: focus ring, show/hide eye, inline red error. */
export function AuthInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secure,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  accessory,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);

  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {accessory}
      </View>
      <View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.placeholder}
          secureTextEntry={secure && !show}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            secure && styles.inputWithEye,
            focused && styles.inputFocused,
            !!error && styles.inputError,
          ]}
        />
        {secure && (
          <Pressable onPress={() => setShow((s) => !s)} style={styles.eye} hitSlop={10}>
            <Text style={styles.eyeText}>{show ? 'Hide' : 'Show'}</Text>
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: { fontSize: 13, fontWeight: '500', color: '#9A9AAB' },
  input: {
    height: 54,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    color: Colors.text,
    fontSize: 16,
  },
  inputWithEye: { paddingRight: 64 },
  inputFocused: { borderColor: Colors.primary },
  inputError: { borderColor: Colors.red },
  eye: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  eyeText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  error: { fontSize: 12.5, color: Colors.red, marginTop: 7 },
});
