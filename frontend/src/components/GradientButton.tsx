import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Gradients, Radius } from '@/constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  colors?: readonly [string, string, ...string[]];
  height?: number;
  textColor?: string;
  style?: ViewStyle;
  disabled?: boolean;
};

export function GradientButton({
  label,
  onPress,
  icon,
  colors = Gradients.brand,
  height = 52,
  textColor = '#fff',
  style,
  disabled,
}: Props) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [pressed && styles.pressed, style]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.btn, { height, opacity: disabled ? 0.6 : 1 }]}>
        <View style={styles.row}>
          {icon}
          <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    // Intrinsic horizontal padding so the label/icon never crowd the rounded
    // edges, even when the button hugs its content (e.g. the empty-state CTA).
    paddingHorizontal: 24,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { fontSize: 15, fontWeight: '600' },
  pressed: { transform: [{ scale: 0.98 }] },
});
