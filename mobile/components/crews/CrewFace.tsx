// A crew member's face — MemberAvatar with initials as the fallback, exactly as PoolCard draws its
// member stack, so the same person looks the same on a pool card and on a crew page.

import { Text as RNText, View } from 'react-native';

import { MemberAvatar } from '@/components/avatar/MemberAvatar';
import { avatarBackgroundFor, avatarIndexFor, groundInkFor } from '@/lib/avatarGradient';
import { personName, type Person } from '@/lib/crews';
import { fontFamilies, useTheme } from '@/theme';

function initialsOf(p: Pick<Person, 'fullName' | 'username'>): string {
  const parts = personName(p).trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? '?').slice(0, 2).toUpperCase();
}

export function CrewFace({ person, size }: { person: Person; size: number }) {
  const index = avatarIndexFor(person.userId, person.avatarColour);
  // ⚠ A literal ink from groundInkFor, not theme ink: the ground is the same in light and dark
  // (see PoolCard's MemberAvatars).
  const ground = avatarBackgroundFor(index);
  const ink = groundInkFor(index);
  return (
    <MemberAvatar
      userId={person.userId}
      avatarBuild={person.avatarBuild}
      avatarColour={person.avatarColour}
      size={size}
      fallback={
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: ground,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: Math.max(9, size * 0.36), color: ink }}>
            {initialsOf(person)}
          </RNText>
        </View>
      }
    />
  );
}

/** Up to three overlapping faces and a "+N" — the My Crews card's group mark. */
export function CrewFaceStack({ people, total, size = 30 }: { people: Person[]; total: number; size?: number }) {
  const theme = useTheme();
  const shown = people.slice(0, 3);
  const extra = Math.max(0, total - shown.length);
  const ring = 2;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <View
          key={p.userId}
          style={{
            marginLeft: i === 0 ? 0 : -8,
            borderWidth: ring,
            borderColor: theme.colors.surface,
            // ⚠ The ring's radius is the face's PLUS the border — a square border on a round face
            // cuts a hard line across the neighbour (see PoolCard).
            borderRadius: size / 2 + ring,
          }}
        >
          <CrewFace person={p} size={size} />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={{
            marginLeft: shown.length ? -8 : 0,
            width: size + ring * 2,
            height: size + ring * 2,
            borderRadius: size / 2 + ring,
            borderWidth: ring,
            borderColor: theme.colors.surface,
            backgroundColor: theme.colors.mist,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText style={{ fontFamily: fontFamilies.black, fontSize: 10.5, color: theme.colors.slate }}>+{extra}</RNText>
        </View>
      ) : null}
    </View>
  );
}
