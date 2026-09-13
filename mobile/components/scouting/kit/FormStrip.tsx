import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { formTone, type ScoutFormLetter } from '@/lib/scoutTone';
import { useTheme } from '@/theme';

import { useScoutPalette } from './tone';

// =============================================================
// W · D · L
// =============================================================
// ⚠ THE ONE PLACE IN SCOUTING WHERE GREEN MEANS "GOOD". A form strip describes
// results that happened, from the point of view of the side being described, so
// green/slate/red carry their ordinary football meaning here and nowhere else.
// Green spent a release also meaning "the home club" and "this player has a
// rating", which is how it stopped meaning anything.
// =============================================================

export function FormStrip({ outcomes }: { outcomes: ScoutFormLetter[] }) {
  const theme = useTheme();
  const palette = useScoutPalette();

  if (outcomes.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {outcomes.map((o, i) => {
        const tone = palette[formTone(o)];
        return (
          <View
            key={`${o}-${i}`}
            style={{
              width: 20,
              height: 20,
              borderRadius: theme.radii.xs,
              backgroundColor: tone.tint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RNText style={{ fontFamily: MONO_BOLD, fontSize: 10, color: tone.fg }}>
              {o}
            </RNText>
          </View>
        );
      })}
    </View>
  );
}
