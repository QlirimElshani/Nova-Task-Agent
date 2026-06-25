import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron, TrashGlyph } from '@/components/Glyphs';
import { GradientButton } from '@/components/GradientButton';
import { StatusPill } from '@/components/StatusPill';
import { Colors, Gradients, Radius, Spacing } from '@/constants/theme';
import { formatDate } from '@/lib/format';
import { useTasks } from '@/store/tasks';

export default function TaskDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getTask, toggleTask, deleteTask } = useTasks();

  const task = getTask(id);

  const close = () => router.back();

  if (!task) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.missing}>This task no longer exists.</Text>
        <Pressable onPress={close} style={styles.backInline}>
          <Text style={styles.backInlineText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const onDelete = async () => {
    await deleteTask(task.id);
    close();
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={close} style={styles.iconBtn}>
          <Chevron color="#C9C9D6" size={18} direction="left" />
        </Pressable>
        <Pressable onPress={onDelete} style={[styles.iconBtn, styles.deleteBtn]}>
          <TrashGlyph color={Colors.red} size={17} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <StatusPill completed={task.completed} />
        <Text style={styles.title}>{task.title}</Text>
        {!!task.description && <Text style={styles.description}>{task.description}</Text>}

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>{formatDate(task.created_at)}</Text>
          </View>
          <View style={[styles.metaRow, styles.metaRowLast]}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>
              {task.completed ? 'Completed' : 'Not completed'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {task.completed ? (
          <Pressable onPress={() => toggleTask(task.id)} style={styles.outlineBtn}>
            <Text style={styles.outlineText}>Mark as not completed</Text>
          </Pressable>
        ) : (
          <GradientButton
            label="Mark as completed"
            onPress={() => toggleTask(task.id)}
            colors={Gradients.greenButton}
            textColor="#06281C"
            height={56}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  missing: { color: Colors.textSecondary, fontSize: 15 },
  backInline: { paddingVertical: 10, paddingHorizontal: 20 },
  backInlineText: { color: Colors.primaryLight, fontWeight: '600' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 14,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: { borderColor: 'rgba(251,113,133,0.2)' },

  content: { paddingHorizontal: 24, paddingBottom: 30 },
  title: {
    fontSize: 27,
    fontWeight: '600',
    color: Colors.textBright,
    lineHeight: 34,
    marginTop: 16,
  },
  description: { fontSize: 15.5, lineHeight: 25, color: '#A8A8B8', marginTop: 14 },

  metaCard: {
    marginTop: 26,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  metaRowLast: { borderBottomWidth: 0 },
  metaLabel: { fontSize: 14.5, color: Colors.textSecondary },
  metaValue: { fontSize: 14.5, color: '#E6E6EE', fontWeight: '500' },

  footer: { paddingHorizontal: 24, paddingTop: 8 },
  outlineBtn: {
    height: 56,
    borderRadius: Radius.xl,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: { color: Colors.text, fontSize: 16, fontWeight: '600' },
});
