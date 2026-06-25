import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

// Structural type for the bits of the tab-bar props we use. Kept minimal so the
// real expo-router BottomTabBarProps is assignable to it. We rely only on
// `state` + `navigate` and skip the tabPress emit/preventDefault dance, which
// isn't needed for a simple static tab set.
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

const LABELS: Record<string, string> = {
  index: 'Nova',
  tasks: 'Tasks',
  profile: 'Profile',
};

// Simple text glyphs per tab (no SVG dependency).
const ICONS: Record<string, string> = {
  index: '✦',
  tasks: '☰',
  profile: '◍',
};

export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const color = focused ? Colors.primaryLight : '#5B5B6B';
        const onPress = () => {
          if (!focused) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} onPress={onPress} style={styles.item}>
            <Text style={[styles.icon, { color }]}>{ICONS[route.name] ?? '•'}</Text>
            <Text style={[styles.label, { color }]}>{LABELS[route.name] ?? route.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    backgroundColor: Platform.OS === 'web' ? Colors.bg : 'rgba(10,10,15,0.95)',
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  item: { flex: 1, alignItems: 'center', gap: 3 },
  icon: { fontSize: 20, includeFontPadding: false },
  label: { fontSize: 10.5, fontWeight: '500' },
});
