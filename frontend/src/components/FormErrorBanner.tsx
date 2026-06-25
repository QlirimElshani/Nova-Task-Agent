import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

/** Inline error banner for form submit failures (server / network errors). */
export function FormErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 22,
    backgroundColor: 'rgba(251,113,133,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.3)',
    borderRadius: 14,
    padding: 14,
  },
  text: { color: Colors.red, fontSize: 13.5, lineHeight: 19 },
});
