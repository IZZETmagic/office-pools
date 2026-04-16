'use client'

import { useState, useCallback, useRef } from 'react'
import type { SuperPoolData } from './page'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { logAuditEvent } from '@/lib/audit'
import { SpTable, type SpColumn } from './SpTable'

// =============================================
// TYPES
// =============================================
type BrandedPoolsTabProps = {
  pools: SuperPoolData[]
  setPools: (pools: SuperPoolData[]) => void
  onNavigateToPool?: (poolId: string) => void
}

type BrandFormState = {
  brand_name: string
  brand_slug: string
  brand_emoji: string
  brand_color: string
  brand_accent: string
  brand_logo_url: string
  logoFile: File | null
  logoPreview: string | null
}

type CreateFormState = BrandFormState & {
  pool_name: string
  description: string
  tournament_id: string
  prediction_mode: string
  prediction_deadline: string
  is_private: boolean
  max_participants: number
  max_entries_per_user: number
  entry_fee: string
  entry_fee_currency: string
  brand_prize_1st: string
  brand_prize_2nd: string
  brand_prize_3rd: string
}

type ViewState =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; pool: SuperPoolData }

type ActionModal =
  | { type: 'none' }
  | { type: 'add_to_existing'; pool?: SuperPoolData }
  | { type: 'remove_branding'; pool: SuperPoolData }

type Tournament = { id: string; name: string }

// =============================================
// HELPERS
// =============================================
const MODE_LABELS: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function darkenHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, (num >> 16) - amount)
  const g = Math.max(0, ((num >> 8) & 0x00ff) - amount)
  const b = Math.max(0, (num & 0x0000ff) - amount)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function formatDateFriendly(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTimeFriendly(time24: string): string {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

const thinBorder = '0.5px solid var(--sp-silver)66'
const cardBorder = '0.5px solid var(--sp-silver)80'
const spInput = 'w-full px-3 py-2 border sp-border-silver sp-radius-sm text-sm sp-text-ink sp-bg-surface sp-body focus:ring-2 focus:ring-primary-500'

const DEFAULT_BRAND_FORM: BrandFormState = {
  brand_name: '',
  brand_slug: '',
  brand_emoji: '',
  brand_color: '#1E3A8A',
  brand_accent: '#FFC300',
  brand_logo_url: '',
  logoFile: null,
  logoPreview: null,
}

const DEFAULT_CREATE_FORM: CreateFormState = {
  ...DEFAULT_BRAND_FORM,
  pool_name: '',
  description: '',
  tournament_id: '',
  prediction_mode: 'progressive',
  prediction_deadline: '',
  is_private: false,
  max_participants: 0,
  max_entries_per_user: 1,
  entry_fee: '',
  entry_fee_currency: 'USD',
  brand_prize_1st: '',
  brand_prize_2nd: '',
  brand_prize_3rd: '',
}

// =============================================
// MODAL SHELL
// =============================================
function ModalShell({
  title,
  danger,
  children,
  onSubmit,
  submitLabel,
  submitDisabled,
  onClose,
  saving,
  formError,
  wide,
}: {
  title: string
  danger?: boolean
  children: React.ReactNode
  onSubmit: () => void
  submitLabel: string
  submitDisabled?: boolean
  onClose: () => void
  saving: boolean
  formError: string | null
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative sp-bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl w-full p-6 max-h-[90vh] overflow-y-auto ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={`text-lg font-bold sp-heading mb-4 ${danger ? 'text-danger-700' : 'sp-text-ink'}`}>
          {title}
        </h3>
        {formError && <Alert variant="error" className="mb-4">{formError}</Alert>}
        {children}
        <div className="flex gap-3 justify-end mt-6">
          <Button variant="gray" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onSubmit}
            disabled={submitDisabled}
            loading={saving}
            loadingText="Processing..."
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

// =============================================
// BRAND PREVIEW
// =============================================
function BrandPreview({ form }: { form: BrandFormState }) {
  const gradient = form.brand_color
    ? `linear-gradient(135deg, ${form.brand_color} 0%, ${darkenHex(form.brand_color, 20)} 40%, ${darkenHex(form.brand_color, 60)} 100%)`
    : 'linear-gradient(135deg, #1E3A8A 0%, #172554 100%)'

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--sp-silver)' }}>
      <div className="text-white p-4 relative overflow-hidden" style={{ background: gradient }}>
        <div className="absolute -top-8 -left-8 w-24 h-24 bg-white/[0.03] rounded-full" />
        <div className="absolute -bottom-4 -right-4 w-16 h-16 bg-white/[0.03] rounded-full" />
        <div className="relative z-10 flex items-center gap-3">
          {form.logoPreview || form.brand_logo_url ? (
            <img
              src={form.logoPreview || form.brand_logo_url}
              alt=""
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : form.brand_emoji ? (
            <span className="text-3xl">{form.brand_emoji}</span>
          ) : (
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center text-white/60 text-sm font-bold">
              Logo
            </div>
          )}
          <div>
            <div className="font-bold text-base">{form.brand_name || 'Brand Name'}</div>
            <div className="text-white/50 text-xs">World Cup Pool</div>
          </div>
        </div>
      </div>
      <div className="p-3 flex items-center justify-between bg-white">
        <span className="text-xs sp-text-slate">Preview of branded header</span>
        <button
          className="px-3 py-1 rounded-lg text-white text-xs font-bold"
          style={{ backgroundColor: form.brand_accent || '#FFC300' }}
          type="button"
        >
          Join Pool
        </button>
      </div>
    </div>
  )
}

// =============================================
// BRAND FORM FIELDS
// =============================================
function BrandFormFields({
  form,
  setForm,
  showSlug,
}: {
  form: BrandFormState
  setForm: (f: BrandFormState) => void
  showSlug?: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setForm({
      ...form,
      logoFile: file,
      logoPreview: URL.createObjectURL(file),
    })
  }

  return (
    <div className="space-y-4">
      {/* Brand Name */}
      <div>
        <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Brand Name *</label>
        <input
          type="text"
          value={form.brand_name}
          onChange={(e) => {
            const name = e.target.value
            setForm({
              ...form,
              brand_name: name,
              brand_slug: showSlug !== false ? slugify(name) : form.brand_slug,
            })
          }}
          className={spInput}
          placeholder="e.g. Sargasso Sea"
        />
      </div>

      {/* Brand Slug */}
      {showSlug !== false && (
        <div>
          <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">URL Slug *</label>
          <div className="flex items-center gap-2">
            <span className="text-sm sp-text-slate sp-body">/play/</span>
            <input
              type="text"
              value={form.brand_slug}
              onChange={(e) => setForm({ ...form, brand_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              className={`${spInput} flex-1`}
              placeholder="sargasso-sea"
            />
          </div>
        </div>
      )}

      {/* Emoji */}
      <div>
        <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Brand Emoji (optional)</label>
        <input
          type="text"
          value={form.brand_emoji}
          onChange={(e) => setForm({ ...form, brand_emoji: e.target.value })}
          className={`${spInput} !w-20`}
          placeholder="🌊"
          maxLength={4}
        />
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Primary Color *</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.brand_color}
              onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
              className="w-9 h-9 sp-radius-sm border sp-border-silver cursor-pointer"
            />
            <input
              type="text"
              value={form.brand_color}
              onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
              className={`${spInput} flex-1 uppercase`}
              placeholder="#1E3A8A"
              maxLength={7}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Accent Color *</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={form.brand_accent}
              onChange={(e) => setForm({ ...form, brand_accent: e.target.value })}
              className="w-9 h-9 sp-radius-sm border sp-border-silver cursor-pointer"
            />
            <input
              type="text"
              value={form.brand_accent}
              onChange={(e) => setForm({ ...form, brand_accent: e.target.value })}
              className={`${spInput} flex-1 uppercase`}
              placeholder="#FFC300"
              maxLength={7}
            />
          </div>
        </div>
      </div>

      {/* Logo Upload */}
      <div>
        <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Logo (optional)</label>
        <div className="flex items-center gap-3">
          {(form.logoPreview || form.brand_logo_url) && (
            <img
              src={form.logoPreview || form.brand_logo_url}
              alt="Logo preview"
              className="w-12 h-12 sp-radius-sm object-cover border sp-border-silver"
            />
          )}
          <div className="flex-1">
            <Button
              variant="gray"
              onClick={() => fileInputRef.current?.click()}
            >
              {form.logoPreview || form.brand_logo_url ? 'Replace Logo' : 'Upload Logo'}
            </Button>
            <p className="text-xs sp-text-slate mt-1 sp-body">PNG, JPG, or WebP. Max 2MB.</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleLogoSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* Live Preview */}
      <div>
        <label className="block text-sm font-medium sp-text-ink mb-2 sp-body">Live Preview</label>
        <BrandPreview form={form} />
      </div>
    </div>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================
export function BrandedPoolsTab({ pools, setPools, onNavigateToPool }: BrandedPoolsTabProps) {
  const { showToast } = useToast()
  const [view, setView] = useState<ViewState>({ type: 'list' })
  const [actionModal, setActionModal] = useState<ActionModal>({ type: 'none' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [tournamentsLoaded, setTournamentsLoaded] = useState(false)

  // Form states
  const [createForm, setCreateForm] = useState<CreateFormState>(DEFAULT_CREATE_FORM)
  const [editForm, setEditForm] = useState<BrandFormState>(DEFAULT_BRAND_FORM)
  const [editExtras, setEditExtras] = useState({ entry_fee: '', entry_fee_currency: 'USD', brand_prize_1st: '', brand_prize_2nd: '', brand_prize_3rd: '' })

  // Filter to branded pools only
  const brandedPools = pools.filter(
    (p) => p.brand_name && (p.brand_emoji || p.brand_logo_url) && p.brand_color
  )
  const unbrandedPools = pools.filter(
    (p) => !p.brand_name || !(p.brand_emoji || p.brand_logo_url) || !p.brand_color
  )

  const filteredPools = brandedPools.filter((p) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      p.brand_name?.toLowerCase().includes(s) ||
      p.pool_name.toLowerCase().includes(s) ||
      p.brand_slug?.toLowerCase().includes(s) ||
      p.pool_code.toLowerCase().includes(s)
    )
  })

  // Load tournaments
  const loadTournaments = useCallback(() => {
    if (tournamentsLoaded) return
    const uniqueTournaments = new Map<string, string>()
    pools.forEach((p) => {
      if (p.tournament_id && p.tournaments?.name) {
        uniqueTournaments.set(p.tournament_id, p.tournaments.name)
      }
    })
    setTournaments(
      Array.from(uniqueTournaments.entries()).map(([id, name]) => ({ id, name }))
    )
    setTournamentsLoaded(true)
  }, [tournamentsLoaded, pools])

  // Upload logo helper
  async function uploadLogo(file: File, slug: string, oldUrl?: string): Promise<string | null> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('slug', slug)
    if (oldUrl) formData.append('old_url', oldUrl)

    const res = await fetch('/api/admin/branded-pools/upload-logo', {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Upload failed')
    return data.url
  }

  // Refresh branded pools list
  async function refreshPools() {
    try {
      const res = await fetch('/api/admin/branded-pools')
      const data = await res.json()
      if (res.ok && data.pools) {
        const brandedIds = new Set(data.pools.map((p: any) => p.pool_id))
        const otherPools = pools.filter((p) => !brandedIds.has(p.pool_id))
        setPools([...data.pools, ...otherPools])
      }
    } catch {
      // Silent fail
    }
  }

  function goBack() {
    setView({ type: 'list' })
    setFormError(null)
  }

  // ---- CREATE ----
  async function handleCreate() {
    setSaving(true)
    setFormError(null)
    try {
      let logoUrl = createForm.brand_logo_url
      if (createForm.logoFile) {
        logoUrl = (await uploadLogo(createForm.logoFile, createForm.brand_slug)) || ''
      }

      const res = await fetch('/api/admin/branded-pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          brand_logo_url: logoUrl,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to create pool')
        setSaving(false)
        return
      }
      showToast(`Branded pool "${createForm.pool_name}" created`, 'success')
      setCreateForm(DEFAULT_CREATE_FORM)
      await refreshPools()
      goBack()
    } catch {
      setFormError('Network error')
    }
    setSaving(false)
  }

  // ---- EDIT ----
  async function handleEdit(poolId: string) {
    setSaving(true)
    setFormError(null)
    try {
      let logoUrl = editForm.brand_logo_url
      if (editForm.logoFile) {
        logoUrl = (await uploadLogo(editForm.logoFile, editForm.brand_slug, editForm.brand_logo_url)) || ''
      }

      const feeAmount = parseFloat(editExtras.entry_fee)
      const res = await fetch(`/api/admin/branded-pools/${poolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: editForm.brand_name,
          brand_slug: editForm.brand_slug,
          brand_emoji: editForm.brand_emoji || null,
          brand_color: editForm.brand_color,
          brand_accent: editForm.brand_accent,
          brand_logo_url: logoUrl || null,
          entry_fee: feeAmount > 0 ? feeAmount : null,
          entry_fee_currency: editExtras.entry_fee_currency,
          brand_prize_1st: editExtras.brand_prize_1st.trim() || null,
          brand_prize_2nd: editExtras.brand_prize_2nd.trim() || null,
          brand_prize_3rd: editExtras.brand_prize_3rd.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to update branding')
        setSaving(false)
        return
      }
      showToast('Branding updated', 'success')
      await refreshPools()
      goBack()
    } catch {
      setFormError('Network error')
    }
    setSaving(false)
  }

  // ---- REMOVE BRANDING ----
  async function handleRemoveBranding(poolId: string) {
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/admin/branded-pools/${poolId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to remove branding')
        setSaving(false)
        return
      }
      showToast('Branding removed', 'success')
      setActionModal({ type: 'none' })
      await refreshPools()
    } catch {
      setFormError('Network error')
    }
    setSaving(false)
  }

  // ---- ADD BRANDING TO EXISTING ----
  async function handleAddToExisting(poolId: string) {
    setSaving(true)
    setFormError(null)
    try {
      let logoUrl = editForm.brand_logo_url
      if (editForm.logoFile) {
        logoUrl = (await uploadLogo(editForm.logoFile, editForm.brand_slug)) || ''
      }

      const res = await fetch(`/api/admin/branded-pools/${poolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: editForm.brand_name,
          brand_slug: editForm.brand_slug,
          brand_emoji: editForm.brand_emoji || null,
          brand_color: editForm.brand_color,
          brand_accent: editForm.brand_accent,
          brand_logo_url: logoUrl || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to add branding')
        setSaving(false)
        return
      }
      showToast('Branding added to pool', 'success')
      setActionModal({ type: 'none' })
      await refreshPools()
    } catch {
      setFormError('Network error')
    }
    setSaving(false)
  }

  // Open views / modals
  function openCreate() {
    loadTournaments()
    setCreateForm(DEFAULT_CREATE_FORM)
    setFormError(null)
    setView({ type: 'create' })
  }

  function openEdit(pool: SuperPoolData) {
    setEditForm({
      brand_name: pool.brand_name || '',
      brand_slug: pool.brand_slug || '',
      brand_emoji: pool.brand_emoji || '',
      brand_color: pool.brand_color || '#1E3A8A',
      brand_accent: pool.brand_accent || '#FFC300',
      brand_logo_url: pool.brand_logo_url || '',
      logoFile: null,
      logoPreview: null,
    })
    setEditExtras({
      entry_fee: pool.entry_fee != null && pool.entry_fee > 0 ? String(pool.entry_fee) : '',
      entry_fee_currency: pool.entry_fee_currency || 'USD',
      brand_prize_1st: pool.brand_prize_1st || '',
      brand_prize_2nd: pool.brand_prize_2nd || '',
      brand_prize_3rd: pool.brand_prize_3rd || '',
    })
    setFormError(null)
    setView({ type: 'edit', pool })
  }

  function openAddToExisting() {
    loadTournaments()
    setEditForm(DEFAULT_BRAND_FORM)
    setFormError(null)
    setActionModal({ type: 'add_to_existing' })
  }

  // ═══════ CREATE SUB-SHEET ═══════
  if (view.type === 'create') {
    const canSubmit = !!(createForm.pool_name.trim() && createForm.tournament_id && createForm.brand_name.trim() && createForm.brand_slug.trim())

    return (
      <div className="sp-body space-y-6">
        {/* Back button */}
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Branded Pools
        </button>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold sp-heading sp-text-ink">Create Branded Pool</h2>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={!canSubmit}
            loading={saving}
            loadingText="Creating..."
          >
            Create Pool
          </Button>
        </div>

        {formError && <Alert variant="error">{formError}</Alert>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column — Pool Settings */}
          <div className="sp-card sp-bg-surface p-5 space-y-4" style={{ border: cardBorder }}>
            <h4 className="sp-label sp-text-slate">Pool Settings</h4>
            <div>
              <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Pool Name *</label>
              <input
                type="text"
                value={createForm.pool_name}
                onChange={(e) => setCreateForm({ ...createForm, pool_name: e.target.value })}
                className={spInput}
                placeholder="e.g. Sargasso Sea World Cup Pool"
              />
            </div>
            <div>
              <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Description</label>
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                className={`${spInput} resize-y`}
                rows={2}
                placeholder="Optional pool description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Tournament *</label>
                <select
                  value={createForm.tournament_id}
                  onChange={(e) => setCreateForm({ ...createForm, tournament_id: e.target.value })}
                  className={spInput}
                >
                  <option value="">Select...</option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Mode</label>
                <select
                  value={createForm.prediction_mode}
                  onChange={(e) => setCreateForm({ ...createForm, prediction_mode: e.target.value })}
                  className={spInput}
                >
                  <option value="progressive">Progressive</option>
                  <option value="full_tournament">Full Tournament</option>
                  <option value="bracket_picker">Bracket Picker</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Deadline Date</label>
                <input
                  type="date"
                  value={createForm.prediction_deadline?.split('T')[0] || ''}
                  onChange={(e) => {
                    const time = createForm.prediction_deadline?.split('T')[1] || '12:00'
                    setCreateForm({ ...createForm, prediction_deadline: e.target.value ? `${e.target.value}T${time}` : '' })
                  }}
                  className={spInput}
                />
                {createForm.prediction_deadline?.split('T')[0] && (
                  <p className="text-xs sp-text-slate sp-body mt-1">{formatDateFriendly(createForm.prediction_deadline.split('T')[0])}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Deadline Time</label>
                <input
                  type="time"
                  value={createForm.prediction_deadline?.split('T')[1] || '12:00'}
                  onChange={(e) => {
                    const date = createForm.prediction_deadline?.split('T')[0] || ''
                    if (date) setCreateForm({ ...createForm, prediction_deadline: `${date}T${e.target.value}` })
                  }}
                  className={spInput}
                  disabled={!createForm.prediction_deadline?.split('T')[0]}
                />
                {createForm.prediction_deadline?.split('T')[1] && (
                  <p className="text-xs sp-text-slate sp-body mt-1">{formatTimeFriendly(createForm.prediction_deadline.split('T')[1])}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Max Entries/User</label>
                <input
                  type="number"
                  value={createForm.max_entries_per_user}
                  onChange={(e) => setCreateForm({ ...createForm, max_entries_per_user: parseInt(e.target.value) || 1 })}
                  className={spInput}
                  min={1}
                  max={10}
                />
              </div>
            </div>
          </div>

          {/* Right column — Branding */}
          <div className="sp-card sp-bg-surface p-5 space-y-4" style={{ border: cardBorder }}>
            <h4 className="sp-label sp-text-slate">Branding</h4>
            <BrandFormFields
              form={createForm}
              setForm={(f) => setCreateForm({ ...createForm, ...f })}
            />
          </div>
        </div>

        {/* Entry Fee & Prizes row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Entry Fee */}
          <div className="sp-card sp-bg-surface p-5 space-y-4" style={{ border: cardBorder }}>
            <h4 className="sp-label sp-text-slate">Entry Fee</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Amount</label>
                <input
                  type="number"
                  value={createForm.entry_fee}
                  onChange={(e) => setCreateForm({ ...createForm, entry_fee: e.target.value })}
                  className={spInput}
                  placeholder="0 = Free"
                  min={0}
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Currency</label>
                <select
                  value={createForm.entry_fee_currency}
                  onChange={(e) => setCreateForm({ ...createForm, entry_fee_currency: e.target.value })}
                  className={spInput}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="BMD">BMD ($)</option>
                </select>
              </div>
            </div>
            <p className="text-xs sp-text-slate sp-body">Leave amount empty or 0 for a free pool.</p>
          </div>

          {/* Prizes */}
          <div className="sp-card sp-bg-surface p-5 space-y-4" style={{ border: cardBorder }}>
            <h4 className="sp-label sp-text-slate">Prizes</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">🏆 1st Place</label>
                <input
                  type="text"
                  value={createForm.brand_prize_1st}
                  onChange={(e) => setCreateForm({ ...createForm, brand_prize_1st: e.target.value })}
                  className={spInput}
                  placeholder="e.g. $150 Bar Tab"
                />
              </div>
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">🥈 2nd Place</label>
                <input
                  type="text"
                  value={createForm.brand_prize_2nd}
                  onChange={(e) => setCreateForm({ ...createForm, brand_prize_2nd: e.target.value })}
                  className={spInput}
                  placeholder="e.g. $75 Bar Tab"
                />
              </div>
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">🥉 3rd Place</label>
                <input
                  type="text"
                  value={createForm.brand_prize_3rd}
                  onChange={(e) => setCreateForm({ ...createForm, brand_prize_3rd: e.target.value })}
                  className={spInput}
                  placeholder="e.g. Free appetizer platter"
                />
              </div>
            </div>
            <p className="text-xs sp-text-slate sp-body">Leave empty to show &ldquo;TBD&rdquo; on the landing page.</p>
          </div>
        </div>
      </div>
    )
  }

  // ═══════ EDIT SUB-SHEET ═══════
  if (view.type === 'edit') {
    const pool = view.pool
    return (
      <div className="sp-body space-y-6">
        {/* Back button */}
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Branded Pools
        </button>

        {/* Header with pool info */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: pool.brand_color || 'var(--sp-primary-light)' }}>
            {pool.brand_logo_url ? (
              <img src={pool.brand_logo_url} alt="" className="w-full h-full object-cover" />
            ) : pool.brand_emoji ? (
              <span className="text-2xl">{pool.brand_emoji}</span>
            ) : (
              <span className="text-xl font-bold text-white">{(pool.brand_name || pool.pool_name).charAt(0)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-extrabold sp-heading sp-text-ink">{pool.pool_name}</h2>
              <Badge variant={getStatusVariant(pool.status)}>{pool.status}</Badge>
            </div>
            <p className="text-sm sp-text-slate mt-0.5 sp-body">
              {pool.brand_name} &middot; {pool.pool_code} &middot; {pool.pool_members?.[0]?.count ?? 0} members
            </p>
            {onNavigateToPool && (
              <button
                onClick={() => onNavigateToPool(pool.pool_id)}
                className="text-xs sp-text-primary sp-body font-medium mt-1 hover:underline inline-flex items-center gap-1"
              >
                View Pool Details
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
            )}
          </div>
          {/* Desktop: buttons inline */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <Button
              variant="gray"
              onClick={() => { setFormError(null); setActionModal({ type: 'remove_branding', pool }) }}
            >
              Remove Branding
            </Button>
            <Button
              variant="primary"
              onClick={() => handleEdit(pool.pool_id)}
              disabled={saving}
              loading={saving}
              loadingText="Saving..."
            >
              Save Changes
            </Button>
          </div>
        </div>

        {/* Mobile: buttons below header */}
        <div className="sm:hidden flex gap-2">
          <Button
            variant="gray"
            className="flex-1"
            onClick={() => { setFormError(null); setActionModal({ type: 'remove_branding', pool }) }}
          >
            Remove Branding
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => handleEdit(pool.pool_id)}
            disabled={saving}
            loading={saving}
            loadingText="Saving..."
          >
            Save Changes
          </Button>
        </div>

        {formError && <Alert variant="error">{formError}</Alert>}

        <div className="sp-card sp-bg-surface p-5" style={{ border: cardBorder }}>
          <BrandFormFields form={editForm} setForm={setEditForm} />
        </div>

        {/* Entry Fee & Prizes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="sp-card sp-bg-surface p-5 space-y-4" style={{ border: cardBorder }}>
            <h4 className="sp-label sp-text-slate">Entry Fee</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Amount</label>
                <input
                  type="number"
                  value={editExtras.entry_fee}
                  onChange={(e) => setEditExtras({ ...editExtras, entry_fee: e.target.value })}
                  className={spInput}
                  placeholder="0 = Free"
                  min={0}
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Currency</label>
                <select
                  value={editExtras.entry_fee_currency}
                  onChange={(e) => setEditExtras({ ...editExtras, entry_fee_currency: e.target.value })}
                  className={spInput}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="BMD">BMD ($)</option>
                </select>
              </div>
            </div>
            <p className="text-xs sp-text-slate sp-body">Leave amount empty or 0 for a free pool.</p>
          </div>

          <div className="sp-card sp-bg-surface p-5 space-y-4" style={{ border: cardBorder }}>
            <h4 className="sp-label sp-text-slate">Prizes</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">🏆 1st Place</label>
                <input
                  type="text"
                  value={editExtras.brand_prize_1st}
                  onChange={(e) => setEditExtras({ ...editExtras, brand_prize_1st: e.target.value })}
                  className={spInput}
                  placeholder="e.g. $150 Bar Tab"
                />
              </div>
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">🥈 2nd Place</label>
                <input
                  type="text"
                  value={editExtras.brand_prize_2nd}
                  onChange={(e) => setEditExtras({ ...editExtras, brand_prize_2nd: e.target.value })}
                  className={spInput}
                  placeholder="e.g. $75 Bar Tab"
                />
              </div>
              <div>
                <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">🥉 3rd Place</label>
                <input
                  type="text"
                  value={editExtras.brand_prize_3rd}
                  onChange={(e) => setEditExtras({ ...editExtras, brand_prize_3rd: e.target.value })}
                  className={spInput}
                  placeholder="e.g. Free appetizer platter"
                />
              </div>
            </div>
            <p className="text-xs sp-text-slate sp-body">Leave empty to show &ldquo;TBD&rdquo; on the landing page.</p>
          </div>
        </div>

        {/* Remove branding modal (still a modal since it's a danger confirmation) */}
        {actionModal.type === 'remove_branding' && (
          <ModalShell
            title="Remove Branding"
            danger
            submitLabel="Remove Branding"
            onSubmit={async () => {
              await handleRemoveBranding(actionModal.pool.pool_id)
              goBack()
            }}
            onClose={() => setActionModal({ type: 'none' })}
            saving={saving}
            formError={formError}
          >
            <p className="text-sm sp-text-slate sp-body">
              This will remove all branding from <strong className="sp-text-ink">{actionModal.pool.pool_name}</strong> ({actionModal.pool.brand_name}).
              The pool itself will not be deleted, but its landing page will stop working.
            </p>
          </ModalShell>
        )}
      </div>
    )
  }

  // ═══════ LIST VIEW ═══════
  const columns: SpColumn<SuperPoolData>[] = [
    {
      key: 'logo',
      header: '',
      render: (p) =>
        p.brand_logo_url ? (
          <img src={p.brand_logo_url} alt="" className="w-8 h-8 rounded-md object-cover" />
        ) : p.brand_emoji ? (
          <span className="text-xl">{p.brand_emoji}</span>
        ) : (
          <div className="w-8 h-8 rounded-md bg-neutral-100" />
        ),
    },
    {
      key: 'brand',
      header: 'Brand',
      sticky: true,
      render: (p) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold sp-text-ink text-sm truncate">{p.brand_name}</span>
            {p.brand_color && (
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: p.brand_color }}
              />
            )}
            {p.brand_accent && (
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: p.brand_accent }}
              />
            )}
          </div>
          <div className="text-xs sp-text-slate truncate">{p.pool_name}</div>
        </div>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (p) => (
        <span className="text-xs sp-text-slate font-mono">
          {p.brand_slug ? `/play/${p.brand_slug}` : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge variant={getStatusVariant(p.status)}>{p.status}</Badge>,
    },
    {
      key: 'members',
      header: 'Members',
      align: 'center',
      render: (p) => (
        <span className="text-sm sp-text-ink tabular-nums">
          {p.pool_members?.[0]?.count ?? 0}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(p) }}
            className="p-1.5 rounded-lg sp-hover-snow transition-colors"
            title="Edit branding"
          >
            <svg className="w-4 h-4 sp-text-slate" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setFormError(null); setActionModal({ type: 'remove_branding', pool: p }) }}
            className="p-1.5 rounded-lg sp-hover-snow transition-colors"
            title="Remove branding"
          >
            <svg className="w-4 h-4 text-danger-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        </div>
      ),
    },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold sp-text-ink sp-heading">Branded Pools</h2>
          <p className="text-sm sp-text-slate sp-body mt-0.5">
            {brandedPools.length} branded pool{brandedPools.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="gray" onClick={openAddToExisting}>
            Add to Existing
          </Button>
          <Button variant="primary" onClick={openCreate}>
            Create Branded Pool
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search branded pools..."
          className={`${spInput} sm:!w-80`}
        />
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden space-y-3 mb-4">
        {filteredPools.length === 0 ? (
          <div className="sp-card sp-bg-surface p-8 text-center">
            <p className="sp-text-slate text-sm sp-body">No branded pools found</p>
          </div>
        ) : (
          filteredPools.map((p) => (
            <div
              key={p.pool_id}
              className="sp-card sp-bg-surface p-4 cursor-pointer"
              style={{ border: cardBorder }}
              onClick={() => openEdit(p)}
            >
              <div className="flex items-start gap-3">
                {p.brand_logo_url ? (
                  <img src={p.brand_logo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : p.brand_emoji ? (
                  <span className="text-2xl shrink-0">{p.brand_emoji}</span>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-neutral-100 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold sp-text-ink text-sm truncate">{p.brand_name}</span>
                    {p.brand_color && (
                      <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.brand_color }} />
                    )}
                  </div>
                  <div className="text-xs sp-text-slate">{p.pool_name}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant={getStatusVariant(p.status)}>{p.status}</Badge>
                    <span className="text-xs sp-text-slate">{p.pool_members?.[0]?.count ?? 0} members</span>
                  </div>
                  {p.brand_slug && (
                    <div className="text-xs sp-text-slate font-mono mt-1">/play/{p.brand_slug}</div>
                  )}
                </div>
                <svg className="w-4 h-4 sp-text-slate shrink-0 mt-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block">
        <SpTable
          columns={columns}
          data={filteredPools}
          keyFn={(p) => p.pool_id}
          emptyMessage="No branded pools found."
          onRowClick={(p) => openEdit(p)}
        />
      </div>

      {/* ═══════ MODALS (only for small confirmation/selection flows) ═══════ */}

      {/* ADD BRANDING TO EXISTING POOL */}
      {actionModal.type === 'add_to_existing' && (
        <ModalShell
          title="Add Branding to Existing Pool"
          submitLabel="Add Branding"
          submitDisabled={
            !actionModal.pool ||
            !editForm.brand_name.trim() ||
            !editForm.brand_slug.trim()
          }
          onSubmit={() => actionModal.pool && handleAddToExisting(actionModal.pool.pool_id)}
          onClose={() => setActionModal({ type: 'none' })}
          saving={saving}
          formError={formError}
          wide
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium sp-text-ink mb-1 sp-body">Select Pool *</label>
              <select
                value={actionModal.pool?.pool_id || ''}
                onChange={(e) => {
                  const pool = unbrandedPools.find((p) => p.pool_id === e.target.value)
                  setActionModal({ type: 'add_to_existing', pool })
                }}
                className={spInput}
              >
                <option value="">Choose a pool...</option>
                {unbrandedPools.map((p) => (
                  <option key={p.pool_id} value={p.pool_id}>
                    {p.pool_name} ({p.pool_code}) — {p.pool_members?.[0]?.count ?? 0} members
                  </option>
                ))}
              </select>
            </div>
            {actionModal.pool && (
              <>
                <div className="border-t" style={{ borderColor: 'var(--sp-silver)' }} />
                <BrandFormFields form={editForm} setForm={setEditForm} />
              </>
            )}
          </div>
        </ModalShell>
      )}

      {/* REMOVE BRANDING */}
      {actionModal.type === 'remove_branding' && (
        <ModalShell
          title="Remove Branding"
          danger
          submitLabel="Remove Branding"
          onSubmit={() => handleRemoveBranding(actionModal.pool.pool_id)}
          onClose={() => setActionModal({ type: 'none' })}
          saving={saving}
          formError={formError}
        >
          <p className="text-sm sp-text-slate sp-body">
            This will remove all branding from <strong className="sp-text-ink">{actionModal.pool.pool_name}</strong> ({actionModal.pool.brand_name}).
            The pool itself will not be deleted, but its landing page will stop working.
          </p>
        </ModalShell>
      )}
    </div>
  )
}
