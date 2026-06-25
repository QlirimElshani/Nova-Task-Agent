import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';

function Dot({ delay }: { delay: number }) {
  const v = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.2, duration: 400, useNativeDriver: true }),
        Animated.delay(400 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  return <Animated.View style={[styles.dot, { opacity: v }]} />;
}

export function ThinkingDots() {
  return (
    <View style={styles.row}>
      {[0, 180, 360].map((d) => (
        <Dot key={d} delay={d} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.primaryLight },
});
