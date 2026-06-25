import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlusGlyph, SearchGlyph } from '@/components/Glyphs';
import { GradientButton } from '@/components/GradientButton';
import { QuoteBanner } from '@/components/QuoteBanner';
import { TaskCard } from '@/components/TaskCard';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useTasks } from '@/store/tasks';
import type { StatusFilter } from '@/types/task';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tasks, refresh, toggleTask } = useTasks();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const activeCount = tasks.filter((t) => !t.completed).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filter === 'active' && t.completed) return false;
      if (filter === 'completed' && !t.completed) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, search, filter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const emptyCopy = useMemo(() => {
    if (tasks.length === 0)
      return {
        title: 'No tasks yet',
        sub: 'Head to Nova and describe what you need to do - it will create the task for you.',
      };
    if (search.trim())
      return { title: 'No matches', sub: `Nothing titled “${search.trim()}”. Try a different search.` };
    if (filter === 'active')
      return { title: 'All clear', sub: 'No active tasks - everything is done. Nice work.' };
    if (filter === 'completed')
      return { title: 'Nothing completed yet', sub: 'Complete a task and it will show up here.' };
    return { title: 'No tasks', sub: '' };
  }, [tasks.length, search, filter]);

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: 24 }}
      data={visible}
      keyExtractor={(t) => t.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryLight} />
      }
      ListHeaderComponent={
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Your tasks</Text>
            <Text style={styles.count}>{activeCount} active</Text>
          </View>

          <View style={styles.bannerWrap}>
            <QuoteBanner />
          </View>

          <View style={styles.searchBox}>
            <SearchGlyph color="#6A6A7A" size={17} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by title"
              placeholderTextColor={Colors.placeholder}
              style={styles.searchInput}
            />
          </View>

          <View style={styles.filters}>
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={[styles.filter, active ? styles.filterActive : styles.filterIdle]}>
                  <Text style={active ? styles.filterTextActive : styles.filterText}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <TaskCard
            task={item}
            onOpen={() => router.push(`/task/${item.id}`)}
            onToggle={() => toggleTask(item.id)}
          />
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 11 }} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
          <Text style={styles.emptySub}>{emptyCopy.sub}</Text>
          {tasks.length === 0 && (
            <GradientButton
              label="Ask Nova to create one"
              onPress={() => router.push('/')}
              icon={<PlusGlyph color="#fff" size={16} />}
              height={46}
              style={styles.emptyBtn}
            />
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.xl, paddingBottom: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '600', color: Colors.textBright },
  count: { fontSize: 13, color: Colors.textSecondary },
  bannerWrap: { marginTop: 16 },

  searchBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 15 },

  filters: { marginTop: 13, flexDirection: 'row', gap: 8 },
  filter: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 11, borderWidth: 1 },
  filterActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterIdle: { backgroundColor: Colors.bgElevated, borderColor: Colors.border },
  filterText: { fontSize: 13, fontWeight: '500', color: '#9A9AAB' },
  filterTextActive: { fontSize: 13, fontWeight: '600', color: '#fff' },

  row: { paddingHorizontal: Spacing.xl, marginTop: 16 },

  empty: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingTop: 40 },
  emptyTitle: { fontSize: 19, fontWeight: '600', color: '#E6E6EE' },
  emptySub: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 260,
  },
  emptyBtn: { marginTop: 22 },
});
