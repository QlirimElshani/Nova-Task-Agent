import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chevron, PlusGlyph, TrashGlyph } from '@/components/Glyphs';
import { NovaMark } from '@/components/NovaMark';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { ConversationSummary } from '@/lib/api';
import { confirm } from '@/lib/confirm';
import { timeAgo } from '@/lib/format';

const PANEL_WIDTH = Math.min(320, Dimensions.get('window').width * 0.84);

/**
 * A left slide-in panel listing past conversations. Self-contained (no nav
 * library): a translucent backdrop over the whole screen plus a panel animated
 * in/out on translateX. Tapping a row reopens that chat; the trash icon deletes
 * it. "New chat" starts a fresh conversation.
 */
export function ConversationDrawer({
  open,
  conversations,
  activeId,
  onClose,
  onSelect,
  onNewChat,
  onDelete,
}: {
  open: boolean;
  conversations: ConversationSummary[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  // Mounted controls whether the Modal is rendered at all; we keep it mounted
  // through the close animation, then unmount.
  const tx = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(tx, {
        toValue: open ? 0 : -PANEL_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: open ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, tx, fade]);

  const confirmDelete = async (c: ConversationSummary) => {
    const ok = await confirm({
      title: 'Delete conversation',
      message: `Delete "${c.title}"? This can't be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) onDelete(c.id);
  };

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 12, transform: [{ translateX: tx }] },
          ]}>
          <View style={styles.header}>
            <NovaMark size={26} radius={8} />
            <Text style={styles.headerTitle}>Chats</Text>
          </View>

          <Pressable style={styles.newRow} onPress={onNewChat}>
            <PlusGlyph color={Colors.primaryLight} size={15} />
            <Text style={styles.newLabel}>New chat</Text>
          </Pressable>

          <FlatList
            data={conversations}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No conversations yet.</Text>
                <Text style={styles.emptySub}>Your chats with Nova will show up here.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const active = item.id === activeId;
              return (
                <Pressable
                  onPress={() => onSelect(item.id)}
                  onLongPress={() => confirmDelete(item)}
                  style={[styles.row, active && styles.rowActive]}>
                  <View style={styles.rowMain}>
                    <Text style={[styles.rowTitle, active && styles.rowTitleActive]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowMeta}>{timeAgo(item.updated_at)}</Text>
                  </View>
                  <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={styles.rowDelete}>
                    <TrashGlyph color={Colors.textMuted} size={15} />
                  </Pressable>
                  <Chevron />
                </Pressable>
              );
            }}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    backgroundColor: Colors.bgElevated,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: Colors.textBright },

  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  newLabel: { fontSize: 14.5, fontWeight: '600', color: Colors.primaryLight },

  listContent: { paddingBottom: 16, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  rowActive: { backgroundColor: 'rgba(124,92,255,0.12)' },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14.5, color: Colors.text, fontWeight: '500' },
  rowTitleActive: { color: Colors.textBright },
  rowMeta: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  rowDelete: { padding: 2 },

  empty: { paddingTop: 40, alignItems: 'center', gap: 6 },
  emptyText: { fontSize: 14.5, color: Colors.textSecondary, fontWeight: '600' },
  emptySub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', maxWidth: 200 },
});
