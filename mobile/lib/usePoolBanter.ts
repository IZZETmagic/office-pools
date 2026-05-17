import { useCallback, useEffect, useRef, useState } from 'react';

import { notifyMention } from './api';
import { useAuth } from './auth';
import { supabase } from './supabase';

export type BanterMessage = {
  messageId: string;
  poolId: string;
  userId: string;
  content: string;
  messageType: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  senderName: string;
  senderUsername: string | null;
};

export type PoolMember = {
  userId: string;
  fullName: string;
  username: string;
};

export type ReactionAggregate = {
  emoji: string;
  count: number;
  userIds: string[];
};

type DbReactionRow = {
  reaction_id: string;
  message_id: string;
  user_id: string;
  emoji: string;
};

type DbMessageRow = {
  message_id: string;
  pool_id: string;
  user_id: string;
  content: string;
  message_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DbUserRow = {
  user_id: string;
  full_name: string | null;
  username: string | null;
};

const PAGE_SIZE = 50;

function aggregateReactions(
  rows: DbReactionRow[],
): Map<string, ReactionAggregate[]> {
  const byMessage = new Map<string, Map<string, ReactionAggregate>>();
  for (const r of rows) {
    let perEmoji = byMessage.get(r.message_id);
    if (!perEmoji) {
      perEmoji = new Map();
      byMessage.set(r.message_id, perEmoji);
    }
    let agg = perEmoji.get(r.emoji);
    if (!agg) {
      agg = { emoji: r.emoji, count: 0, userIds: [] };
      perEmoji.set(r.emoji, agg);
    }
    agg.count += 1;
    agg.userIds.push(r.user_id);
  }
  const result = new Map<string, ReactionAggregate[]>();
  for (const [msgId, perEmoji] of byMessage) {
    result.set(msgId, Array.from(perEmoji.values()));
  }
  return result;
}
const MENTION_REGEX = /@(\w+)/g;

export function extractMentionUsernames(content: string): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(content)) !== null) {
    out.push(match[1]);
  }
  return Array.from(new Set(out));
}

export function detectMentionQuery(text: string): string | null {
  const m = text.match(/(?:^|\s)@(\w*)$/);
  return m ? m[1] : null;
}

export function replaceMentionQuery(text: string, username: string): string {
  return text.replace(/(^|\s)@\w*$/, `$1@${username} `);
}

export function parseMentionSegments(
  content: string,
): Array<{ text: string; isMention: boolean }> {
  const out: Array<{ text: string; isMention: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = /@(\w+)/g;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      out.push({ text: content.slice(lastIndex, match.index), isMention: false });
    }
    out.push({ text: match[0], isMention: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    out.push({ text: content.slice(lastIndex), isMention: false });
  }
  return out;
}

export function usePoolBanter(poolId: string | undefined) {
  const { user: authUser } = useAuth();
  const [appUserId, setAppUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BanterMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<PoolMember[]>([]);
  const membersRef = useRef<PoolMember[]>([]);
  const [reactions, setReactions] = useState<Map<string, ReactionAggregate[]>>(new Map());
  const userCacheRef = useRef<Map<string, DbUserRow>>(new Map());
  const messageIdsRef = useRef<Set<string>>(new Set());

  const fetchAppUserId = useCallback(async () => {
    if (!authUser) {
      setAppUserId(null);
      return null;
    }
    const { data } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    const id = (data as { user_id: string } | null)?.user_id ?? null;
    setAppUserId(id);
    return id;
  }, [authUser]);

  const hydrateSenders = useCallback(async (rows: DbMessageRow[]) => {
    const missing = new Set<string>();
    for (const r of rows) {
      if (!userCacheRef.current.has(r.user_id)) missing.add(r.user_id);
    }
    if (missing.size === 0) return;
    const { data } = await supabase
      .from('users')
      .select('user_id, full_name, username')
      .in('user_id', Array.from(missing));
    for (const u of (data as DbUserRow[] | null) ?? []) {
      userCacheRef.current.set(u.user_id, u);
    }
  }, []);

  const decorate = useCallback((row: DbMessageRow): BanterMessage => {
    const u = userCacheRef.current.get(row.user_id);
    return {
      messageId: row.message_id,
      poolId: row.pool_id,
      userId: row.user_id,
      content: row.content,
      messageType: row.message_type ?? 'text',
      metadata: row.metadata,
      createdAt: row.created_at,
      senderName: u?.full_name ?? u?.username ?? 'Member',
      senderUsername: u?.username ?? null,
    };
  }, []);

  const load = useCallback(async () => {
    if (!poolId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('pool_messages')
        .select('message_id, pool_id, user_id, content, message_type, metadata, created_at')
        .eq('pool_id', poolId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (fetchErr) throw fetchErr;
      const rows = ((data as DbMessageRow[] | null) ?? []).slice().reverse();
      await hydrateSenders(rows);
      setMessages(rows.map(decorate));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages');
      console.warn('[usePoolBanter.load]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId, hydrateSenders, decorate]);

  const fetchUnread = useCallback(async () => {
    if (!poolId || !appUserId) {
      setUnreadCount(0);
      return;
    }
    try {
      const { data: memberRows } = await supabase
        .from('pool_members')
        .select('last_read_at')
        .eq('pool_id', poolId)
        .eq('user_id', appUserId)
        .maybeSingle();
      const lastReadAt = (memberRows as { last_read_at: string | null } | null)?.last_read_at ?? null;
      let query = supabase
        .from('pool_messages')
        .select('*', { count: 'exact', head: true })
        .eq('pool_id', poolId)
        .neq('user_id', appUserId);
      if (lastReadAt) query = query.gt('created_at', lastReadAt);
      const { count } = await query;
      setUnreadCount(count ?? 0);
    } catch (err) {
      console.warn('[usePoolBanter.fetchUnread]', err);
    }
  }, [poolId, appUserId]);

  const loadMembers = useCallback(async () => {
    if (!poolId) return;
    try {
      const { data: memberRows } = await supabase
        .from('pool_members')
        .select('user_id')
        .eq('pool_id', poolId);
      const userIds = ((memberRows as { user_id: string }[] | null) ?? []).map((r) => r.user_id);
      if (userIds.length === 0) {
        setMembers([]);
        return;
      }
      const { data: userRows } = await supabase
        .from('users')
        .select('user_id, full_name, username')
        .in('user_id', userIds);
      const ms: PoolMember[] = ((userRows as DbUserRow[] | null) ?? [])
        .filter((u) => u.username)
        .map((u) => ({
          userId: u.user_id,
          fullName: u.full_name ?? u.username ?? 'Member',
          username: u.username ?? '',
        }));
      setMembers(ms);
    } catch (err) {
      console.warn('[usePoolBanter.loadMembers]', err);
    }
  }, [poolId]);

  const loadReactions = useCallback(async (messageIds: string[]) => {
    if (messageIds.length === 0) {
      setReactions(new Map());
      return;
    }
    try {
      const { data } = await supabase
        .from('pool_message_reactions')
        .select('reaction_id, message_id, user_id, emoji')
        .in('message_id', messageIds);
      const rows = ((data as DbReactionRow[] | null) ?? []);
      setReactions(aggregateReactions(rows));
    } catch (err) {
      console.warn('[usePoolBanter.loadReactions]', err);
    }
  }, []);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!appUserId) return;
      let userHadReacted = false;
      setReactions((prev) => {
        const next = new Map(prev);
        const arr = (next.get(messageId) ?? []).map((r) => ({
          ...r,
          userIds: [...r.userIds],
        }));
        const idx = arr.findIndex((r) => r.emoji === emoji);
        if (idx >= 0 && arr[idx].userIds.includes(appUserId)) {
          userHadReacted = true;
          arr[idx].count -= 1;
          arr[idx].userIds = arr[idx].userIds.filter((id) => id !== appUserId);
          if (arr[idx].count <= 0) arr.splice(idx, 1);
        } else if (idx >= 0) {
          arr[idx].count += 1;
          arr[idx].userIds.push(appUserId);
        } else {
          arr.push({ emoji, count: 1, userIds: [appUserId] });
        }
        if (arr.length === 0) next.delete(messageId);
        else next.set(messageId, arr);
        return next;
      });
      try {
        if (userHadReacted) {
          await supabase
            .from('pool_message_reactions')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', appUserId)
            .eq('emoji', emoji);
        } else {
          await supabase
            .from('pool_message_reactions')
            .insert({ message_id: messageId, user_id: appUserId, emoji });
        }
      } catch (err) {
        console.warn('[usePoolBanter.toggleReaction]', err);
      }
    },
    [appUserId],
  );

  const markAsRead = useCallback(async () => {
    if (!poolId || !appUserId) return;
    try {
      await supabase
        .from('pool_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('pool_id', poolId)
        .eq('user_id', appUserId);
      setUnreadCount(0);
    } catch (err) {
      console.warn('[usePoolBanter.markAsRead]', err);
    }
  }, [poolId, appUserId]);

  const sendMessage = useCallback(
    async (
      text: string,
      options?: { messageType?: string; metadata?: Record<string, unknown> | null },
    ): Promise<{ error?: string }> => {
      const trimmed = text.trim();
      if (!trimmed) return { error: 'Empty message' };
      if (!poolId || !appUserId) return { error: 'Not ready' };
      setSending(true);
      const messageType = options?.messageType ?? 'text';
      const metadata = options?.metadata ?? null;
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimistic: BanterMessage = {
        messageId: tempId,
        poolId,
        userId: appUserId,
        content: trimmed,
        messageType,
        metadata,
        createdAt: new Date().toISOString(),
        senderName: 'You',
        senderUsername: null,
      };
      setMessages((prev) => [...prev, optimistic]);
      try {
        const insertPayload: Record<string, unknown> = {
          pool_id: poolId,
          user_id: appUserId,
          content: trimmed,
          message_type: messageType,
        };
        if (metadata) insertPayload.metadata = metadata;
        const { data, error: insertErr } = await supabase
          .from('pool_messages')
          .insert(insertPayload)
          .select('message_id, pool_id, user_id, content, message_type, metadata, created_at')
          .single();
        if (insertErr) throw insertErr;
        const row = data as DbMessageRow;
        await hydrateSenders([row]);
        setMessages((prev) =>
          prev.map((m) => (m.messageId === tempId ? decorate(row) : m)),
        );
        const mentionedUsernames = extractMentionUsernames(trimmed);
        if (mentionedUsernames.length > 0) {
          const idByUsername = new Map(
            membersRef.current.map((m) => [m.username.toLowerCase(), m.userId]),
          );
          const mentionedIds = Array.from(
            new Set(
              mentionedUsernames
                .map((u) => idByUsername.get(u.toLowerCase()))
                .filter((id): id is string => !!id && id !== appUserId),
            ),
          );
          if (mentionedIds.length > 0) {
            void notifyMention(poolId, trimmed, mentionedIds).catch((err) => {
              console.warn('[usePoolBanter.notifyMention]', err);
            });
          }
        }
        return {};
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.messageId !== tempId));
        const msg = err instanceof Error ? err.message : 'Send failed';
        console.warn('[usePoolBanter.sendMessage]', err);
        return { error: msg };
      } finally {
        setSending(false);
      }
    },
    [poolId, appUserId, hydrateSenders, decorate],
  );

  useEffect(() => {
    void fetchAppUserId();
  }, [fetchAppUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    void fetchUnread();
  }, [fetchUnread, messages.length]);

  useEffect(() => {
    const ids = messages.map((m) => m.messageId).filter((id) => !id.startsWith('tmp-'));
    messageIdsRef.current = new Set(ids);
    void loadReactions(ids);
  }, [messages, loadReactions]);

  useEffect(() => {
    if (!poolId) return;
    const channelName = `pool-banter-${poolId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pool_messages', filter: `pool_id=eq.${poolId}` },
        async (payload) => {
          const row = payload.new as DbMessageRow;
          await hydrateSenders([row]);
          setMessages((prev) => {
            if (prev.some((m) => m.messageId === row.message_id)) return prev;
            const withoutOptimistic = prev.filter(
              (m) => !(m.messageId.startsWith('tmp-') && m.content === row.content && m.userId === row.user_id),
            );
            return [...withoutOptimistic, decorate(row)];
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pool_message_reactions' },
        (payload) => {
          const row = payload.new as DbReactionRow;
          if (!messageIdsRef.current.has(row.message_id)) return;
          setReactions((prev) => {
            const next = new Map(prev);
            const arr = (next.get(row.message_id) ?? []).map((r) => ({
              ...r,
              userIds: [...r.userIds],
            }));
            const idx = arr.findIndex((r) => r.emoji === row.emoji);
            if (idx >= 0) {
              if (arr[idx].userIds.includes(row.user_id)) return prev;
              arr[idx].count += 1;
              arr[idx].userIds.push(row.user_id);
            } else {
              arr.push({ emoji: row.emoji, count: 1, userIds: [row.user_id] });
            }
            next.set(row.message_id, arr);
            return next;
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'pool_message_reactions' },
        (payload) => {
          const row = payload.old as DbReactionRow;
          if (!messageIdsRef.current.has(row.message_id)) return;
          setReactions((prev) => {
            const arr = (prev.get(row.message_id) ?? []).map((r) => ({
              ...r,
              userIds: [...r.userIds],
            }));
            const idx = arr.findIndex((r) => r.emoji === row.emoji);
            if (idx < 0) return prev;
            arr[idx].count -= 1;
            arr[idx].userIds = arr[idx].userIds.filter((id) => id !== row.user_id);
            if (arr[idx].count <= 0) arr.splice(idx, 1);
            const next = new Map(prev);
            if (arr.length === 0) next.delete(row.message_id);
            else next.set(row.message_id, arr);
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [poolId, hydrateSenders, decorate]);

  return {
    messages,
    members,
    reactions,
    loading,
    sending,
    error,
    unreadCount,
    appUserId,
    sendMessage,
    markAsRead,
    toggleReaction,
    refresh: load,
  };
}
