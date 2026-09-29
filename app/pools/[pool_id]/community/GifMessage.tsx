'use client'

import { useEffect, useRef, useState } from 'react'

import { MessageRow } from './MessageRow'
import type { MemberData } from '../types'
import type { MemberWithLevel, MessageWithReactions, ReactionCount } from './types'
import { formatClockTime } from './helpers'
import { fitGif, readGifMetadata } from '@/lib/banter/klipy'

/**
 * A GIF from KLIPY, inside the same MessageRow chassis as text and cards — so reply, react and
 * delete come for free.
 *
 * Plays the MP4 (a fraction of the GIF's bytes), straight from KLIPY's CDN as their terms
 * require. With reduced motion on it shows the first frame and plays only when tapped.
 *
 * If the metadata is unreadable (or not KLIPY's — `readGifMetadata` refuses other hosts), it
 * falls back to the message's text, "🎞️ sent a GIF", exactly as an older build would.
 */
export function GifMessage({
  message,
  members,
  memberLevels,
  currentUserId,
  reactions = [],
  onToggleReaction,
  onReply,
  onDelete,
}: {
  message: MessageWithReactions
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  reactions?: ReactionCount[]
  onToggleReaction?: (emoji: string) => void
  onReply?: () => void
  onDelete?: () => void
}) {
  const gif = readGifMetadata(message.metadata)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const size = gif ? fitGif(gif.width, gif.height, 260, 260) : null
  const still = reducedMotion && !playing

  return (
    <MessageRow
      userId={message.user_id}
      members={members}
      memberLevels={memberLevels}
      currentUserId={currentUserId}
      reactions={reactions}
      onToggleReaction={onToggleReaction}
      onReply={onReply}
      onDelete={onDelete}
    >
      {gif && size ? (
        <div
          className="relative overflow-hidden rounded-chip bg-mist"
          style={{ width: size.width, maxWidth: '100%', aspectRatio: `${gif.width} / ${gif.height}` }}
        >
          {gif.mp4_url ? (
            <video
              ref={videoRef}
              src={gif.mp4_url}
              poster={gif.still_url}
              autoPlay={!reducedMotion}
              loop
              muted
              playsInline
              aria-label={gif.title || 'GIF'}
              onClick={() => {
                if (!reducedMotion) return
                setPlaying(true)
                void videoRef.current?.play()
              }}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- KLIPY media must load from their URL as returned
            <img
              src={still && gif.still_url ? gif.still_url : gif.gif_url}
              alt={gif.title || 'GIF'}
              onClick={() => setPlaying(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {still && (
            <span className="absolute left-2 top-2 px-1.5 py-0.5 rounded-chip bg-black/55 text-white text-[10px] font-bold pointer-events-none">
              GIF
            </span>
          )}
          <span
            className="absolute right-1.5 bottom-1.5 px-1.5 py-0.5 rounded-chip bg-black/45 text-white text-[11px] font-medium leading-none pointer-events-none"
            suppressHydrationWarning
          >
            {formatClockTime(message.created_at)}
          </span>
        </div>
      ) : (
        <div className="px-3.5 py-2 rounded-chip bg-mist text-ink text-base font-medium">{message.content}</div>
      )}
    </MessageRow>
  )
}
