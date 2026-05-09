'use client'

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { FormField } from '@/components/ui/FormField'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { formatCurrency, monthsElapsed } from '@/lib/format'
import { SpTable, type SpColumn, SP } from './SpTable'
import type { SubscriptionPeriodData } from './page'

type Props = {
  periods: SubscriptionPeriodData[]
  setPeriods: Dispatch<SetStateAction<SubscriptionPeriodData[]>>
}

type FormState = {
  provider: string
  plan_name: string
  monthly_cost_dollars: string
  currency: string
  start_date: string
  ended_at: string
  notes: string
}

const EMPTY_FORM: FormState = {
  provider: '',
  plan_name: '',
  monthly_cost_dollars: '0',
  currency: 'USD',
  start_date: new Date().toISOString().slice(0, 10),
  ended_at: '',
  notes: '',
}

function todayDate(): Date {
  const t = new Date()
  return new Date(t.getFullYear(), t.getMonth(), t.getDate())
}

function periodSpentCents(p: SubscriptionPeriodData): number {
  const start = new Date(p.start_date + 'T00:00:00')
  const end = p.ended_at ? new Date(p.ended_at + 'T00:00:00') : todayDate()
  return monthsElapsed(start, end) * p.monthly_cost_cents
}

function formStateFromPeriod(p: SubscriptionPeriodData): FormState {
  return {
    provider: p.provider,
    plan_name: p.plan_name,
    monthly_cost_dollars: (p.monthly_cost_cents / 100).toString(),
    currency: p.currency,
    start_date: p.start_date,
    ended_at: p.ended_at ?? '',
    notes: p.notes ?? '',
  }
}

function payloadFromForm(form: FormState): {
  provider: string
  plan_name: string
  monthly_cost_cents: number
  currency: string
  start_date: string
  ended_at: string | null
  notes: string | null
} | { error: string } {
  const dollars = Number(form.monthly_cost_dollars)
  if (!Number.isFinite(dollars) || dollars < 0) {
    return { error: 'Monthly cost must be a non-negative number.' }
  }
  const cents = Math.round(dollars * 100)
  return {
    provider: form.provider.trim(),
    plan_name: form.plan_name.trim(),
    monthly_cost_cents: cents,
    currency: form.currency.trim().toUpperCase() || 'USD',
    start_date: form.start_date,
    ended_at: form.ended_at || null,
    notes: form.notes.trim() || null,
  }
}

export function SubscriptionsTab({ periods, setPeriods }: Props) {
  const { showToast } = useToast()
  const [editing, setEditing] = useState<SubscriptionPeriodData | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<SubscriptionPeriodData | null>(null)

  const totalsByProvider = useMemo(() => {
    const map = new Map<string, { providerTotalCents: number; currency: string; activePeriod: SubscriptionPeriodData | null }>()
    for (const p of periods) {
      const entry = map.get(p.provider) ?? { providerTotalCents: 0, currency: p.currency, activePeriod: null }
      entry.providerTotalCents += periodSpentCents(p)
      if (!p.ended_at) entry.activePeriod = p
      // If currencies differ within a provider, fall back to first seen.
      map.set(p.provider, entry)
    }
    return Array.from(map.entries()).map(([provider, v]) => ({ provider, ...v }))
  }, [periods])

  function openAdd() {
    setForm(EMPTY_FORM)
    setAdding(true)
  }

  function openEdit(p: SubscriptionPeriodData) {
    setForm(formStateFromPeriod(p))
    setEditing(p)
  }

  function close() {
    setAdding(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit() {
    const payload = payloadFromForm(form)
    if ('error' in payload) {
      showToast(payload.error, 'error')
      return
    }
    if (!payload.provider) {
      showToast('Provider is required.', 'error')
      return
    }
    if (!payload.plan_name) {
      showToast('Plan name is required.', 'error')
      return
    }

    setSubmitting(true)
    try {
      if (editing) {
        const res = await fetch(`/api/admin/subscriptions/${editing.period_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) {
          showToast(data.error || 'Failed to update subscription', 'error')
          return
        }
        setPeriods((prev) => prev.map((p) => (p.period_id === editing.period_id ? data.period : p)))
        showToast('Subscription updated', 'success')
      } else {
        const res = await fetch('/api/admin/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) {
          showToast(data.error || 'Failed to create subscription', 'error')
          return
        }
        setPeriods((prev) => [data.period, ...prev])
        showToast('Subscription added', 'success')
      }
      close()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/subscriptions/${confirmDelete.period_id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Failed to delete', 'error')
        return
      }
      setPeriods((prev) => prev.filter((p) => p.period_id !== confirmDelete.period_id))
      showToast('Subscription removed', 'success')
      setConfirmDelete(null)
    } finally {
      setSubmitting(false)
    }
  }

  const columns: SpColumn<SubscriptionPeriodData>[] = [
    {
      key: 'provider',
      header: 'Provider',
      render: (p) => <span style={{ fontWeight: 600 }}>{p.provider}</span>,
    },
    {
      key: 'plan',
      header: 'Plan',
      render: (p) => p.plan_name,
    },
    {
      key: 'monthly',
      header: 'Monthly',
      align: 'right',
      render: (p) => formatCurrency(p.monthly_cost_cents, p.currency),
    },
    {
      key: 'started',
      header: 'Started',
      render: (p) => p.start_date,
    },
    {
      key: 'ended',
      header: 'Ended',
      render: (p) => p.ended_at ?? <span style={{ color: SP.slate }}>—</span>,
    },
    {
      key: 'spent',
      header: 'Total spent',
      align: 'right',
      render: (p) => formatCurrency(periodSpentCents(p), p.currency),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (p) => p.notes
        ? <span style={{ color: SP.slate }}>{p.notes}</span>
        : <span style={{ color: SP.slate }}>—</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex gap-2 justify-end">
          <Button size="xs" variant="outline" onClick={() => openEdit(p)}>Edit</Button>
          <Button size="xs" variant="gray" onClick={() => setConfirmDelete(p)}>Delete</Button>
        </div>
      ),
    },
  ]

  return (
    <div className="sp-body space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold sp-heading">
          <span className="sp-text-ink">Sub</span>
          <span className="sp-text-primary">scriptions</span>
        </h2>
        <Button size="sm" variant="primary" onClick={openAdd}>+ Add period</Button>
      </div>

      {/* Per-provider summary cards */}
      {totalsByProvider.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {totalsByProvider.map(({ provider, providerTotalCents, currency, activePeriod }) => (
            <div
              key={provider}
              className="sp-card p-4"
              style={{
                borderRadius: 24,
                border: `0.5px solid ${SP.silver}80`,
                backgroundColor: SP.surface,
              }}
            >
              <div className="text-xs sp-label" style={{ color: SP.slate }}>{provider}</div>
              <div className="mt-1 text-lg font-bold sp-heading" style={{ color: SP.ink }}>
                {activePeriod ? activePeriod.plan_name : 'No active plan'}
              </div>
              <div className="text-sm sp-body" style={{ color: SP.slate }}>
                {activePeriod
                  ? `${formatCurrency(activePeriod.monthly_cost_cents, activePeriod.currency)} / month · since ${activePeriod.start_date}`
                  : 'All periods ended'}
              </div>
              <div className="mt-3 text-2xl font-extrabold sp-heading" style={{ color: SP.primary }}>
                {formatCurrency(providerTotalCents, currency)}
              </div>
              <div className="text-xs sp-body" style={{ color: SP.slate }}>total spent</div>
            </div>
          ))}
        </div>
      )}

      {/* All periods table */}
      <div>
        <div className="text-xs sp-label mb-2" style={{ color: SP.slate }}>All periods</div>
        <SpTable
          columns={columns}
          data={periods}
          keyFn={(p) => p.period_id}
          emptyMessage="No subscription periods yet."
        />
      </div>

      {/* Add / Edit modal */}
      <Modal isOpen={adding || editing !== null} onClose={close} title={editing ? 'Edit subscription' : 'Add subscription period'} size="md">
        <div className="px-4 sm:px-6 py-4 space-y-4 overflow-y-auto">
          <FormField label="Provider">
            <Input
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="api-football"
            />
          </FormField>
          <FormField label="Plan">
            <Input
              value={form.plan_name}
              onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
              placeholder="Pro"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Monthly cost">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.monthly_cost_dollars}
                onChange={(e) => setForm({ ...form, monthly_cost_dollars: e.target.value })}
              />
            </FormField>
            <FormField label="Currency">
              <Input
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                maxLength={3}
                placeholder="USD"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start date">
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </FormField>
            <FormField label="End date" helperText="Leave blank if still active">
              <Input
                type="date"
                value={form.ended_at}
                onChange={(e) => setForm({ ...form, ended_at: e.target.value })}
              />
            </FormField>
          </div>
          <FormField label="Notes" helperText="Optional — what is this used for?">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Fixtures + scores"
            />
          </FormField>
        </div>
        <div className="flex gap-3 justify-end px-4 sm:px-6 py-3 border-t border-neutral-100">
          <Button variant="gray" onClick={close} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} loadingText="Saving...">
            {editing ? 'Save changes' : 'Add'}
          </Button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Remove subscription period?" size="sm">
        <div className="px-4 sm:px-6 py-4 space-y-3">
          <p className="text-sm sp-body" style={{ color: SP.ink }}>
            This will delete the period for{' '}
            <strong>{confirmDelete?.provider}</strong> ({confirmDelete?.plan_name}).
            This cannot be undone.
          </p>
        </div>
        <div className="flex gap-3 justify-end px-4 sm:px-6 py-3 border-t border-neutral-100">
          <Button variant="gray" onClick={() => setConfirmDelete(null)} disabled={submitting}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} loading={submitting} loadingText="Removing...">Remove</Button>
        </div>
      </Modal>
    </div>
  )
}
