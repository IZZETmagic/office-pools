import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type EntryRoundSubmission = {
  id: string;
  entryId: string;
  roundKey: string;
  hasSubmitted: boolean;
  submittedAt: string | null;
  autoSubmitted: boolean;
  predictionCount: number;
};

type DbRow = {
  id: string;
  entry_id: string;
  round_key: string;
  has_submitted: boolean;
  submitted_at: string | null;
  auto_submitted: boolean | null;
  prediction_count: number | null;
};

export function useEntryRoundSubmissions(entryId: string | undefined) {
  const [submissions, setSubmissions] = useState<Map<string, EntryRoundSubmission>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!entryId) {
      setSubmissions(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('entry_round_submissions')
        .select('id, entry_id, round_key, has_submitted, submitted_at, auto_submitted, prediction_count')
        .eq('entry_id', entryId);
      if (err) throw err;
      const map = new Map<string, EntryRoundSubmission>();
      for (const r of (data as DbRow[] | null) ?? []) {
        map.set(r.round_key, {
          id: r.id,
          entryId: r.entry_id,
          roundKey: r.round_key,
          hasSubmitted: r.has_submitted,
          submittedAt: r.submitted_at,
          autoSubmitted: !!r.auto_submitted,
          predictionCount: r.prediction_count ?? 0,
        });
      }
      setSubmissions(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
      console.warn('[useEntryRoundSubmissions]', err);
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { submissions, loading, error, refresh: load };
}
