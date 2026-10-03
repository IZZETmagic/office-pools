'use client'

import { useEffect } from 'react'

import { MessageRow } from './MessageRow'
import type { MemberData } from '../types'
import type { MemberWithLevel, MessageWithReactions, ReactionCount } from './types'
import { formatClockTime } from './helpers'
import { Icon } from '@/components/ui/Icon'
import { fitPhoto, readPhotoMetadata } from '@/lib/banter/photoMessage'

/**
 * A member's photo (159), inside the same MessageRow chassis as text, cards and GIFs — so reply,
 * react, report and delete come for free. The box takes the photo's own aspect ratio from
 * metadata before the signed URL arrives, so the feed doesn't jump when it loads. Clicking opens
 * the lightbox.
 *
 * Unreadable metadata falls back to the message text, "📷 sent a photo", exactly as an older
 * build would show it.
 */
export function PhotoMessage({
  message,
  url,
  onOpen,
  members,
  memberLevels,
  currentUserId,
  reactions = [],
  onToggleReaction,
  onReply,
  onDelete,
  onReport,
  onBlock,
}: {
  message: MessageWithReactions
  /** Signed URL; null while signing. */
  url: string | null
  onOpen: (url: string) => void
  members: MemberData[]
  memberLevels: Map<string, MemberWithLevel>
  currentUserId: string
  reactions?: ReactionCount[]
  onToggleReaction?: (emoji: string) => void
  onReply?: () => void
  onDelete?: () => void
  onReport?: () => void
  onBlock?: () => void
}) {
  const photo = readPhotoMetadata(message.metadata)
  const size = photo ? fitPhoto(photo.width, photo.height, 280, 360) : null

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
      onReport={onReport}
      onBlock={onBlock}
    >
      {photo && size ? (
        <button
          type="button"
          onClick={() => url && onOpen(url)}
          disabled={!url}
          aria-label="Photo — open full size"
          className="relative block overflow-hidden rounded-chip bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/60"
          style={{ width: size.width, maxWidth: '100%', aspectRatio: `${photo.width} / ${photo.height}` }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private, signed, expiring URL; next/image would cache and re-serve it
            <img src={url} alt="Photo" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 animate-pulse bg-silver/40" aria-hidden />
          )}
          <span
            className="absolute right-1.5 bottom-1.5 px-1.5 py-0.5 rounded-chip bg-black/45 text-white text-[11px] font-medium leading-none pointer-events-none"
            suppressHydrationWarning
          >
            {formatClockTime(message.created_at)}
          </span>
        </button>
      ) : (
        <div className="px-3.5 py-2 rounded-chip bg-mist text-ink text-base font-medium">{message.content}</div>
      )}
    </MessageRow>
  )
}

/** Full-size photo over a dark backdrop. Click outside, the ✕ or Escape closes it. */
export function PhotoLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!url) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [url, onClose])

  if (!url) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-modal-backdrop"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
      <img
        src={url}
        alt="Photo"
        className="max-w-full max-h-full object-contain select-none"
        onClick={e => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute top-4 right-4 w-10 h-10 rounded-pill bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
      >
        <Icon name="xmark" size={18} weight="bold" />
      </button>
    </div>
  )
}
