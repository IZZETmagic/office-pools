import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/

type Patch = {
  provider?: string
  plan_name?: string
  monthly_cost_cents?: number
  currency?: string
  start_date?: string
  ended_at?: string | null
  notes?: string | null
}

function validatePatch(body: Record<string, unknown>): { ok: true; value: Patch } | { ok: false; error: string } {
  const out: Patch = {}

  if ('provider' in body) {
    if (typeof body.provider !== 'string' || !body.provider.trim()) {
      return { ok: false, error: 'provider must be a non-empty string.' }
    }
    out.provider = body.provider.trim()
  }
  if ('plan_name' in body) {
    if (typeof body.plan_name !== 'string' || !body.plan_name.trim()) {
      return { ok: false, error: 'plan_name must be a non-empty string.' }
    }
    out.plan_name = body.plan_name.trim()
  }
  if ('monthly_cost_cents' in body) {
    const cents = typeof body.monthly_cost_cents === 'number' ? Math.round(body.monthly_cost_cents) : NaN
    if (!Number.isFinite(cents) || cents < 0) {
      return { ok: false, error: 'monthly_cost_cents must be a non-negative integer.' }
    }
    out.monthly_cost_cents = cents
  }
  if ('currency' in body) {
    const c = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : ''
    if (!CURRENCY_RE.test(c)) {
      return { ok: false, error: 'currency must be a 3-letter ISO code.' }
    }
    out.currency = c
  }
  if ('start_date' in body) {
    if (typeof body.start_date !== 'string' || !ISO_DATE_RE.test(body.start_date)) {
      return { ok: false, error: 'start_date must be in YYYY-MM-DD format.' }
    }
    out.start_date = body.start_date
  }
  if ('ended_at' in body) {
    if (body.ended_at == null || body.ended_at === '') {
      out.ended_at = null
    } else if (typeof body.ended_at === 'string' && ISO_DATE_RE.test(body.ended_at)) {
      out.ended_at = body.ended_at
    } else {
      return { ok: false, error: 'ended_at must be YYYY-MM-DD or null.' }
    }
  }
  if ('notes' in body) {
    if (body.notes == null) {
      out.notes = null
    } else if (typeof body.notes === 'string') {
      out.notes = body.notes.trim() || null
    } else {
      return { ok: false, error: 'notes must be a string or null.' }
    }
  }

  return { ok: true, value: out }
}

// PATCH — update a subscription period
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ period_id: string }> },
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const { period_id } = await params
  if (!period_id) {
    return NextResponse.json({ error: 'Missing period_id.' }, { status: 400 })
  }

  const body = (await request.json()) as Record<string, unknown>
  const result = validatePatch(body)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  if (Object.keys(result.value).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Cross-field check: when both dates are present (current or new), ended_at >= start_date
  if (result.value.start_date || result.value.ended_at !== undefined) {
    const { data: current } = await adminClient
      .from('subscription_periods')
      .select('start_date, ended_at')
      .eq('period_id', period_id)
      .single()
    if (!current) {
      return NextResponse.json({ error: 'Subscription period not found.' }, { status: 404 })
    }
    const nextStart = result.value.start_date ?? current.start_date
    const nextEnd = result.value.ended_at !== undefined ? result.value.ended_at : current.ended_at
    if (nextEnd != null && nextEnd < nextStart) {
      return NextResponse.json({ error: 'ended_at must be on or after start_date.' }, { status: 400 })
    }
  }

  const { data: row, error: updateError } = await adminClient
    .from('subscription_periods')
    .update({ ...result.value, updated_at: new Date().toISOString() })
    .eq('period_id', period_id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: 'Subscription period not found.' }, { status: 404 })
  }

  await adminClient.from('admin_audit_log').insert({
    action: 'subscription_period_updated',
    performed_by: userData.user_id,
    summary: `Updated ${row.provider} · ${row.plan_name}`,
    details: { period_id, changes: result.value },
  })

  return NextResponse.json({ period: row })
}

// DELETE — remove a subscription period
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ period_id: string }> },
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const { period_id } = await params
  if (!period_id) {
    return NextResponse.json({ error: 'Missing period_id.' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: existing } = await adminClient
    .from('subscription_periods')
    .select('provider, plan_name')
    .eq('period_id', period_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Subscription period not found.' }, { status: 404 })
  }

  const { error: deleteError } = await adminClient
    .from('subscription_periods')
    .delete()
    .eq('period_id', period_id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  await adminClient.from('admin_audit_log').insert({
    action: 'subscription_period_deleted',
    performed_by: userData.user_id,
    summary: `Removed ${existing.provider} · ${existing.plan_name}`,
    details: { period_id, provider: existing.provider, plan_name: existing.plan_name },
  })

  return NextResponse.json({ ok: true })
}
