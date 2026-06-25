import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CheckGlyph, Chevron } from '@/components/Glyphs';
import { Colors, Radius } from '@/constants/theme';
import { formatDate, relativeDayLabel } from '@/lib/format';
import type { Task } from '@/types/task';

type Props = {
  task: Task;
  onOpen: () => void;
  onToggle: () => void;
};

export function TaskCard({ task, onOpen, onToggle }: Props) {
  const dayLabel = relativeDayLabel(task.created_at);
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Pressable onPress={onToggle} hitSlop={8} style={styles.checkboxWrap}>
        {task.completed ? (
          <View style={styles.checkboxDone}>
            <CheckGlyph color={Colors.bg} size={14} />
          </View>
        ) : (
          <View style={styles.checkboxTodo} />
        )}
      </Pressable>

      <View style={styles.body}>
        <Text
          numberOfLines={1}
          style={[styles.title, task.completed && styles.titleDone]}>
          {task.title}
        </Text>
        {!!task.description && (
          <Text numberOfLines={1} style={styles.desc}>
            {task.description}
          </Text>
        )}
        <View style={styles.metaRow}>
          <Text style={styles.created}>{formatDate(task.created_at)}</Text>
          {dayLabel && (
            <View style={styles.dayBadge}>
              <Text style={styles.dayBadgeText}>{dayLabel}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.chevron}>
        <Chevron color="#4A4A58" size={16} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.xl,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  pressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  checkboxWrap: { marginTop: 1 },
  checkboxDone: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: Colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTodo: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3A3A48',
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 15.5, fontWeight: '600', color: Colors.text, lineHeight: 20 },
  titleDone: { color: Colors.textMuted, textDecorationLine: 'line-through' },
  desc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  created: { fontSize: 11.5, color: Colors.textMuted },
  dayBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 7,
    backgroundColor: 'rgba(251,191,36,0.12)',
  },
  dayBadgeText: { fontSize: 11, fontWeight: '600', color: '#FBBF24' },
  chevron: { marginTop: 4 },
});
