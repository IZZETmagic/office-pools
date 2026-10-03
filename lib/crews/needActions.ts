// What each crew card button does on the web — the same routes the app calls from Activity.
//
// The server decides WHICH buttons a card has (lib/crews/needs.ts); this decides what each one
// calls. "Save as crew" calls nothing yet: it opens the save dialog, which names the crew and says
// the pool becomes private BEFORE anything is written.
//
// PURE — tested in __tests__/needActions.test.ts.

import type { NeedAction, NeedItem } from '@/lib/activity/needsYou'

export type CrewActionPlan =
  | { kind: 'request'; url: string; body: Record<string, string>; then: 'refresh' | { goTo: string } }
  | { kind: 'open-save' }
  | { kind: 'none' }

export function crewActionPlan(item: NeedItem, action: NeedAction['id']): CrewActionPlan {
  const poolId = encodeURIComponent(item.pool_id)
  switch (action) {
    case 'take':
      // Taking a seat IS the ordinary join, so the next stop is the pool itself.
      return { kind: 'request', url: `/api/crews/seats/${poolId}`, body: { answer: 'take' }, then: { goTo: `/pools/${poolId}` } }
    case 'decline':
      if (item.kind === 'crew_invite') {
        const inviteId = item.crew?.invite_id
        return inviteId
          ? { kind: 'request', url: `/api/crews/invites/${encodeURIComponent(inviteId)}/answer`, body: { answer: 'decline' }, then: 'refresh' }
          : { kind: 'none' }
      }
      return { kind: 'request', url: `/api/crews/seats/${poolId}`, body: { answer: 'decline' }, then: 'refresh' }
    case 'join': {
      const inviteId = item.crew?.invite_id
      const crewId = item.crew?.crew_id
      if (!inviteId) return { kind: 'none' }
      return {
        kind: 'request',
        url: `/api/crews/invites/${encodeURIComponent(inviteId)}/answer`,
        body: { answer: 'join' },
        // Into the crew they just joined — the page is where its history and its pools are.
        then: crewId ? { goTo: `/crews/${encodeURIComponent(crewId)}` } : 'refresh',
      }
    }
    case 'dismiss':
      return { kind: 'request', url: `/api/pools/${poolId}/crew-prompt/dismiss`, body: {}, then: 'refresh' }
    case 'save':
      return { kind: 'open-save' }
  }
}
