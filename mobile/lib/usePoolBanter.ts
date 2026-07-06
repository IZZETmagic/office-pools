import { useCallback, useEffect, useRef, useState } from 'react';

import { notifyMention, notifyMessage } from './api';
import { useAuth } from './auth';
import { refreshIconBadge } from './badgeSync';
import { supabase } from './supabase';

// Reference to the message a reply is targeting. Carries enough
// denormalized info that the bubble's quote-pill can render the
// parent's text + sender without a second lookup. `userId` is kept
// for cases where the renderer wants to colour-match the gradient
// avatar of the original sender.
export type BanterReplyRef = {
  messageId: string;
  content: string;
  userId: string;
  senderName: string;
  senderUsername: string | null;
};

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
  // Resolved info about the message this one is replying to, or null
  // when the message isn't a reply (or the parent is outside the
  // currently-loaded page and couldn't be hydrated).
  replyTo: BanterReplyRef | null;
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
  reply_to_message_id: string | null;
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

// Broadcast-from-database payload envelope. The DB trigger sends
// `realtime.send({ record: <row> }, ...)`; the client `.on('broadcast')`
// callback receives it under `.payload`. We also accept a top-level `record`
// defensively in case a client version delivers it un-nested — either way we
// get the row (or undefined if the shape is unexpected).
function broadcastRecord<T>(msg: unknown): T | undefined {
  const m = msg as { payload?: { record?: T }; record?: T } | undefined;
  return m?.payload?.record ?? m?.record;
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
  // Scroll-up pagination. `hasMore` gates whether another older page can
  // be fetched; `loadingOlder` guards against overlapping fetches and
  // drives the top spinner. Refs mirror both so `loadOlder` can stay a
  // stable callback and read the latest values without stale closures.
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadingOlderRef = useRef(false);
  const hasMoreRef = useRef(true);
  const messagesRef = useRef<BanterMessage[]>([]);

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

  // Given a set of message rows whose `reply_to_message_id`s may
  // point at parents OUTSIDE the rows themselves, fetch any missing
  // parents in one round-trip and build a lookup map keyed by
  // message_id. The caller uses the map to resolve replyTo refs.
  // We dropped Supabase's resource-embedding (`reply_to:pool_messages
  // !reply_to_message_id(...)`) here because PostgREST returns
  // unexpected shapes for self-referential FKs (sometimes `[]`,
  // sometimes the parent object, sometimes `null`) — too easy to
  // mis-handle as truthy and end up rendering a phantom reply pill
  // on every message.
  const buildParentLookup = useCallback(
    async (rows: DbMessageRow[]): Promise<Map<string, DbMessageRow>> => {
      const byId = new Map<string, DbMessageRow>();
      for (const r of rows) byId.set(r.message_id, r);
      const replyIds = rows
        .map((r) => r.reply_to_message_id)
        .filter((id): id is string => !!id);
      const missingParents = replyIds.filter((id) => !byId.has(id));
      if (missingParents.length === 0) return byId;
      const { data: parents } = await supabase
        .from('pool_messages')
        .select(
          'message_id, pool_id, user_id, content, message_type, metadata, created_at, reply_to_message_id',
        )
        .in('message_id', missingParents);
      const parentRows = (parents as DbMessageRow[] | null) ?? [];
      // Cache parent senders so replyRefFromParentRow / decorate can
      // resolve the @handle without yet another round-trip.
      await hydrateSenders(parentRows);
      for (const p of parentRows) byId.set(p.message_id, p);
      return byId;
    },
    [hydrateSenders],
  );

  const decorate = useCallback(
    (row: DbMessageRow, replyTo: BanterReplyRef | null = null): BanterMessage => {
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
        replyTo,
      };
    },
    [],
  );

  // Resolve a BanterReplyRef from a parent DB row. Assumes the
  // parent's user has already been added to `userCacheRef` by
  // `hydrateSenders`. Defensive: rejects falsy parents AND parents
  // with a missing message_id (which would otherwise produce a
  // phantom reply pill rendered with a "Member" fallback name).
  const replyRefFromParentRow = useCallback(
    (parent: DbMessageRow | null | undefined): BanterReplyRef | null => {
      if (!parent || !parent.message_id) return null;
      const u = userCacheRef.current.get(parent.user_id);
      return {
        messageId: parent.message_id,
        content: parent.content,
        userId: parent.user_id,
        senderName: u?.full_name ?? u?.username ?? 'Member',
        senderUsername: u?.username ?? null,
      };
    },
    [],
  );

  // Resolve a BanterReplyRef from an already-decorated parent in the
  // current messages list. Used by the realtime INSERT handler where
  // the postgres_changes payload doesn't carry the join.
  const replyRefFromMessage = useCallback(
    (parent: BanterMessage | undefined | null): BanterReplyRef | null => {
      if (!parent) return null;
      return {
        messageId: parent.messageId,
        content: parent.content,
        userId: parent.userId,
        senderName: parent.senderName,
        senderUsername: parent.senderUsername,
      };
    },
    [],
  );

  const load = useCallback(async () => {
    if (!poolId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('pool_messages')
        .select(
          'message_id, pool_id, user_id, content, message_type, metadata, created_at, reply_to_message_id',
        )
        .eq('pool_id', poolId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (fetchErr) throw fetchErr;
      const raw = (data as DbMessageRow[] | null) ?? [];
      // A full page implies there may be older messages to page in later.
      hasMoreRef.current = raw.length === PAGE_SIZE;
      setHasMore(hasMoreRef.current);
      const rows = raw.slice().reverse();
      await hydrateSenders(rows);
      // Build a lookup of every parent message any row in this page
      // is replying to, including parents that live OUTSIDE this
      // page (older messages). Then decorate each row with its
      // resolved replyTo. Rows whose `reply_to_message_id` is null
      // get `replyTo: null` and render without a quote pill.
      const parentLookup = await buildParentLookup(rows);
      setMessages(
        rows.map((row) => {
          const parent = row.reply_to_message_id
            ? parentLookup.get(row.reply_to_message_id)
            : null;
          return decorate(row, replyRefFromParentRow(parent));
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages');
      console.warn('[usePoolBanter.load]', err);
    } finally {
      setLoading(false);
    }
  }, [poolId, hydrateSenders, decorate, replyRefFromParentRow, buildParentLookup]);

  // Page in the previous PAGE_SIZE messages older than the oldest one we
  // currently hold, using a keyset cursor on created_at. Safe to call
  // speculatively from onScroll: it no-ops when a fetch is already in
  // flight or when we've reached the start of the conversation.
  const loadOlder = useCallback(async () => {
    if (!poolId) return;
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    // messages are chronological (oldest-first); the first non-optimistic
    // row is our cursor. tmp- rows have no server created_at, so skip them.
    const oldest = messagesRef.current.find((m) => !m.messageId.startsWith('tmp-'));
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const { data, error: fetchErr } = await supabase
        .from('pool_messages')
        .select(
          'message_id, pool_id, user_id, content, message_type, metadata, created_at, reply_to_message_id',
        )
        .eq('pool_id', poolId)
        .lt('created_at', oldest.createdAt)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (fetchErr) throw fetchErr;
      const older = ((data as DbMessageRow[] | null) ?? []).slice().reverse();
      // A short page means we've reached the beginning of history.
      if (older.length < PAGE_SIZE) {
        hasMoreRef.current = false;
        setHasMore(false);
      }
      if (older.length === 0) return;
      await hydrateSenders(older);
      const parentLookup = await buildParentLookup(older);
      const decorated = older.map((row) => {
        const parent = row.reply_to_message_id
          ? parentLookup.get(row.reply_to_message_id)
          : null;
        return decorate(row, replyRefFromParentRow(parent));
      });
      // Prepend, de-duping by id so a boundary row sharing the cursor's
      // created_at (or one a realtime insert already added) can't double up.
      setMessages((prev) => {
        const existing = new Set(prev.map((m) => m.messageId));
        const fresh = decorated.filter((m) => !existing.has(m.messageId));
        if (fresh.length === 0) return prev;
        return [...fresh, ...prev];
      });
    } catch (err) {
      console.warn('[usePoolBanter.loadOlder]', err);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [poolId, hydrateSenders, decorate, replyRefFromParentRow, buildParentLookup]);

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
      // Re-sync the OS app icon badge from server truth. Banter unread count
      // just dropped for this pool, but the OS badge value is independent —
      // it sits at whatever the last push set it to. Without this refresh
      // the icon shows a stale count until the next push (or app foreground)
      // arrives. The PendingActionsProvider's realtime subscription on
      // pool_members UPDATE will also catch this and re-sync the in-app
      // dots, but the OS badge update needs an explicit setBadgeCountAsync
      // call which only `refreshIconBadge` makes.
      void refreshIconBadge(supabase, appUserId);
    } catch (err) {
      console.warn('[usePoolBanter.markAsRead]', err);
    }
  }, [poolId, appUserId]);

  const sendMessage = useCallback(
    async (
      text: string,
      options?: {
        messageType?: string;
        metadata?: Record<string, unknown> | null;
        // Set to the parent's message_id to send this as a reply.
        // Pass undefined / null / a tmp-id to send a plain message.
        // Optimistic replyTo is resolved by looking up the parent in
        // the current messages list (replyRefFromMessage); the
        // canonical replyTo comes back via the SELECT join.
        replyToMessageId?: string | null;
      },
    ): Promise<{ error?: string }> => {
      const trimmed = text.trim();
      if (!trimmed) return { error: 'Empty message' };
      if (!poolId || !appUserId) return { error: 'Not ready' };
      setSending(true);
      const messageType = options?.messageType ?? 'text';
      const metadata = options?.metadata ?? null;
      // Only persist real (non-tmp) parent ids — replying to an
      // unconfirmed optimistic message would FK-fail on insert.
      const replyToMessageId =
        options?.replyToMessageId && !options.replyToMessageId.startsWith('tmp-')
          ? options.replyToMessageId
          : null;
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Resolve optimistic replyTo from the message we're replying to,
      // if it's currently in state. This drives the quote-pill on the
      // optimistic bubble so users see their reply rendered correctly
      // before the round-trip completes.
      const optimisticReplyTo = replyToMessageId
        ? replyRefFromMessage(
            messages.find((m) => m.messageId === replyToMessageId),
          )
        : null;
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
        replyTo: optimisticReplyTo,
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
        if (replyToMessageId) insertPayload.reply_to_message_id = replyToMessageId;
        const { data, error: insertErr } = await supabase
          .from('pool_messages')
          .insert(insertPayload)
          .select(
            'message_id, pool_id, user_id, content, message_type, metadata, created_at, reply_to_message_id',
          )
          .single();
        if (insertErr) throw insertErr;
        const row = data as DbMessageRow;
        await hydrateSenders([row]);
        // Resolve the parent for the response row. We pass the
        // current messages snapshot to buildParentLookup so it can
        // satisfy the lookup from in-state if possible, falling back
        // to a tiny one-row fetch otherwise.
        const parentLookup = await buildParentLookup([row]);
        const parent = row.reply_to_message_id
          ? parentLookup.get(row.reply_to_message_id)
          : null;
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === tempId
              ? decorate(row, replyRefFromParentRow(parent))
              : m,
          ),
        );
        // Fire the general banter push to every other pool member.
        // The endpoint server-side filters out the sender, so we can
        // call it unconditionally. Errors are non-fatal — the message
        // is already persisted; we just log and move on rather than
        // failing the send.
        void notifyMessage(poolId, trimmed).catch((err) => {
          console.warn('[usePoolBanter.notifyMessage]', err);
        });
        // @mentions get the targeted-mention push on top of the
        // general one (different copy, only pings tagged users —
        // matches the Swift app's dual-fire behavior).
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
    [
      poolId,
      appUserId,
      hydrateSenders,
      decorate,
      messages,
      replyRefFromMessage,
      replyRefFromParentRow,
      buildParentLookup,
    ],
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
    messagesRef.current = messages;
    const ids = messages.map((m) => m.messageId).filter((id) => !id.startsWith('tmp-'));
    messageIdsRef.current = new Set(ids);
    void loadReactions(ids);
  }, [messages, loadReactions]);

  useEffect(() => {
    if (!poolId) return;
    let active = true;
    // Realtime via Broadcast-from-database (see
    // lib/migrations/022_banter_realtime_broadcast.sql). The old
    // `postgres_changes` CDC subscription was timing out under load
    // (PostgresCdcRls create_subscription), so new messages never arrived live
    // — you had to re-enter the pool to re-fetch. The DB now broadcasts each
    // message/reaction change to the private `pool:{id}` topic; no
    // per-subscriber CDC subscription, so it sidesteps that bottleneck.
    const channel = supabase
      .channel(`pool:${poolId}`, { config: { private: true } })
      .on('broadcast', { event: 'message_insert' }, async (msg) => {
        const row = broadcastRecord<DbMessageRow>(msg);
        if (!row) return;
        await hydrateSenders([row]);
        setMessages((prev) => {
          if (prev.some((m) => m.messageId === row.message_id)) return prev;
          const withoutOptimistic = prev.filter(
            (m) => !(m.messageId.startsWith('tmp-') && m.content === row.content && m.userId === row.user_id),
          );
          // Broadcast payloads don't carry FK joins — resolve the parent from
          // the current messages list. If the parent is older than our
          // PAGE_SIZE window or otherwise missing, replyTo lands as null and
          // the bubble renders without a quote pill (acceptable degradation).
          const replyTo = row.reply_to_message_id
            ? replyRefFromMessage(
                withoutOptimistic.find((m) => m.messageId === row.reply_to_message_id),
              )
            : null;
          return [...withoutOptimistic, decorate(row, replyTo)];
        });
      })
      .on('broadcast', { event: 'reaction_insert' }, (msg) => {
        const row = broadcastRecord<DbReactionRow>(msg);
        if (!row || !messageIdsRef.current.has(row.message_id)) return;
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
      })
      .on('broadcast', { event: 'reaction_delete' }, (msg) => {
        const row = broadcastRecord<DbReactionRow>(msg);
        if (!row || !messageIdsRef.current.has(row.message_id)) return;
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
      });
    // Private channels require the realtime socket to carry the user's JWT;
    // setAuth() is async, so subscribe only after it resolves (and only if the
    // effect is still mounted).
    void Promise.resolve(supabase.realtime.setAuth()).then(() => {
      if (active) channel.subscribe();
    });
    return () => {
      active = false;
      void channel.unsubscribe();
    };
  }, [poolId, hydrateSenders, decorate, replyRefFromMessage]);

  // Realtime sync of unread count across separate hook instances. The
  // BanterSheet and the pool detail screen each call usePoolBanter
  // independently, so their `unreadCount` states aren't shared. When the
  // sheet's markAsRead updates pool_members.last_read_at, the pool
  // detail's BanterFab would otherwise keep showing the stale count
  // until next render. Subscribing here means any UPDATE to my own
  // pool_members row (from any sheet, any device) triggers a re-fetch
  // in every mounted instance of this hook, including the one driving
  // the FAB.
  useEffect(() => {
    if (!poolId || !appUserId) return;
    const channel = supabase
      .channel(`pool-banter-read-${poolId}-${appUserId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pool_members',
          filter: `pool_id=eq.${poolId}`,
        },
        (payload) => {
          const row = payload.new as { user_id?: string } | null;
          if (row?.user_id !== appUserId) return;
          void fetchUnread();
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [poolId, appUserId, fetchUnread]);

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
    loadOlder,
    loadingOlder,
    hasMore,
  };
}
