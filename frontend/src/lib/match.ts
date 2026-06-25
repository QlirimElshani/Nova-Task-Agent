import type { Task } from '@/types/task';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'to', 'my', 'me', 'i', 'as', 'is', 'of', 'and', 'for',
  'task', 'tasks', 'please', 'that', 'this', 'it', 'have', 'which', 'one',
  'only', 'all', 'show', 'list',
]);

export type StatusWant = 'active' | 'completed' | null;

// Phrases that pin a status. "not completed" must be checked before "completed",
// so order matters: longer/negated phrases first.
const COMPLETED_RE = /\b(completed|complete|done|finished|closed)\b/i;
const ACTIVE_RE =
  /\b(not\s+completed|not\s+complete|not\s+done|incomplete|unfinished|undone|pending|active|todo|to-?do|open|outstanding|remaining)\b/i;

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Split a query into a status filter and the leftover title terms.
 *
 * "not completed" -> { status: 'active', terms: '' }
 * "call the bank which is completed" -> { status: 'completed', terms: 'call bank' }
 * "buy milk" -> { status: null, terms: 'buy milk' }
 *
 * The status words are removed from `terms` so they don't get matched against
 * task titles (a task is rarely literally titled "completed").
 */
export function parseQuery(query: string): { status: StatusWant; terms: string } {
  // Check the negated/active forms first - they contain "completed" as a
  // substring, so testing COMPLETED_RE first would misclassify them.
  let status: StatusWant = null;
  if (ACTIVE_RE.test(query)) status = 'active';
  else if (COMPLETED_RE.test(query)) status = 'completed';

  const terms = query.replace(ACTIVE_RE, ' ').replace(COMPLETED_RE, ' ').trim();
  return { status, terms };
}

function byStatus(tasks: Task[], status: StatusWant): Task[] {
  if (status === 'active') return tasks.filter((t) => !t.completed);
  if (status === 'completed') return tasks.filter((t) => t.completed);
  return tasks;
}

/**
 * Filter a task list by an optional status hint and optional title text in the
 * query. Used by the "list" intent ("show only completed tasks").
 */
export function filterTasks(query: string, tasks: Task[]): Task[] {
  const { status, terms } = parseQuery(query);
  let result = byStatus(tasks, status);
  const words = tokens(terms);
  if (words.length > 0) {
    result = result.filter((t) => {
      const set = new Set(tokens(`${t.title} ${t.description}`));
      return words.some((w) => set.has(w));
    });
  }
  return result;
}

/**
 * Rank a user's tasks by how well they match `query` (the phrase Nova pulled
 * from a complete/delete request). A status hint in the query ("...which is
 * completed") narrows the candidates first, so "delete call the bank which is
 * completed" resolves to the completed one even when titles are identical.
 * Word-overlap scoring with a bonus when the title contains the whole term
 * phrase. Returns candidates that share at least one meaningful word, best first.
 *
 * The chat screen decides what to do with the result:
 *   0 matches -> "I couldn't find that task"
 *   1 match   -> a confirm card for that task
 *   2+ matches -> a pick list
 */
export function matchTasks(
  query: string,
  tasks: Task[],
  // For "complete", a status word in the query ("...as completed") describes the
  // desired end state, not which task to pick - so the caller asks us to ignore
  // it. For "delete", the status word disambiguates, so it is honored.
  ignoreStatus = false,
): Task[] {
  const parsed = parseQuery(query);
  const status = ignoreStatus ? null : parsed.status;
  const terms = parsed.terms;
  const pool = byStatus(tasks, status);

  const qWords = tokens(terms);
  // No title words left (e.g. query was just "the completed one"): if a status
  // hint narrowed things down, return that pool; otherwise nothing to match on.
  if (qWords.length === 0) return status ? pool : [];

  const qPhrase = terms.toLowerCase().trim();
  const scored = pool
    .map((task) => {
      const set = new Set(tokens(`${task.title} ${task.description}`));
      let score = qWords.reduce((acc, w) => acc + (set.has(w) ? 1 : 0), 0);
      if (score > 0 && qPhrase && task.title.toLowerCase().includes(qPhrase)) score += 2;
      return { task, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.task);
}
