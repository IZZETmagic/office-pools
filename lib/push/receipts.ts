// =============================================================
// Expo's push receipts — the phones that have gone (N4 step 3, 2026-10-07)
// =============================================================
// An Android push goes through Expo, which answers at once with a TICKET (it
// took the message) and, minutes later, a RECEIPT: whether Google's FCM took it
// in turn. A phone the app was uninstalled from turns up in the receipt as
// DeviceNotRegistered, and Expo's rule is to stop sending to it.
//
// The ticket's own errors already remove a token at send time (expo-push.ts),
// as APNs's 410 does for iPhones. This is the other half, read from the
// delivery record (migration 176), which keeps every ticket id: every 15
// minutes, the Expo rows at least 15 minutes old and not yet checked are looked
// up — 1,000 at a time, Expo's limit — and each is marked with Expo's answer.
// DeviceNotRegistered removes the token. Expo keeps a receipt 24 hours; a row
// past that is marked 'unavailable' instead of being asked about forever.
//
// Nothing here sends anything.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

/** Expo's advice: look 15 minutes after sending. */
export const RECEIPT_DELAY_MS = 15 * 60_000
/** Expo clears a receipt after 24 hours. */
export const RECEIPT_KEPT_MS = 24 * 3_600_000
/** Expo's limit on ids per request. */
export const RECEIPT_BATCH = 1000

const GET_RECEIPTS = 'https://exp.host/--/api/v2/push/getReceipts'

export type ExpoReceipt =
  | { status: 'ok' }
  | { status: 'error'; message?: string; details?: { error?: string } }

export type ReceiptDeps = {
  fetchReceipts: (ids: string[]) => Promise<Record<string, ExpoReceipt>>
}

export type ReceiptSummary = {
  /** Rows marked this run. */
  checked: number
  /** Receipts saying FCM took it. Not `ok`, which the route's own response uses. */
  okReceipts: number
  /** By Expo's error code. */
  errors: Record<string, number>
  /** Past Expo's 24 hours — marked, not asked about. */
  unavailable: number
  /** Asked about, with no receipt yet — asked again next run. */
  notReady: number
  tokensRemoved: number
}

type DueRow = { delivery_id: number; created_at: string; provider_id: string; push_token_id: string | null }
type Mark = { created_at: string; delivery_id: number; receipt_status: string }

/** Codes that mean OUR set-up is wrong, not one phone — every Android push is failing. */
const CONFIGURATION_FAULTS = ['InvalidCredentials', 'MismatchSenderId']

export async function checkPushReceipts(
  admin: SupabaseClient,
  now: number,
  deps: ReceiptDeps = { fetchReceipts },
): Promise<ReceiptSummary> {
  const summary: ReceiptSummary = { checked: 0, okReceipts: 0, errors: {}, unavailable: 0, notReady: 0, tokensRemoved: 0 }

  const { data, error } = await admin
    .from('notification_deliveries')
    .select('delivery_id, created_at, provider_id, push_token_id')
    .eq('provider', 'expo')
    .eq('status', 'sent')
    .is('receipt_checked_at', null)
    .not('provider_id', 'is', null)
    .lte('created_at', new Date(now - RECEIPT_DELAY_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(RECEIPT_BATCH)
  if (error) throw new Error(`push receipts: could not read the due rows: ${error.message}`)
  const due = (data ?? []) as DueRow[]
  if (due.length === 0) return summary

  const marks: Mark[] = []
  const gone = new Set<string>()
  const keptFrom = now - RECEIPT_KEPT_MS
  const fresh = due.filter((r) => Date.parse(r.created_at) > keptFrom)

  for (const r of due) {
    if (Date.parse(r.created_at) > keptFrom) continue
    marks.push({ created_at: r.created_at, delivery_id: r.delivery_id, receipt_status: 'unavailable' })
    summary.unavailable++
  }

  if (fresh.length > 0) {
    const receipts = await deps.fetchReceipts(fresh.map((r) => r.provider_id))
    for (const r of fresh) {
      const receipt = receipts[r.provider_id]
      if (!receipt) {
        summary.notReady++
        continue
      }
      const status = receipt.status === 'ok' ? 'ok' : (receipt.details?.error ?? 'error')
      if (status === 'ok') summary.okReceipts++
      else summary.errors[status] = (summary.errors[status] ?? 0) + 1
      if (status === 'DeviceNotRegistered' && r.push_token_id) gone.add(r.push_token_id)
      marks.push({ created_at: r.created_at, delivery_id: r.delivery_id, receipt_status: status })
    }
  }

  // Tokens first, rows second: if marking fails, the rows are asked about again next run and the
  // removal repeats as a no-op. The other order could mark a row and never remove its token.
  if (gone.size > 0) {
    const { data: removed, error: removeErr } = await admin.from('push_tokens').delete().in('id', [...gone]).select('id')
    if (removeErr) throw new Error(`push receipts: could not remove gone tokens: ${removeErr.message}`)
    summary.tokensRemoved = (removed ?? []).length
  }

  if (marks.length > 0) {
    const { data: n, error: markErr } = await admin.rpc('notification_deliveries_mark_receipts', { p_marks: marks })
    if (markErr) throw new Error(`push receipts: could not mark the rows: ${markErr.message}`)
    summary.checked = typeof n === 'number' ? n : 0
  }

  for (const code of CONFIGURATION_FAULTS) {
    if (summary.errors[code]) {
      console.error(`[push-receipts] ${summary.errors[code]} × ${code}: Expo cannot reach FCM with our credentials — every Android push is failing`)
    }
  }
  return summary
}

async function fetchReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
  const res = await fetch(GET_RECEIPTS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
    body: JSON.stringify({ ids }),
  })
  const json = (await res.json()) as { data?: Record<string, ExpoReceipt>; errors?: Array<{ code?: string; message?: string }> }
  if (!res.ok || (json.errors && json.errors.length > 0)) {
    const first = json.errors?.[0]
    throw new Error(`Expo getReceipts: HTTP ${res.status}${first ? ` ${first.code ?? ''} ${first.message ?? ''}` : ''}`.trim())
  }
  return json.data ?? {}
}
