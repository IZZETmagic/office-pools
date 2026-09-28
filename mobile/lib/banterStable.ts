// =============================================================
// Banter — keep object identity when nothing actually changed
// =============================================================
// The banter list skips re-rendering a bubble only when that bubble's message
// object and reaction array are the SAME objects as last render (see
// `BanterBubble`'s memo compare in BanterSheet). Everything upstream rebuilds
// fresh objects — a refresh re-decorates all 50 rows, a reactions fetch
// re-aggregates every array — so without these helpers every update looks
// like a change to every bubble and the whole list redraws.
//
// ⚠ Each comparison must cover EVERY field a bubble draws. A field left out
// here is a bubble that silently keeps showing the old value.
// =============================================================

export type ReactionAggregate = {
  emoji: string;
  count: number;
  userIds: string[];
};

export function sameReactionAggregates(
  a: readonly ReactionAggregate[],
  b: readonly ReactionAggregate[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.emoji !== y.emoji || x.count !== y.count) return false;
    if (x.userIds.length !== y.userIds.length) return false;
    for (let j = 0; j < x.userIds.length; j++) {
      if (x.userIds[j] !== y.userIds[j]) return false;
    }
  }
  return true;
}

// Fold a freshly fetched set of aggregates for `ids` into the current map.
// `ids` is the set that was QUERIED — an id in it with no fetched row has no
// reactions any more, so it is removed. Ids outside it are left alone (they
// are kept live by the realtime handlers). An entry that is structurally
// unchanged keeps its old array, and if nothing changed at all the previous
// Map itself is returned, so React bails out of the update entirely.
export function mergeReactionAggregates(
  prev: Map<string, ReactionAggregate[]>,
  fetched: Map<string, ReactionAggregate[]>,
  ids: readonly string[],
): Map<string, ReactionAggregate[]> {
  let next: Map<string, ReactionAggregate[]> | null = null;
  for (const id of ids) {
    const incoming = fetched.get(id);
    const current = prev.get(id);
    if (!incoming || incoming.length === 0) {
      if (current) {
        next ??= new Map(prev);
        next.delete(id);
      }
      continue;
    }
    if (current && sameReactionAggregates(current, incoming)) continue;
    next ??= new Map(prev);
    next.set(id, incoming);
  }
  return next ?? prev;
}

// The subset of a gifted-chat message the banter bubble draws. Structural so
// this file doesn't import gifted-chat.
export type StableChatMessage = {
  _id: string | number;
  text: string;
  createdAt: Date | number;
  user: { _id: string | number; name?: string };
  _showSenderName: boolean;
  _isLastOfGroup: boolean;
  _messageType: string;
  _metadata: Record<string, unknown> | null;
  /** Who took it back (148): the sender ('self'), an admin ('admin'), or nobody. */
  _deleted?: 'self' | 'admin' | null;
  replyMessage?: {
    _id: string | number;
    text: string;
    user: { _id: string | number; name?: string };
  };
};

function timeOf(d: Date | number): number {
  return typeof d === 'number' ? d : d.getTime();
}

// Metadata is a small JSON blob (rich cards only); a refresh hands back a new
// object with the same contents, so compare by value.
function sameMetadata(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function sameChatMessage(a: StableChatMessage, b: StableChatMessage): boolean {
  if (a === b) return true;
  if (
    a._id !== b._id ||
    a.text !== b.text ||
    timeOf(a.createdAt) !== timeOf(b.createdAt) ||
    a.user._id !== b.user._id ||
    a.user.name !== b.user.name ||
    a._showSenderName !== b._showSenderName ||
    a._isLastOfGroup !== b._isLastOfGroup ||
    a._messageType !== b._messageType ||
    (a._deleted ?? null) !== (b._deleted ?? null)
  ) {
    return false;
  }
  if (!sameMetadata(a._metadata, b._metadata)) return false;
  const ra = a.replyMessage;
  const rb = b.replyMessage;
  if (!ra || !rb) return !ra && !rb;
  return (
    ra._id === rb._id &&
    ra.text === rb.text &&
    ra.user._id === rb.user._id &&
    ra.user.name === rb.user.name
  );
}

// Return `fresh`, or the cached object with the same id when it is unchanged.
export function reuseIfUnchanged<T extends StableChatMessage>(
  cache: Map<string, T>,
  fresh: T,
): T {
  const cached = cache.get(String(fresh._id));
  return cached && sameChatMessage(cached, fresh) ? cached : fresh;
}
