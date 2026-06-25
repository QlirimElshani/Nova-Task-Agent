import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import { QUOTE_API_URL } from '@/constants/config';

type Quote = { text: string; author: string };

const FALLBACKS: Quote[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Small deeds done are better than great deeds planned.', author: 'Peter Marshall' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'Done is better than perfect.', author: 'Sheryl Sandberg' },
];

/**
 * "Daily spark" - fetches an inspirational quote from a public API
 * (the task's required public-API integration), with a local fallback.
 */
export function QuoteBanner() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    (async () => {
      try {
        const res = await fetch(QUOTE_API_URL, { signal: controller.signal });
        const data = await res.json();
        const item = Array.isArray(data) ? data[0] : data;
        if (active && item?.q) {
          setQuote({ text: item.q, author: item.a ?? 'Unknown' });
          return;
        }
        throw new Error('unexpected shape');
      } catch {
        if (active) setQuote(FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)]);
      } finally {
        clearTimeout(timer);
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  return (
    <View style={styles.banner}>
      {loading || !quote ? (
        <ActivityIndicator color={Colors.primaryLight} />
      ) : (
        <>
          <Text style={styles.kicker}>Daily spark</Text>
          <Text style={styles.text}>“{quote.text}”</Text>
          <Text style={styles.author}>- {quote.author}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.xl,
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(124,92,255,0.14)',
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 78,
    justifyContent: 'center',
  },
  kicker: {
    fontSize: 12,
    color: '#7E7AC0',
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  text: { fontSize: 14.5, lineHeight: 21, color: '#D7D7E2', fontStyle: 'italic' },
  author: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 7 },
});
