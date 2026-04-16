import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

// PATCH — Update branding fields on a pool
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { userData } = auth.data
  const { id } = await params

  const body = await request.json()
  const adminClient = createAdminClient()

  // Only allow updating brand fields
  const allowedFields = ['brand_name', 'brand_slug', 'brand_emoji', 'brand_color', 'brand_accent', 'brand_logo_url', 'brand_landing_url']
  const updates: Record<string, any> = {}
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field] ?? null
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
  }

  // Validate slug if provided
  if (updates.brand_slug) {
    if (!/^[a-z0-9-]+$/.test(updates.brand_slug)) {
      return NextResponse.json({ error: 'Slug must be lowercase alphanumeric with hyphens only.' }, { status: 400 })
    }

    // Check uniqueness (excluding current pool)
    const { data: existing } = await adminClient
      .from('pools')
      .select('pool_id')
      .eq('brand_slug', updates.brand_slug)
      .neq('pool_id', id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: 'This slug is already in use.' }, { status: 409 })
    }
  }

  // Auto-update landing URL if slug changes
  if (updates.brand_slug) {
    updates.brand_landing_url = `/play/${updates.brand_slug}`
  }

  const { data, error } = await adminClient
    .from('pools')
    .update(updates)
    .eq('pool_id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  await adminClient.from('admin_audit_log').insert({
    action: 'update_branding',
    performed_by: userData.user_id,
    pool_id: id,
    summary: `Updated branding for "${data.pool_name}"`,
    details: { updated_fields: Object.keys(updates), ...updates },
  })

  return NextResponse.json({ pool: data })
}

// DELETE — Remove all branding from a pool (does not delete the pool)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error
  const { userData } = auth.data
  const { id } = await params

  const adminClient = createAdminClient()

  // Get pool name for audit log
  const { data: pool } = await adminClient
    .from('pools')
    .select('pool_name, brand_name')
    .eq('pool_id', id)
    .single()

  const { error } = await adminClient
    .from('pools')
    .update({
      brand_name: null,
      brand_slug: null,
      brand_emoji: null,
      brand_color: null,
      brand_accent: null,
      brand_logo_url: null,
      brand_landing_url: null,
    })
    .eq('pool_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Audit log
  await adminClient.from('admin_audit_log').insert({
    action: 'remove_branding',
    performed_by: userData.user_id,
    pool_id: id,
    summary: `Removed branding "${pool?.brand_name}" from "${pool?.pool_name}"`,
    details: { previous_brand_name: pool?.brand_name },
  })

  return NextResponse.json({ success: true })
}
