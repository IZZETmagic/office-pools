import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/

type SubscriptionInput = {
  provider?: unknown
  plan_name?: unknown
  monthly_cost_cents?: unknown
  currency?: unknown
  start_date?: unknown
  ended_at?: unknown
  notes?: unknown
}

function validate(body: SubscriptionInput): { ok: true; value: {
  provider: string
  plan_name: string
  monthly_cost_cents: number
  currency: string
  start_date: string
  ended_at: string | null
  notes: string | null
} } | { ok: false; error: string } {
  const provider = typeof body.provider === 'string' ? body.provider.trim() : ''
  if (!provider) return { ok: false, error: 'Provider is required.' }

  const plan_name = typeof body.plan_name === 'string' ? body.plan_name.trim() : ''
  if (!plan_name) return { ok: false, error: 'Plan name is required.' }

  const cents = typeof body.monthly_cost_cents === 'number'
    ? Math.round(body.monthly_cost_cents)
    : NaN
  if (!Number.isFinite(cents) || cents < 0) {
    return { ok: false, error: 'Monthly cost must be a non-negative integer (cents).' }
  }

  const currency = typeof body.currency === 'string' && body.currency.trim()
    ? body.currency.trim().toUpperCase()
    : 'USD'
  if (!CURRENCY_RE.test(currency)) {
    return { ok: false, error: 'Currency must be a 3-letter ISO code.' }
  }

  const start_date = typeof body.start_date === 'string' ? body.start_date.trim() : ''
  if (!ISO_DATE_RE.test(start_date)) {
    return { ok: false, error: 'start_date must be in YYYY-MM-DD format.' }
  }

  let ended_at: string | null = null
  if (body.ended_at != null && body.ended_at !== '') {
    if (typeof body.ended_at !== 'string' || !ISO_DATE_RE.test(body.ended_at)) {
      return { ok: false, error: 'ended_at must be in YYYY-MM-DD format.' }
    }
    if (body.ended_at < start_date) {
      return { ok: false, error: 'ended_at must be on or after start_date.' }
    }
    ended_at = body.ended_at
  }

  const notes = typeof body.notes === 'string' && body.notes.trim()
    ? body.notes.trim()
    : null

  return {
    ok: true,
    value: { provider, plan_name, monthly_cost_cents: cents, currency, start_date, ended_at, notes },
  }
}

// GET — list all subscription periods
export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('subscription_periods')
    .select('*')
    .order('provider', { ascending: true })
    .order('start_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ periods: data ?? [] })
}

// POST — create a new subscription period
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const body = (await request.json()) as SubscriptionInput
  const result = validate(body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  const v = result.value

  const adminClient = createAdminClient()
  const { data: row, error: insertError } = await adminClient
    .from('subscription_periods')
    .insert({
      provider: v.provider,
      plan_name: v.plan_name,
      monthly_cost_cents: v.monthly_cost_cents,
      currency: v.currency,
      start_date: v.start_date,
      ended_at: v.ended_at,
      notes: v.notes,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  await adminClient.from('admin_audit_log').insert({
    action: 'subscription_period_created',
    performed_by: userData.user_id,
    summary: `Added ${v.provider} · ${v.plan_name} · ${v.currency} ${v.monthly_cost_cents / 100}/mo`,
    details: {
      period_id: row.period_id,
      provider: v.provider,
      plan_name: v.plan_name,
      monthly_cost_cents: v.monthly_cost_cents,
      currency: v.currency,
      start_date: v.start_date,
      ended_at: v.ended_at,
    },
  })

  return NextResponse.json({ period: row })
}
