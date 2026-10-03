// =============================================================
// Banter moderation — report a message, block a member (158)
// =============================================================
// App Store guideline 1.2: any app with user-generated content must
// let people REPORT it and BLOCK whoever posted it.
//
// - Reporting goes through the web API (`/api/banter/report`), which
//   files it with `report_pool_message` (membership checked, the
//   snapshot taken server-side) and emails the support inbox.
// - Blocks are the member's own rows in `user_blocks`, written
//   directly. RLS lets a member see only their own, so the person
//   blocked can never find out.
// =============================================================

import { apiFetch } from './api';
import { supabase } from './supabase';

export const REPORT_REASONS = [
  { key: 'spam', label: 'Spam' },
  { key: 'offensive', label: 'Offensive' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'inappropriate_image', label: 'Inappropriate image' },
  { key: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

export function reportBanterMessage(messageId: string, reason: ReportReason, details?: string) {
  return apiFetch<{ reported: true; report_id: string }>('/api/banter/report', {
    method: 'POST',
    body: { message_id: messageId, reason, details: details ?? null },
  });
}

export async function fetchBlockedIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('user_blocks').select('blocked_id');
  if (error) throw error;
  return new Set((data ?? []).map((r: { blocked_id: string }) => r.blocked_id));
}

export async function blockMember(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('user_blocks')
    .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
  if (error) throw error;
}

/** RLS scopes the delete to the caller's own rows, so the blocked id is enough. */
export async function unblockMember(blockedId: string): Promise<void> {
  const { error } = await supabase.from('user_blocks').delete().eq('blocked_id', blockedId);
  if (error) throw error;
}

export type BlockedMember = { userId: string; fullName: string | null; username: string | null; blockedAt: string };

/** For Settings → Blocked members. */
export async function fetchBlockedMembers(): Promise<BlockedMember[]> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at, users!user_blocks_blocked_id_fkey(full_name, username)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    userId: r.blocked_id,
    fullName: r.users?.full_name ?? null,
    username: r.users?.username ?? null,
    blockedAt: r.created_at,
  }));
}
