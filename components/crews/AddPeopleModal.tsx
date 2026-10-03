'use client'

// Add people to a crew — the web twin of mobile's AddPeopleSheet. Captain and co-captain only (the
// crew page only offers it to them; the API refuses anyone else).
//
// ⭐ A LOOKUP, NEVER A BROWSE (Ryan, 2026-10-02). One field: an exact username or an email.
//   · A username shows EVERY exact, case-insensitive match with their face, so the captain picks the
//     right one — production has 36 username pairs that differ only by case ("Dave" / "dave").
//     No prefix search, no suggestions, no list of people you might know.
//   · An email always answers "Invite sent" — whether or not it has an account. It never reveals who
//     is on SportPool. Someone without an account gets one invite email carrying a one-time link;
//     whoever opens it can join (migration 155 — never by signing up with the address, which proves
//     nothing while email confirmation is off).
// Either way the person taps Join once before they're in.

import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { crewRequest, errorText } from '@/lib/crews/client'
import type { Person } from '@/lib/crews/read'
import { invitePreviewText, personName } from '@/lib/crews/words'

import { CrewFace } from './CrewFace'

type RowState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'added' } | { kind: 'error'; message: string }

const looksLikeEmail = (s: string) => s.includes('@') && !s.startsWith('@')

export function AddPeopleModal({
  isOpen,
  crewId,
  crewName,
  inviterName,
  onClose,
  onChanged,
}: {
  isOpen: boolean
  crewId: string
  crewName: string
  /** Who the invite email will name — the viewer. */
  inviterName: string
  onClose: () => void
  onChanged: () => void
}) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [matches, setMatches] = useState<Person[] | null>(null)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const emailTyped = looksLikeEmail(query.trim())

  async function find() {
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setNote(null)
    setMatches(null)
    try {
      if (looksLikeEmail(q)) {
        await crewRequest(`/api/crews/${encodeURIComponent(crewId)}/invites`, { body: { email: q } })
        // ⚠ The same answer whether or not the address has an account — never reveal who's on SportPool.
        setNote({ tone: 'ok', text: `Invite sent to ${q.toLowerCase()}. They’ll tap Join once to be in.` })
        setQuery('')
        onChanged()
      } else {
        const { matches: found } = await crewRequest<{ matches: Person[] }>(
          `/api/users/lookup?username=${encodeURIComponent(q.replace(/^@/, ''))}`,
        )
        setMatches(found)
        setRows({})
        if (found.length === 0) setNote({ tone: 'bad', text: 'Nobody has that exact username.' })
        else if (found.length > 1) setNote({ tone: 'ok', text: `${found.length} people have that username — which one?` })
      }
    } catch (e) {
      setNote({ tone: 'bad', text: errorText(e) })
    } finally {
      setSearching(false)
    }
  }

  async function add(p: Person) {
    setRows((r) => ({ ...r, [p.userId]: { kind: 'busy' } }))
    try {
      await crewRequest(`/api/crews/${encodeURIComponent(crewId)}/invites`, { body: { user_id: p.userId } })
      setRows((r) => ({ ...r, [p.userId]: { kind: 'added' } }))
      onChanged()
    } catch (e) {
      setRows((r) => ({ ...r, [p.userId]: { kind: 'error', message: errorText(e) } }))
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" titleId="add-people-title">
      <div className="px-5 sm:px-6 pt-4 pb-6 flex flex-col gap-5 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-14 h-14 rounded-card bg-primary-600/10 flex items-center justify-center">
            <Icon name="person.badge.plus" size={26} className="text-primary-600" weight="semibold" />
          </div>
          <h2 id="add-people-title" className="t-card-title text-ink">
            Add people
          </h2>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void find()
          }}
        >
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setNote(null)
            }}
            placeholder="Username or email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="flex-1"
            aria-label="Username or email"
          />
          <Button type="submit" disabled={!query.trim() || searching} loading={searching}>
            {emailTyped ? 'Invite' : 'Find'}
          </Button>
        </form>

        {/* The 2026-10-02 rule: invitations name who asked — once, and the captain sees the email's
            own first line before pressing Invite. Worded so it never says whether the address has
            an account. */}
        {emailTyped && !note ? (
          <div className="p-3 rounded-control bg-mist flex flex-col gap-1">
            <p className="text-xs font-bold text-muted">We’ll send them one email:</p>
            <p className="text-[13px] leading-[18px] font-medium text-ink">“{invitePreviewText(inviterName, crewName)}”</p>
            <p className="text-[11.5px] leading-4 text-muted">
              From SportPool, never followed up. If they already use SportPool, it’ll be waiting in their app too.
            </p>
          </div>
        ) : null}

        {note ? (
          <p className={`text-[12.5px] leading-[18px] font-medium text-center ${note.tone === 'ok' ? 'text-success-700' : 'text-danger-700'}`}>
            {note.text}
          </p>
        ) : null}

        {matches && matches.length > 0 ? (
          <ul className="rounded-control border border-border-default divide-y divide-border-subtle overflow-hidden">
            {matches.map((p) => {
              const st = rows[p.userId] ?? { kind: 'idle' }
              return (
                <li key={p.userId} className="flex items-center gap-3 p-3">
                  <CrewFace person={p} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink truncate">{personName(p)}</p>
                    <p className={`text-[11.5px] truncate ${st.kind === 'error' ? 'text-danger-700' : 'text-muted'}`}>
                      {st.kind === 'error' ? st.message : `@${p.username ?? ''}`}
                    </p>
                  </div>
                  {st.kind === 'added' ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-success-700">
                      <Icon name="checkmark.circle.fill" size={16} />
                      Invited
                    </span>
                  ) : (
                    <Button
                      size="xs"
                      className="rounded-pill min-w-14"
                      onClick={() => void add(p)}
                      loading={st.kind === 'busy'}
                      aria-label={`Add ${personName(p)}`}
                    >
                      Add
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}

        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  )
}
