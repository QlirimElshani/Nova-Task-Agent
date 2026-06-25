import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConversationDrawer } from '@/components/ConversationDrawer';
import { CheckGlyph, Chevron, MenuGlyph, PlusGlyph, SendGlyph, TrashGlyph } from '@/components/Glyphs';
import { GradientButton } from '@/components/GradientButton';
import { NovaMark } from '@/components/NovaMark';
import { StatusPill } from '@/components/StatusPill';
import { ThinkingDots } from '@/components/ThinkingDots';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, NOVA_HISTORY_TURNS } from '@/lib/api';
import type { ConversationDetail, NovaPending, NovaTurn } from '@/lib/api';
import { firstNameOf, greeting } from '@/lib/format';
import { filterTasks, matchTasks } from '@/lib/match';
import { useStreamBuffer } from '@/hooks/use-stream-buffer';
import { useAuth } from '@/store/auth';
import { useConversations } from '@/store/conversations';
import { useTasks } from '@/store/tasks';
import type { Task, TaskDraft } from '@/types/task';

type ActionOp = 'complete' | 'delete';

// A proposed edit to an existing task. newTitle/newDescription are undefined
// when that field is left unchanged.
type TaskEdit = { newTitle?: string; newDescription?: string };

// The card attached to an agent turn, once the stream tells us the intent.
// `null` while still streaming the reply (or for plain chat replies).
type Card =
  | { kind: 'draft'; draft: TaskDraft; added: boolean }
  // A whole plan broken into tasks. `added` flips once every task is created
  // (via the button or a "yes"/"add them all" reply).
  | { kind: 'plan'; drafts: TaskDraft[]; added: boolean }
  | { kind: 'list'; query: string; filtered: boolean }
  | { kind: 'action'; op: ActionOp; task: Task; done: boolean; already?: boolean }
  | { kind: 'pick'; op: ActionOp; candidates: Task[] }
  | { kind: 'update'; task: Task; edit: TaskEdit; done: boolean }
  // The "delete all tasks" are-you-sure. `count` is how many will be cleared;
  // `done` flips once the user confirms (tap "Clear all" or reply "yes").
  | { kind: 'clearall'; count: number; done: boolean }
  // A vague update ("I want to update tasks") with no task named and/or no new
  // value - ask what to change instead of claiming nothing was found.
  | { kind: 'update-help' }
  | { kind: 'notfound'; op: ActionOp | 'update'; query: string };

type Message =
  | { id: number; role: 'user'; text: string }
  | {
      id: number;
      role: 'agent';
      // Reply text grows token by token; `card` attaches when the stream
      // resolves the intent. `streaming` drives the typing dots (shown while
      // streaming and the text is still empty).
      text: string;
      card: Card | null;
      streaming: boolean;
    };

const CHIPS = [
  'Call the bank tomorrow',
  'Plan my week',
  '30-min workout today',
  'Email the design feedback',
];

// How many planned tasks a single "Add all" can create at once. Mirrors the
// backend's per-plan cap so the card and the batch stay in sync.
const MAX_PLAN_TASKS = 30;

let counter = 100;
const nextId = () => ++counter;

// The chat input grows with its content between these bounds. Past the max it
// stops growing and scrolls internally so a long message never pushes the
// thread off-screen. One line ≈ INPUT_MIN_HEIGHT; ~5 lines ≈ INPUT_MAX_HEIGHT.
const INPUT_MIN_HEIGHT = 40;
const INPUT_MAX_HEIGHT = 120;

// Recent turns to replay so Nova has conversational memory. Only text-bearing
// turns are useful; card-only agent turns carry no replayable prose.
function buildHistory(messages: Message[]): NovaTurn[] {
  return messages
    .filter((m) => m.text.trim().length > 0)
    .slice(-NOVA_HISTORY_TURNS)
    .map((m) => ({ role: m.role, text: m.text }));
}

// If the most recent agent turn is still awaiting a choice/confirmation,
// describe it so a follow-up ("yes", "add it", "the first one") resolves against
// it server-side instead of being classified fresh.
function buildPending(messages: Message[]): NovaPending | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'agent' || !m.card) continue;
    const card = m.card;
    if (card.kind === 'draft' && !card.added) {
      // An unconfirmed draft: "add it" / "yes" creates it.
      return { op: 'create', draft: card.draft };
    }
    if (card.kind === 'plan' && !card.added) {
      // An unconfirmed plan: "yes" / "add them all" creates every task.
      return { op: 'create_many', drafts: card.drafts };
    }
    if (card.kind === 'pick') {
      return {
        op: card.op,
        candidates: card.candidates.map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
        })),
      };
    }
    if (card.kind === 'action' && !card.done && !card.already) {
      return {
        op: card.op,
        candidates: [
          { id: card.task.id, title: card.task.title, completed: card.task.completed },
        ],
      };
    }
    if (card.kind === 'clearall' && !card.done) {
      // An unconfirmed "delete all" are-you-sure: a "yes" clears every task.
      return { op: 'delete_all' };
    }
    return null; // most recent card is not awaiting a choice
  }
  return null;
}

export default function NovaScreen() {
  const insets = useSafeAreaInsets();
  const { tasks, createTask, createTasks, toggleTask, updateTask, deleteTask, clearAllTasks } =
    useTasks();
  const { user } = useAuth();
  const {
    summaries,
    activeId,
    refresh: refreshConversations,
    startNew: startNewConversation,
    ensureConversation,
    recordTurn,
    open: openConversation,
    remove: removeConversation,
  } = useConversations();
  const firstName = firstNameOf(user?.name);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Measured content height of the input, clamped to [MIN, MAX] so the field
  // grows with the text and then scrolls inside instead of growing forever.
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const scrollRef = useRef<ScrollView>(null);

  // The task store updates async; reading it inside stream callbacks via a ref
  // avoids a stale snapshot when we match a "complete/delete X" request.
  const tasksRef = useRef<Task[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Latest messages, read inside send() to build the history/pending sent with
  // each turn (Nova is stateless; the client supplies the memory).
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const streamingRef = useRef(false);
  const streamingMsgIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToEnd = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));

  // Patch the agent message with the given id (typed narrow to 'agent').
  const patchAgent = useCallback(
    (id: number, patch: (m: Extract<Message, { role: 'agent' }>) => Partial<Message>) => {
      setMessages((ms) =>
        ms.map((m) => (m.id === id && m.role === 'agent' ? { ...m, ...patch(m) } : m)),
      );
    },
    [],
  );

  const setCard = useCallback(
    (id: number, card: Card) => patchAgent(id, () => ({ card })),
    [patchAgent],
  );

  // Tokens flow through this buffer (batched to ~60fps); on each painted advance
  // it writes the FULL accumulated text straight into the active agent bubble.
  // Driving the bubble from this callback (not a separate effect that reads a
  // ref) is what keeps the running reply growing reliably - the old effect froze
  // at the first token under React Compiler memoization.
  const buffer = useStreamBuffer((fullText) => {
    const id = streamingMsgIdRef.current;
    if (id != null) patchAgent(id, () => ({ text: fullText }));
  });

  // Turn a non-create intent + query into the card the bubble should show, by
  // matching against the user's current task list.
  const resolveMeta = useCallback(
    (id: number, meta: import('@/lib/api').NovaMeta) => {
      const { intent, query } = meta;
      if (intent === 'list') {
        // The list card stores the query and renders against the LIVE store, so
        // a list shown right after an add/edit reflects the change.
        const all = tasksRef.current;
        const filtered = filterTasks(query, all).length !== all.length;
        setCard(id, { kind: 'list', query, filtered });
        return;
      }
      if (intent === 'update') {
        const edit: TaskEdit = {
          newTitle: meta.title?.trim() || undefined,
          newDescription: meta.description?.trim() || undefined,
        };
        // Vague request: the user said "I want to update tasks" but never named
        // a new title/description. Ask what to change rather than claiming no
        // task matched some garbage query phrase.
        if (!edit.newTitle && !edit.newDescription) {
          setCard(id, { kind: 'update-help' });
          return;
        }
        const matches = matchTasks(query, tasksRef.current, false);
        if (matches.length === 0) {
          // They told us a new value but we can't find the task they named.
          setCard(id, { kind: 'notfound', op: 'update', query });
        } else {
          // One or more matches: edit the best one (titles are usually unique).
          setCard(id, { kind: 'update', task: matches[0], edit, done: false });
        }
        return;
      }
      if (intent === 'delete_all') {
        // Show an are-you-sure card counting the current tasks. Confirming (tap
        // or "yes") clears them; if there are none, the card just says so.
        setCard(id, { kind: 'clearall', count: tasksRef.current.length, done: false });
        return;
      }
      const op: ActionOp = intent; // 'complete' | 'delete'
      // Completing a task: a "completed" word is the goal, not a filter - ignore
      // it so we match the (active) task by title. Deleting: honor it to pick
      // the right copy when titles collide.
      const matches = matchTasks(query, tasksRef.current, op === 'complete');
      if (matches.length === 0) {
        setCard(id, { kind: 'notfound', op, query });
      } else if (matches.length === 1) {
        const task = matches[0];
        // Completing something already done: skip the button, just confirm it.
        const already = op === 'complete' && task.completed;
        setCard(id, { kind: 'action', op, task, done: false, already });
      } else {
        setCard(id, { kind: 'pick', op, candidates: matches.slice(0, 5) });
      }
    },
    [setCard],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streamingRef.current) return;

      setInput('');
      setInputHeight(INPUT_MIN_HEIGHT); // collapse back after sending
      const agentId = nextId();
      buffer.reset();
      streamingMsgIdRef.current = agentId;
      streamingRef.current = true;

      // Commit the user message + empty agent placeholder together, so the
      // placeholder (with empty text) renders the typing dots immediately.
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'user', text },
        { id: agentId, role: 'agent', text: '', card: null, streaming: true },
      ]);
      scrollToEnd();

      const controller = new AbortController();
      abortRef.current = controller;

      // Build memory from the turns BEFORE this one (snapshot via the ref).
      const priorMessages = messagesRef.current;
      const history = buildHistory(priorMessages);
      const pending = buildPending(priorMessages);

      // Ensure a backing conversation exists (created from the first message),
      // so this and every following turn is saved to history.
      const convIdPromise = ensureConversation(text);

      const finish = () => {
        streamingRef.current = false;
        streamingMsgIdRef.current = null;
        abortRef.current = null;
        // Drop the placeholder if nothing ever arrived (no text and no card).
        setMessages((m) =>
          m.filter(
            (x) =>
              !(x.role === 'agent' && x.id === agentId && x.text === '' && x.card == null),
          ),
        );
        patchAgent(agentId, () => ({ streaming: false }));
        scrollToEnd();

        // Persist this turn (user text + the agent's final reply text). The agent
        // bubble's text is the source of truth after the buffer has flushed.
        const finalAgent = messagesRef.current.find(
          (x): x is Extract<Message, { role: 'agent' }> => x.id === agentId && x.role === 'agent',
        );
        const agentText = finalAgent?.text ?? '';
        void convIdPromise.then((id) => {
          if (id) void recordTurn(id, text, agentText);
        });
      };

      try {
        await api.novaStream(
          text,
          {
            onDelta: (chunk) => {
              buffer.push(chunk);
              scrollToEnd();
            },
            onDraft: (draft) => {
              buffer.flush();
              setCard(agentId, { kind: 'draft', draft, added: false });
              scrollToEnd();
            },
            onPlan: (drafts) => {
              buffer.flush();
              // An empty plan means the backend couldn't extract tasks; show
              // nothing rather than an empty card (the reply text stands alone).
              if (drafts.length > 0) {
                setCard(agentId, {
                  kind: 'plan',
                  drafts: drafts.slice(0, MAX_PLAN_TASKS),
                  added: false,
                });
              }
              scrollToEnd();
            },
            onMeta: (meta) => {
              buffer.flush();
              resolveMeta(agentId, meta);
              scrollToEnd();
            },
            onResolve: async (r) => {
              // A follow-up ("yes" / "add it" / "the first one") confirmed a
              // pending card. Run it and show a done card on this turn.
              buffer.flush();
              if (r.op === 'create') {
                const created = await createTask({
                  title: r.draft.title,
                  description: r.draft.description,
                });
                if (created) setCard(agentId, { kind: 'draft', draft: r.draft, added: true });
                scrollToEnd();
                return;
              }
              if (r.op === 'create_many') {
                const drafts = r.drafts.slice(0, MAX_PLAN_TASKS);
                const n = await createTasks(
                  drafts.map((d) => ({ title: d.title, description: d.description })),
                );
                if (n > 0) setCard(agentId, { kind: 'plan', drafts, added: true });
                scrollToEnd();
                return;
              }
              if (r.op === 'delete_all') {
                const count = tasksRef.current.length;
                const ok = await clearAllTasks();
                if (ok) setCard(agentId, { kind: 'clearall', count, done: true });
                scrollToEnd();
                return;
              }
              const task = tasksRef.current.find((t) => t.id === r.task_id);
              if (!task) return;
              if (r.op === 'complete') {
                if (!task.completed) await toggleTask(task.id);
                setCard(agentId, {
                  kind: 'action',
                  op: 'complete',
                  task: { ...task, completed: true },
                  done: true,
                });
              } else if (r.op === 'delete') {
                await deleteTask(task.id);
                setCard(agentId, { kind: 'action', op: 'delete', task, done: true });
              }
              // op 'update' is resolved via the update card's confirm, not here.
              scrollToEnd();
            },
            onError: (message) => {
              buffer.push(message);
            },
          },
          { history, pending },
          controller.signal,
        );
      } finally {
        // novaStream resolves once the stream closes (or the fallback returns);
        // flush any unpainted tail before we settle.
        buffer.flush();
        finish();
      }
    },
    [
      buffer,
      patchAgent,
      setCard,
      resolveMeta,
      createTask,
      createTasks,
      toggleTask,
      deleteTask,
      clearAllTasks,
      ensureConversation,
      recordTurn,
    ],
  );

  const addDraft = useCallback(
    async (msgId: number, draft: TaskDraft) => {
      const created = await createTask({ title: draft.title, description: draft.description });
      if (created) {
        patchAgent(msgId, (m) =>
          m.card?.kind === 'draft' ? { card: { ...m.card, added: true } } : {},
        );
      }
    },
    [createTask, patchAgent],
  );

  // Add every task in a plan card at once, then mark the card added.
  const addAllPlan = useCallback(
    async (msgId: number, drafts: TaskDraft[]) => {
      const n = await createTasks(
        drafts.map((d) => ({ title: d.title, description: d.description })),
      );
      if (n > 0) {
        patchAgent(msgId, (m) =>
          m.card?.kind === 'plan' ? { card: { ...m.card, added: true } } : {},
        );
      }
    },
    [createTasks, patchAgent],
  );

  // Run a complete/delete on a specific task, then flip the card to its done
  // state (or, for a pick list, collapse it to the single acted-on task).
  const runAction = useCallback(
    async (msgId: number, op: ActionOp, task: Task) => {
      if (op === 'complete') {
        if (!task.completed) await toggleTask(task.id);
      } else {
        await deleteTask(task.id);
      }
      patchAgent(msgId, () => ({
        card: { kind: 'action', op, task: { ...task, completed: op === 'complete' }, done: true },
      }));
    },
    [toggleTask, deleteTask, patchAgent],
  );

  // Apply a confirmed edit, then mark the update card done.
  const runUpdate = useCallback(
    async (msgId: number, task: Task, edit: TaskEdit) => {
      const patch: { title?: string; description?: string } = {};
      if (edit.newTitle) patch.title = edit.newTitle;
      if (edit.newDescription) patch.description = edit.newDescription;
      if (Object.keys(patch).length === 0) return;
      const updated = await updateTask(task.id, patch);
      if (updated) {
        patchAgent(msgId, () => ({
          card: { kind: 'update', task: updated, edit, done: true },
        }));
      }
    },
    [updateTask, patchAgent],
  );

  // Confirm the "delete all" card by tapping its button (equivalent to replying
  // "yes"). Clears every task, then flips the card to its done state.
  const runClearAll = useCallback(
    async (msgId: number) => {
      const count = tasksRef.current.length;
      const ok = await clearAllTasks();
      if (ok) {
        patchAgent(msgId, () => ({ card: { kind: 'clearall', count, done: true } }));
      }
    },
    [clearAllTasks, patchAgent],
  );

  // Reset the live chat to a blank slate. `freshConversation` also tells the
  // store the next message should start a NEW conversation (used by "New" and
  // the drawer's "New chat"); reopening a saved chat does NOT reset that.
  const resetChat = useCallback(
    (freshConversation: boolean) => {
      abortRef.current?.abort();
      streamingRef.current = false;
      streamingMsgIdRef.current = null;
      buffer.reset();
      setMessages([]);
      setInput('');
      if (freshConversation) startNewConversation();
    },
    [buffer, startNewConversation],
  );

  const newChat = () => resetChat(true);

  // Reopen a saved conversation: map its stored {role, text} turns into the
  // screen's message list (text only - cards are transient and not replayed).
  const loadConversation = useCallback(
    async (id: string) => {
      setDrawerOpen(false);
      const detail: ConversationDetail | null = await openConversation(id);
      if (!detail) return;
      resetChat(false); // clears the view but keeps this conversation active
      const loaded: Message[] = detail.messages.map((m) =>
        m.role === 'user'
          ? { id: nextId(), role: 'user', text: m.text }
          : { id: nextId(), role: 'agent', text: m.text, card: null, streaming: false },
      );
      setMessages(loaded);
      scrollToEnd();
    },
    [openConversation, resetChat],
  );

  const openDrawer = useCallback(() => {
    void refreshConversations(); // pull the latest list each time it opens
    setDrawerOpen(true);
  }, [refreshConversations]);

  const empty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={openDrawer} style={styles.menuBtn} hitSlop={8}>
            <MenuGlyph color="#B7B7C6" size={18} />
          </Pressable>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.name}>{firstName}</Text>
          </View>
        </View>
        <Pressable onPress={newChat} style={styles.newBtn}>
          <PlusGlyph color="#B7B7C6" size={14} />
          <Text style={styles.newLabel}>New</Text>
        </Pressable>
      </View>

      {empty ? (
        // Tapping the empty background dismisses the keyboard. Chips keep working
        // because their own Pressable handles the press first.
        <Pressable style={styles.hero} onPress={() => Keyboard.dismiss()}>
          <NovaMark size={66} />
          <Text style={styles.heroTitle}>What should we get done?</Text>
          <Text style={styles.heroSub}>
            Describe it in your own words - I&apos;ll turn it into a task for you.
          </Text>
          <View style={styles.chips}>
            {CHIPS.map((c) => (
              <Pressable key={c} onPress={() => send(c)} style={styles.chip}>
                <Text style={styles.chipText}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.thread}
          // Tap on the thread dismisses the keyboard; taps on buttons/cards still
          // register ("handled" keeps the keyboard up only for child-handled taps).
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onContentSizeChange={scrollToEnd}>
          {messages.map((m) =>
            m.role === 'user' ? (
              <View key={m.id} style={styles.userBubble}>
                <Text style={styles.userText}>{m.text}</Text>
              </View>
            ) : (
              <View key={m.id} style={styles.agentRow}>
                <View style={styles.agentHeader}>
                  <NovaMark size={28} radius={9} />
                  {/* Dots while the reply is still empty; text once tokens land. */}
                  {m.streaming && m.text === '' ? (
                    <ThinkingDots />
                  ) : (
                    <Text style={styles.agentText}>{m.text}</Text>
                  )}
                </View>
                {m.card && (
                  <AgentCard
                    card={m.card}
                    tasks={tasks}
                    onAddDraft={(draft) => addDraft(m.id, draft)}
                    onAddAllPlan={(drafts) => addAllPlan(m.id, drafts)}
                    onAction={(op, task) => runAction(m.id, op, task)}
                    onUpdate={(task, edit) => runUpdate(m.id, task, edit)}
                    onClearAll={() => runClearAll(m.id)}
                  />
                )}
              </View>
            ),
          )}
        </ScrollView>
      )}

      <View style={[styles.inputBar, { paddingBottom: Spacing.md }]}>
        <View style={styles.inputWrap}>
          <TextInput
            value={input}
            onChangeText={(t) => {
              setInput(t);
              // Cleared field collapses back to one line. onContentSizeChange
              // can lag (or not fire) when the value empties, so reset here.
              if (t.length === 0) setInputHeight(INPUT_MIN_HEIGHT);
            }}
            placeholder="Describe a task…"
            placeholderTextColor={Colors.placeholder}
            style={[
              styles.input,
              {
                // Grow with the measured content, clamped to [MIN, MAX]. maxHeight
                // is also set so the native field caps and scrolls internally.
                height: Math.max(INPUT_MIN_HEIGHT, Math.min(inputHeight, INPUT_MAX_HEIGHT)),
                maxHeight: INPUT_MAX_HEIGHT,
              },
            ]}
            multiline
            // Always scrollable: once the content exceeds maxHeight the field
            // scrolls internally instead of overflowing. (Toggling this off until
            // a measured height arrived was why long text didn't scroll on
            // mobile - the measure can lag or, for a no-space string, never grow.)
            scrollEnabled
            // Track the measured content height; the style clamps it to
            // [MIN, MAX]. The +1 guards against fractional measures that round
            // down and clip the last line. Clearing is handled in onChangeText,
            // which resets to MIN immediately rather than waiting on a measure.
            onContentSizeChange={(e) =>
              setInputHeight(e.nativeEvent.contentSize.height + 1)
            }
            textAlignVertical="top"
          />
          <Pressable onPress={() => send(input)} style={styles.sendBtn}>
            <SendGlyph color="#fff" size={18} />
          </Pressable>
        </View>
      </View>

      <ConversationDrawer
        open={drawerOpen}
        conversations={summaries}
        activeId={activeId}
        onClose={() => setDrawerOpen(false)}
        onSelect={loadConversation}
        onNewChat={() => {
          setDrawerOpen(false);
          newChat();
        }}
        onDelete={removeConversation}
      />
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// AgentCard - renders whichever card the stream resolved for this turn:
// a create draft, a task list, a complete/delete confirm, a pick list, or a
// "not found" note. Stateless: actions bubble up to the screen via callbacks.
// ---------------------------------------------------------------------------

function AgentCard({
  card,
  tasks,
  onAddDraft,
  onAddAllPlan,
  onAction,
  onUpdate,
  onClearAll,
}: {
  card: Card;
  tasks: Task[];
  onAddDraft: (draft: TaskDraft) => void;
  onAddAllPlan: (drafts: TaskDraft[]) => void;
  onAction: (op: ActionOp, task: Task) => void;
  onUpdate: (task: Task, edit: TaskEdit) => void;
  onClearAll: () => void;
}) {
  if (card.kind === 'draft') {
    const { draft, added } = card;
    return (
      <View style={styles.draftCard}>
        <View style={styles.draftHeader}>
          <Text style={styles.draftKicker}>New task</Text>
          <View style={styles.draftRule} />
          {draft.source === 'claude' && <Text style={styles.draftBadge}>Nova AI</Text>}
        </View>
        <Text style={styles.draftTitle}>{draft.title}</Text>
        <Text style={styles.draftDesc}>{draft.description}</Text>
        {added ? (
          <View style={styles.addedPill}>
            <CheckGlyph color={Colors.green} size={15} />
            <Text style={styles.addedText}>Added to your tasks</Text>
          </View>
        ) : (
          <GradientButton
            label="Add to my tasks"
            onPress={() => onAddDraft(draft)}
            icon={<PlusGlyph color="#fff" size={16} />}
            height={44}
            style={styles.addBtn}
          />
        )}
      </View>
    );
  }

  if (card.kind === 'plan') {
    const { drafts, added } = card;
    return (
      <View style={styles.draftCard}>
        <View style={styles.draftHeader}>
          <Text style={styles.draftKicker}>Your plan</Text>
          <View style={styles.draftRule} />
          <Text style={styles.draftBadge}>{drafts.length}</Text>
        </View>
        {drafts.map((d, i) => (
          <View key={`${d.title}-${i}`} style={styles.planRow}>
            <View style={styles.planBullet} />
            <View style={styles.listRowMain}>
              <Text style={styles.listTitle} numberOfLines={2}>
                {d.title}
              </Text>
              {!!d.description && (
                <Text style={styles.planDesc} numberOfLines={2}>
                  {d.description}
                </Text>
              )}
            </View>
          </View>
        ))}
        {added ? (
          <View style={styles.addedPill}>
            <CheckGlyph color={Colors.green} size={15} />
            <Text style={styles.addedText}>
              Added {drafts.length} {drafts.length === 1 ? 'task' : 'tasks'}
            </Text>
          </View>
        ) : (
          <GradientButton
            label={`Add all ${drafts.length} to my tasks`}
            onPress={() => onAddAllPlan(drafts)}
            icon={<PlusGlyph color="#fff" size={16} />}
            height={44}
            style={styles.addBtn}
          />
        )}
      </View>
    );
  }

  if (card.kind === 'list') {
    // Render against the LIVE task list (not a frozen snapshot), so a list shown
    // right after an add/edit/delete reflects the change.
    const shown = filterTasks(card.query, tasks);
    if (shown.length === 0) {
      return (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            {card.filtered
              ? 'No tasks match that filter.'
              : "You don't have any tasks yet."}
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.draftCard}>
        <View style={styles.draftHeader}>
          <Text style={styles.draftKicker}>Your tasks</Text>
          <View style={styles.draftRule} />
          <Text style={styles.draftBadge}>{shown.length}</Text>
        </View>
        {shown.map((t) => (
          <View key={t.id} style={styles.listRow}>
            <View style={styles.listRowMain}>
              <Text
                style={[styles.listTitle, t.completed && styles.listTitleDone]}
                numberOfLines={1}>
                {t.title}
              </Text>
              <StatusPill completed={t.completed} />
            </View>
            <Chevron />
          </View>
        ))}
      </View>
    );
  }

  if (card.kind === 'update') {
    const { task, edit, done } = card;
    if (done) {
      return (
        <View style={styles.draftCard}>
          <Text style={styles.draftTitle}>{task.title}</Text>
          {!!task.description && <Text style={styles.draftDesc}>{task.description}</Text>}
          <View style={styles.addedPill}>
            <CheckGlyph color={Colors.green} size={15} />
            <Text style={styles.addedText}>Task updated</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.draftCard}>
        <View style={styles.draftHeader}>
          <Text style={styles.draftKicker}>Update task</Text>
          <View style={styles.draftRule} />
        </View>
        {edit.newTitle ? (
          <>
            <Text style={styles.editLabel}>Title</Text>
            <Text style={styles.editOld} numberOfLines={1}>
              {task.title}
            </Text>
            <Text style={styles.draftTitle}>{edit.newTitle}</Text>
          </>
        ) : (
          <Text style={styles.draftTitle}>{task.title}</Text>
        )}
        {edit.newDescription && (
          <>
            <Text style={[styles.editLabel, { marginTop: 8 }]}>New description</Text>
            <Text style={styles.draftDesc}>{edit.newDescription}</Text>
          </>
        )}
        <GradientButton
          label="Save changes"
          onPress={() => onUpdate(task, edit)}
          icon={<CheckGlyph color="#fff" size={16} />}
          height={44}
          style={styles.addBtn}
        />
      </View>
    );
  }

  if (card.kind === 'clearall') {
    const { count, done } = card;
    if (done) {
      return (
        <View style={styles.draftCard}>
          <View style={styles.addedPill}>
            <CheckGlyph color={Colors.green} size={15} />
            <Text style={styles.addedText}>All tasks cleared</Text>
          </View>
        </View>
      );
    }
    if (count === 0) {
      // Nothing to delete - don't show a scary confirm button.
      return (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>You don&apos;t have any tasks to clear.</Text>
        </View>
      );
    }
    return (
      <View style={styles.draftCard}>
        <View style={styles.draftHeader}>
          <Text style={styles.draftKicker}>Delete all tasks</Text>
          <View style={styles.draftRule} />
        </View>
        <Text style={styles.draftTitle}>
          Delete all {count} {count === 1 ? 'task' : 'tasks'}?
        </Text>
        <Text style={styles.draftDesc}>
          This permanently removes every task and can&apos;t be undone. Reply
          &ldquo;yes&rdquo; or tap below to confirm.
        </Text>
        <Pressable style={styles.deleteBtn} onPress={onClearAll}>
          <TrashGlyph color={Colors.red} size={16} />
          <Text style={styles.deleteLabel}>Yes, delete all tasks</Text>
        </Pressable>
      </View>
    );
  }

  if (card.kind === 'update-help') {
    return (
      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          Sure - which task should I update, and what would you like to change? For
          example: &ldquo;rename Groceries to Weekly shop&rdquo; or &ldquo;change the
          gym task description to bring a towel&rdquo;.
        </Text>
      </View>
    );
  }

  if (card.kind === 'notfound') {
    return (
      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          I couldn&apos;t find a task matching &ldquo;{card.query}&rdquo;.
        </Text>
      </View>
    );
  }

  if (card.kind === 'pick') {
    const verb = card.op === 'complete' ? 'complete' : 'delete';
    return (
      <View style={styles.draftCard}>
        <View style={styles.draftHeader}>
          <Text style={styles.draftKicker}>Which one to {verb}?</Text>
          <View style={styles.draftRule} />
        </View>
        <Text style={styles.pickHint}>Tap the task you mean.</Text>
        {card.candidates.map((t) => (
          <Pressable
            key={t.id}
            style={styles.pickRow}
            onPress={() => onAction(card.op, t)}>
            <View style={styles.listRowMain}>
              <Text style={styles.listTitle} numberOfLines={1}>
                {t.title}
              </Text>
              <StatusPill completed={t.completed} />
            </View>
            <Chevron />
          </Pressable>
        ))}
      </View>
    );
  }

  // card.kind === 'action'
  const { op, task, done, already } = card;
  if (done) {
    return (
      <View style={styles.draftCard}>
        <Text style={styles.draftTitle}>{task.title}</Text>
        <View style={styles.addedPill}>
          <CheckGlyph color={Colors.green} size={15} />
          <Text style={styles.addedText}>
            {op === 'complete' ? 'Marked complete' : 'Deleted'}
          </Text>
        </View>
      </View>
    );
  }
  if (already) {
    // The task the user wants to "complete" is already completed - just say so.
    return (
      <View style={styles.draftCard}>
        <Text style={styles.draftTitle}>{task.title}</Text>
        <View style={styles.addedPill}>
          <CheckGlyph color={Colors.green} size={15} />
          <Text style={styles.addedText}>Already completed</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.draftCard}>
      <View style={styles.draftHeader}>
        <Text style={styles.draftKicker}>
          {op === 'complete' ? 'Mark complete' : 'Delete task'}
        </Text>
        <View style={styles.draftRule} />
      </View>
      <Text style={styles.draftTitle}>{task.title}</Text>
      {!!task.description && <Text style={styles.draftDesc}>{task.description}</Text>}
      {op === 'complete' ? (
        <GradientButton
          label="Mark as completed"
          onPress={() => onAction(op, task)}
          icon={<CheckGlyph color="#fff" size={16} />}
          height={44}
          style={styles.addBtn}
        />
      ) : (
        <Pressable style={styles.deleteBtn} onPress={() => onAction(op, task)}>
          <TrashGlyph color={Colors.red} size={16} />
          <Text style={styles.deleteLabel}>Delete task</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.bg },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: { fontSize: 13, lineHeight: 16, color: Colors.textSecondary },
  name: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '600',
    color: Colors.textBright,
    marginTop: 1,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 11,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  newLabel: { fontSize: 13, fontWeight: '500', color: '#B7B7C6' },

  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xxl },
  heroTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.textBright,
    textAlign: 'center',
    marginTop: 28,
  },
  heroSub: {
    fontSize: 14.5,
    lineHeight: 21,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 280,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    justifyContent: 'center',
    marginTop: 26,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  chipText: { fontSize: 13, color: '#C2C2D0' },

  thread: { padding: 16, gap: 16 },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: Colors.primary,
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  userText: { color: '#fff', fontSize: 15, lineHeight: 21 },
  agentRow: { gap: 11 },
  agentHeader: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  agentText: { flex: 1, fontSize: 14.5, lineHeight: 22, color: '#C9C9D6', paddingTop: 4 },

  draftCard: {
    marginLeft: 37,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: Radius.xl,
    padding: 15,
  },
  draftHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 11 },
  draftKicker: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: Colors.primaryLight,
    textTransform: 'uppercase',
  },
  draftRule: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  draftBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryLight,
    letterSpacing: 0.4,
  },
  draftTitle: { fontSize: 16, fontWeight: '600', color: '#F2F2F7', lineHeight: 21 },
  draftDesc: { fontSize: 13, lineHeight: 20, color: Colors.textSecondary, marginTop: 6 },
  addBtn: { marginTop: 14 },
  addedPill: {
    marginTop: 14,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  addedText: { color: Colors.green, fontSize: 14.5, fontWeight: '600' },

  // Update card: show the old value struck through above the new one.
  editLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  editOld: {
    fontSize: 13.5,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
    marginBottom: 3,
  },

  // Plain info note (empty list / not found) - lighter than a full card.
  infoCard: {
    marginLeft: 37,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: Radius.xl,
    padding: 15,
  },
  infoText: { fontSize: 14, lineHeight: 21, color: Colors.textSecondary },

  // Rows inside the "your tasks" list card.
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  listRowMain: { flex: 1, gap: 6 },
  listTitle: { fontSize: 14.5, fontWeight: '600', color: '#ECECF2', flexShrink: 1 },
  listTitleDone: { color: Colors.textMuted, textDecorationLine: 'line-through' },

  // Rows inside the "your plan" card: a bullet, a title, and a short description.
  planRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  planBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primaryLight,
    marginTop: 7,
  },
  planDesc: { fontSize: 12.5, lineHeight: 18, color: Colors.textSecondary, marginTop: 2 },

  // Tappable rows in the disambiguation (pick) card.
  pickHint: { fontSize: 12.5, color: Colors.textMuted, marginBottom: 2 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },

  deleteBtn: {
    marginTop: 14,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(251,113,133,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteLabel: { color: Colors.red, fontSize: 14.5, fontWeight: '600' },

  inputBar: { paddingHorizontal: 16, paddingTop: 8 },
  inputWrap: {
    flexDirection: 'row',
    // Bottom-align so the send button stays pinned at the bottom as the input
    // grows taller across multiple lines.
    alignItems: 'flex-end',
    gap: 9,
    backgroundColor: Colors.bgCard,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.xxl,
    paddingVertical: 7,
    paddingLeft: 16,
    paddingRight: 7,
  },
  input: {
    flex: 1,
    // minWidth:0 lets the flex child shrink below its content's intrinsic width
    // so a long no-space string WRAPS (by character) instead of overflowing the
    // rounded container horizontally.
    minWidth: 0,
    color: Colors.text,
    fontSize: 15,
    // Vertical padding centers a single line and gives multi-line breathing
    // room; the height itself is set dynamically from measured content.
    paddingTop: 9,
    paddingBottom: 9,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
