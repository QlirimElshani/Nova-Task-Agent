import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { initialsOf } from '@/lib/format';
import { useAuth } from '@/store/auth';
import { useTasks } from '@/store/tasks';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { tasks } = useTasks();
  const { user, signOut } = useAuth();

  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const active = total - done;

  const name = user?.name ?? 'Nova user';
  const email = user?.email ?? '';

  const confirmLogout = async () => {
    const ok = await confirm({
      title: 'Log out',
      message: 'Are you sure you want to log out?',
      confirmLabel: 'Log out',
      destructive: true,
    });
    if (ok) void signOut();
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: Spacing.xl,
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
      }}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(name)}</Text>
        </View>
        <View style={styles.identity}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.email} numberOfLines={1}>
            {email}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={total} label="Total" color="#F2F2F7" />
        <Stat value={done} label="Done" color={Colors.green} />
        <Stat value={active} label="Active" color={Colors.primaryLight} />
      </View>

      <View style={styles.infoCard}>
        <Row label="Appearance" value="Dark" last />
      </View>

      {/* Spacer pushes Log out to the bottom of the screen. */}
      <View style={styles.spacer} />

      <Pressable onPress={confirmLogout} style={({ pressed }) => [styles.logout, pressed && styles.logoutPressed]}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  title: { fontSize: 28, fontWeight: '600', color: Colors.textBright },

  card: {
    marginTop: 18,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.xl,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: Colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  identity: { flex: 1, minWidth: 0 },
  name: { fontSize: 17, fontWeight: '600', color: '#F2F2F7' },
  email: { fontSize: 13.5, color: Colors.textSecondary, marginTop: 2 },

  stats: { marginTop: 14, flexDirection: 'row', gap: 11 },
  stat: {
    flex: 1,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.xl,
    padding: 15,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '600' },
  statLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },

  infoCard: {
    marginTop: 20,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { fontSize: 15, color: '#E6E6EE' },
  rowValue: { fontSize: 13, color: Colors.textSecondary, flexShrink: 1, textAlign: 'right' },

  spacer: { flex: 1, minHeight: 18 },
  logout: {
    height: 52,
    borderRadius: 15,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutPressed: { transform: [{ scale: 0.99 }] },
  logoutText: { fontSize: 15, fontWeight: '600', color: Colors.red },
});
