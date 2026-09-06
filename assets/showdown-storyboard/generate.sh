#!/usr/bin/env bash
# Generate 32 storyboard frames for the Showdown tunnel-walk-out reveal animation:
# 4 moods × 8 beats. Uses the Nano Banana Flash model (fast, cheap, plenty for storyboard iteration).
# Parallel within each mood (8 at once), serial across moods to avoid hammering the API.

set -u

SKILL_SCRIPT="/Users/ryansousa/.claude/plugins/cache/buildatscale-claude-code/nano-banana/4f1bf867bb62/skills/generate/scripts/image.py"
OUT="/Users/ryansousa/Documents/GitHub/office-pools/assets/showdown-storyboard"
MODEL="flash"
ASPECT="16:9"

# Shared beat structure across all moods (mood treatment changes, narrative does not).
BEATS=(
  "t=0.0s - Dark establishing shot: view from inside a sports stadium tunnel looking out toward a distant bright opening, walls dimly lit, atmospheric haze, no figures visible yet, mostly dark with a small bright doorway at the end of the tunnel."
  "t=0.5s - Atmosphere build: closer to the tunnel exit, walls visible with concrete or stone texture, dramatic light shafts cutting through smoke and haze, slight motion blur as if the camera is dolly-tracking forward, anticipation building, still no figures."
  "t=1.0s - Silhouettes emerge: two backlit figures starting to appear in the tunnel midground, only silhouettes against the bright stadium light beyond, dramatic rim lighting on their shoulders."
  "t=1.5s - Stride forward: the two figures clearer now, mid-stride walking toward camera, still partially in shadow but features beginning to be visible, atmospheric smoke around their feet."
  "t=2.0s - The threshold (climax beat): both figures hit the boundary between tunnel and stadium light, brightest moment, dramatic god-rays and lens flare, iconic 'walking out' moment."
  "t=2.5s - Full reveal: both figures fully lit, massive venue visible behind them with crowd silhouettes and lighting, hero composition."
  "t=3.0s - Hero shot: two figures squared off facing camera in a head-to-head composition, venue dramatic behind, name plates appearing at lower thirds with placeholder names 'PLAYER A' and 'PLAYER B'."
  "t=4.0s - Final lock card: clean composition with the two figures framed, large 'GAMEWEEK 3' text top, 'PLAYER A vs PLAYER B' matchup card center, broadcast graphics polish, shareable artifact format."
)

# Per-mood visual treatment, returned by the function below.
mood_treatment () {
  case "$1" in
    cinematic)
      echo "MOOD: cinematic and serious, like a UEFA Champions League opener or UFC pay-per-view walk-out. Dramatic key lighting, deep blues and blacks with gold accents, long shadows, atmospheric light shafts through haze, weighty and slow-burn pacing. Photorealistic broadcast quality. Two anonymous male athletes (do not depict real people)."
      ;;
    hyped)
      echo "MOOD: hyped and high-energy, like an EA Sports FC video game intro or NBA on TNT intro. Neon palette with cyan, magenta and electric green, high contrast, pulsing lights, lens flares, kinetic motion graphics with speed lines and particle effects, vibrant and explosive. Two anonymous athletes (do not depict real people)."
      ;;
    irreverent)
      echo "MOOD: irreverent and meme-y, like NFL Sunday Night Football's intro played as a parody. Oversaturated americana palette, theatrical over-the-top lighting, bold blocky text in TV broadcast style, knowing wink - the figures are clearly normal office mates in casual clothes (not athletes), and the contrast between the broadcast-grand treatment and the regular guys is the joke. Slightly absurd."
      ;;
    office-pool)
      echo "MOOD: office-pool friendly, like you and your mates at the local pub. Warm golden-hour tones with practical lights (pub neon, string lights, table lamps), grounded and relatable, Sunday League / FA People's Cup amateur vibes, character-forward not stadium-scale. Two regular guys in casual clothes (hoodies, jackets), pub interior with wood tones, mates visible in background."
      ;;
  esac
}

gen_mood () {
  local mood="$1"
  local treatment
  treatment=$(mood_treatment "${mood}")
  echo ""
  echo "================================================================"
  echo "  Generating mood: ${mood}"
  echo "================================================================"
  for i in 0 1 2 3 4 5 6 7; do
    local frame_num
    frame_num=$(printf "%02d" $((i + 1)))
    local beat="${BEATS[$i]}"
    local out_file="${OUT}/${mood}/frame-${frame_num}.png"
    local prompt
    prompt="${treatment}

Beat ${frame_num} of 8 in a 4-second narrative. ${beat}

Render style: 16:9 cinematic still, broadcast quality, this is a storyboard frame for an animation reveal sequence used inside a sports prediction app."
    (
      uv run "${SKILL_SCRIPT}" \
        --prompt "${prompt}" \
        --output "${out_file}" \
        --aspect "${ASPECT}" \
        --model "${MODEL}" \
        > "${OUT}/${mood}/frame-${frame_num}.log" 2>&1 \
        && echo "  ok  ${mood}/frame-${frame_num}.png" \
        || echo "  ERR ${mood}/frame-${frame_num}.png (see ${mood}/frame-${frame_num}.log)"
    ) &
  done
  wait
  echo "Mood '${mood}' complete."
}

START=$(date +%s)
echo "Starting storyboard generation: 32 frames (4 moods x 8 beats), Flash model, 16:9."

gen_mood cinematic
gen_mood hyped
gen_mood irreverent
gen_mood office-pool

END=$(date +%s)
echo ""
echo "================================================================"
echo "  ALL DONE in $((END - START)) seconds"
echo "================================================================"
ls -1 "${OUT}"/*/*.png 2>/dev/null | wc -l | xargs -I{} echo "  Generated {} PNG files."
