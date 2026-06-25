import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

export function StatusPill({ completed }: { completed: boolean }) {
  return (
    <View style={[styles.pill, completed ? styles.doneBg : styles.todoBg]}>
      <Text style={[styles.label, completed ? styles.doneText : styles.todoText]}>
        {completed ? 'Completed' : 'Not completed'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  label: { fontSize: 11, fontWeight: '600' },
  doneBg: { backgroundColor: 'rgba(52,211,153,0.14)' },
  doneText: { color: Colors.green },
  todoBg: { backgroundColor: 'rgba(251,191,36,0.13)' },
  todoText: { color: Colors.amber },
});
