import { StyleSheet, Text, View } from 'react-native';

/**
 * Tiny glyph set drawn with primitives / text so we don't need react-native-svg.
 * Each takes a color and size.
 */

export function CheckGlyph({ color = '#0A0A0F', size = 14 }: { color?: string; size?: number }) {
  // A check built from two rotated bars.
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: size * 0.32,
          height: size * 0.12,
          backgroundColor: color,
          borderRadius: 2,
          transform: [
            { translateX: -size * 0.18 },
            { translateY: size * 0.12 },
            { rotate: '45deg' },
          ],
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.62,
          height: size * 0.12,
          backgroundColor: color,
          borderRadius: 2,
          transform: [
            { translateX: size * 0.08 },
            { rotate: '-45deg' },
          ],
        }}
      />
    </View>
  );
}

export function Chevron({
  color = '#4A4A58',
  size = 13,
  direction = 'right',
}: {
  color?: string;
  size?: number;
  direction?: 'right' | 'left';
}) {
  return (
    <Text
      style={{
        color,
        fontSize: size,
        fontWeight: '700',
        lineHeight: size,
        includeFontPadding: false,
      }}>
      {direction === 'right' ? '›' : '‹'}
    </Text>
  );
}

export function PlusGlyph({ color = '#fff', size = 16 }: { color?: string; size?: number }) {
  return (
    <Text style={[styles.symbol, { color, fontSize: size }]}>＋</Text>
  );
}

export function SendGlyph({ color = '#fff', size = 18 }: { color?: string; size?: number }) {
  return <Text style={[styles.symbol, { color, fontSize: size, fontWeight: '700' }]}>↑</Text>;
}

export function TrashGlyph({ color = '#FB7185', size = 17 }: { color?: string; size?: number }) {
  return <Text style={[styles.symbol, { color, fontSize: size }]}>🗑</Text>;
}

export function SearchGlyph({ color = '#6A6A7A', size = 16 }: { color?: string; size?: number }) {
  return <Text style={[styles.symbol, { color, fontSize: size }]}>⌕</Text>;
}

export function MenuGlyph({ color = '#B7B7C6', size = 18 }: { color?: string; size?: number }) {
  // Burger menu: three stacked rounded bars.
  const bar = { width: size, height: Math.max(1.6, size * 0.11), backgroundColor: color, borderRadius: 2 };
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', gap: size * 0.22 }}>
      <View style={bar} />
      <View style={bar} />
      <View style={bar} />
    </View>
  );
}

const styles = StyleSheet.create({
  symbol: {
    includeFontPadding: false,
    textAlign: 'center',
  },
});
