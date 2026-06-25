import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { Gradients } from '@/constants/theme';

/**
 * The Nova brand mark - a rounded gradient square with an 8-point "spark"
 * glyph (built from rotated bars, no SVG dependency).
 */
export function NovaMark({ size = 66, radius = 20 }: { size?: number; radius?: number }) {
  const bar = size * 0.5;
  const thickness = Math.max(1.6, size * 0.026);
  return (
    <LinearGradient
      colors={Gradients.brandIcon}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.square, { width: size, height: size, borderRadius: radius }]}>
      {[0, 45, 90, 135].map((deg) => (
        <View
          key={deg}
          style={[
            styles.bar,
            {
              width: bar,
              height: thickness,
              borderRadius: thickness,
              transform: [{ rotate: `${deg}deg` }],
            },
          ]}
        />
      ))}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  square: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
});
