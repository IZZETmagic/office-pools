// A crew member's face on the web — the shared Avatar, fed from a crew Person.
//
// The crew reads (lib/crews/read.ts) speak camelCase; the web's Avatar takes the database's
// snake_case. This is the one place that translates, so a member's chosen colour can't be dropped on
// one crew screen and kept on another.

import { Avatar, AvatarStack, type AvatarPerson } from '@/components/ui/Avatar'
import type { Person } from '@/lib/crews/read'

export function toAvatarPerson(p: Pick<Person, 'userId' | 'fullName' | 'username' | 'avatarColour'>): AvatarPerson {
  return { user_id: p.userId, full_name: p.fullName, username: p.username, avatar_colour: p.avatarColour }
}

export function CrewFace({ person, size = 32 }: { person: Person; size?: number }) {
  return <Avatar person={toAvatarPerson(person)} size={size} />
}

/** Up to three faces and "+N" — a crew card's group, never a list of contacts. */
export function CrewFaceStack({ people, total, size = 32 }: { people: Person[]; total: number; size?: number }) {
  return <AvatarStack people={people.map(toAvatarPerson)} total={total} size={size} max={3} />
}
