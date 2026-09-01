'use client'

// =============================================================
// THE CORRIDOR, IN THE BROWSER
// =============================================================
// The same tunnel as remotion/DuelReveal.tsx — rings receding to a vanishing
// point, fog for depth, a camera that travels through them — rendered live with
// React Three Fiber instead of frame by frame.
//
// ## ⚠ WHY THIS EXISTS AT ALL
//
// The app had a CSS imitation: concentric rounded rectangles scaled up on a
// transition. It could not work, and did not: scaled rectangles only GROW, so
// nothing is ever further away, there is no parallax and no camera. Worse, the
// depth was a modulo driven by a transition, and a transition INTERPOLATES
// THROUGH the wrap — half the rings visibly travelled backwards.
//
// R3F is not a port of the Remotion version so much as the same library finally
// used in the place it was designed for. `three` and `@react-three/fiber` were
// already dependencies for the video.
//
// ## ⚠ `useFrame` IS ALLOWED HERE. IT IS FORBIDDEN IN THE REMOTION TWIN.
//
// This is the one real difference between the two files, and it is not a style
// choice. Remotion renders each frame independently, often on different
// machines, so anything advancing on its own clock samples the scene at a
// different point per frame and the file flickers — its 3D guidance bans
// `useFrame` outright and drives everything from `useCurrentFrame()`. A live
// browser has exactly one clock and no such problem.
//
// ⚠ LOAD IT LAZILY. `three` is roughly 600KB gzipped. Nobody who never presses
// Reveal should pay for it, which is why DuelRevealCeremony pulls this in with
// `next/dynamic` and `ssr: false` rather than importing it directly.
// =============================================================

import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'

const COUNT = 20
const SPACING = 3.6
const DEPTH = COUNT * SPACING

/**
 * @param accent  their colour once revealed, or null while sealed.
 * @param speed   world units per second. Raised during the charge.
 */
export default function DuelRevealCorridor({
  accent,
  speed,
}: {
  accent: string | null
  speed: number
}) {
  return (
    <Canvas
      // ⚠ `alpha` so the ceremony's own background shows through, and the
      // corridor composites over it rather than owning the whole screen.
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0, 0], fov: 75 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <ambientLight intensity={0.16} />
      <pointLight position={[0, 0, -DEPTH]} intensity={220} distance={120} color="#FFFFFF" />
      {/* ⚠ Fog is doing most of the work. Depth falloff is what gives a corridor
          length; without it the far rings are as crisp as the near ones and the
          whole thing flattens back into circles. */}
      <fog attach="fog" args={['#04060A', 5, DEPTH * 0.85]} />
      <Rings accent={accent} speed={speed} />
      {/* A floor, or this is a portal rather than a hallway — rings alone are
          concentric circles with nothing to stand on. */}
      <mesh position={[0, -3.1, -DEPTH / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, DEPTH]} />
        <meshStandardMaterial color="#080D18" emissive="#141A2E" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0, 0, -DEPTH]}>
        <circleGeometry args={[2.8, 64]} />
        <meshBasicMaterial color="#FFFFFF" toneMapped={false} />
      </mesh>
    </Canvas>
  )
}

function Rings({ accent, speed }: { accent: string | null; speed: number }) {
  const group = useRef<Group>(null)
  const travelled = useRef(0)

  useFrame((_, delta) => {
    // ⚠ `delta`, not a frame counter. A browser does not promise 60fps, and
    // advancing by a fixed step per frame makes the corridor run at whatever
    // rate the device happens to paint — slower on a loaded phone, which is
    // exactly where it must not be slower.
    travelled.current = (travelled.current + delta * speed) % DEPTH
    if (!group.current) return
    for (let i = 0; i < group.current.children.length; i++) {
      const child = group.current.children[i]
      // The wrap is a discrete jump per frame, which is safe — it was only ever
      // a problem when a CSS transition interpolated through it.
      child.position.z = -(((i * SPACING - travelled.current) % DEPTH) + DEPTH) % DEPTH
    }
  })

  const colour = accent ?? '#FFFFFF'
  return (
    <group ref={group}>
      {Array.from({ length: COUNT }).map((_, i) => (
        <mesh key={i} position={[0, 0, -i * SPACING]}>
          <torusGeometry args={[3.1, 0.05, 8, 64]} />
          <meshStandardMaterial
            color={colour}
            emissive={colour}
            emissiveIntensity={accent ? 2.4 : 0.5}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}
