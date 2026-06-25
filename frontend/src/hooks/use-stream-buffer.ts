import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Batches streamed text deltas into ~60fps state updates.
 *
 * Tokens arrive faster than React can usefully re-render on slow devices; one
 * render per token stutters. Deltas land in a ref (no re-render) and a single
 * pending timer drains them into `displayedText`. Two escape hatches keep the
 * UX crisp:
 *   - Eager first chunk: the very first delta flushes immediately so the
 *     "thinking dots" morph into text the instant the first token arrives.
 *   - Pressure valve: if the buffer exceeds MAX_BUFFER_CHARS, flush now
 *     regardless of the timer (handles very fast local models).
 *
 * Call `reset()` at the start of each turn, then `push(delta)` per chunk.
 * `isDraining` is true while buffered-but-unpainted text exists or a flush is
 * queued - gate anything that waits for "the bubble is fully painted" on this
 * going false, not on the stream closing (the stream closes before the last
 * flush runs).
 */
const FLUSH_INTERVAL_MS = 16; // ~60fps
const MAX_BUFFER_CHARS = 80;

/**
 * @param onText Called with the full accumulated text every time painted text
 *   advances. This is the source of truth for what the bubble should show -
 *   driving the UI from here (rather than a separate effect that reads a ref)
 *   keeps updates reliable under React Compiler memoization, which previously
 *   froze the reply at its first token.
 */
export function useStreamBuffer(onText?: (fullText: string) => void) {
  const [displayedText, setDisplayedText] = useState('');
  const pendingRef = useRef('');
  const displayedRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sawFirstRef = useRef(false);
  const [isDraining, setIsDraining] = useState(false);

  // Keep the latest callback without making flush()'s identity depend on it.
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) {
      displayedRef.current += pendingRef.current;
      pendingRef.current = '';
      setDisplayedText(displayedRef.current);
      onTextRef.current?.(displayedRef.current);
    }
    setIsDraining(false);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }, [flush]);

  const push = useCallback(
    (delta: string) => {
      if (!delta) return;
      pendingRef.current += delta;
      setIsDraining(true);

      // First chunk paints synchronously so dots -> text has no extra frame
      // of latency. Big buffers also flush now so we never lag far behind.
      if (!sawFirstRef.current || pendingRef.current.length >= MAX_BUFFER_CHARS) {
        sawFirstRef.current = true;
        flush();
        return;
      }
      scheduleFlush();
    },
    [flush, scheduleFlush],
  );

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = '';
    displayedRef.current = '';
    sawFirstRef.current = false;
    setIsDraining(false);
    setDisplayedText('');
  }, []);

  // Drop any queued timer if the consumer unmounts mid-stream.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { displayedText, push, reset, flush, isDraining };
}
