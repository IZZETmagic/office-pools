import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';

export type EntryAdjustment = {
  id: string;
  amount: number;
  reason: string;
  createdAt: string;
};

type Row = {
  id: string;
  amount: number;
  reason: string | null;
  created_at: string;
};

export function useEntryAdjustments(entryId: string | undefined) {
  const [adjustments, setAdjustments] = useState<EntryAdjustment[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!entryId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('point_adjustments')
        .select('id, amount, reason, created_at')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      setAdjustments(
        rows.map((r) => ({
          id: r.id,
          amount: r.amount,
          reason: r.reason ?? '',
          createdAt: r.created_at,
        })),
      );
    } catch (err) {
      console.warn('[useEntryAdjustments]', err);
      setAdjustments([]);
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { adjustments, loading, refresh: load };
}
