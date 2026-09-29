'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import {
  KLIPY_SEARCH_PLACEHOLDER,
  klipyCustomerId,
  klipyGifsUrl,
  parseKlipyPage,
  type KlipyGif,
} from '@/lib/banter/klipy'

/** Public by design — KLIPY requires the browser, not our server, to call it. */
export const KLIPY_WEB_KEY = process.env.NEXT_PUBLIC_KLIPY_API_KEY ?? ''

/**
 * Both platforms ask for every format a message needs, whoever renders it: the web plays the MP4,
 * the phone plays the GIF, and a GIF sent from one is shown on the other.
 */
const FORMATS: ('mp4' | 'gif' | 'jpg')[] = ['mp4', 'gif', 'jpg']

/**
 * The GIF picker. Talks to KLIPY directly from the browser (their terms), shows results in the
 * order KLIPY returns them (their terms), and its search box reads "Search KLIPY" (their required
 * attribution).
 *
 * ⚠ The test key allows 100 requests an hour, so typing is debounced and paging is a button, not
 * an infinite scroll that fires on every flick.
 */
export function GifPicker({
  isOpen,
  currentUserId,
  onClose,
  onSelect,
}: {
  isOpen: boolean
  currentUserId: string
  onClose: () => void
  /** `query` is the search that led here ('' for trending) — KLIPY's share trigger wants it. */
  onSelect: (gif: KlipyGif, query: string) => void
}) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<KlipyGif[]>([])
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const requestRef = useRef(0)

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 400)
    return () => window.clearTimeout(t)
  }, [query])

  const load = useCallback(async (q: string, nextPage: number) => {
    const id = ++requestRef.current
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch(klipyGifsUrl({
        apiKey: KLIPY_WEB_KEY,
        customerId: klipyCustomerId(currentUserId),
        q,
        page: nextPage,
        perPage: 24,
        formats: FORMATS,
      }))
      const parsed = parseKlipyPage(await res.json())
      if (id !== requestRef.current) return // a newer search superseded this one
      setItems(prev => (nextPage === 1 ? parsed.items : [...prev, ...parsed.items]))
      setHasNext(parsed.hasNext)
      setPage(nextPage)
    } catch (err) {
      if (id !== requestRef.current) return
      console.error('[GifPicker] KLIPY request failed:', err)
      setFailed(true)
    } finally {
      if (id === requestRef.current) setLoading(false)
    }
  }, [currentUserId])

  useEffect(() => {
    if (isOpen) void load(debounced, 1)
  }, [isOpen, debounced, load])

  // Opening afresh starts on trending, not on whatever was searched last time.
  useEffect(() => {
    if (!isOpen) { setQuery(''); setDebounced('') }
  }, [isOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Send a GIF" size="md">
      <div className="px-4 sm:px-6 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2 h-10 px-3 rounded-control bg-mist">
          <Icon name="magnifyingglass" size={16} className="text-muted" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={KLIPY_SEARCH_PLACEHOLDER}
            aria-label={KLIPY_SEARCH_PLACEHOLDER}
            className="flex-1 min-w-0 bg-transparent t-body text-ink placeholder:text-muted outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-muted hover:text-ink">
              <Icon name="xmark" size={14} weight="semibold" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-4">
        {failed && items.length === 0 ? (
          <p className="t-body text-muted text-center py-10">GIFs couldn’t load. Try again in a moment.</p>
        ) : !loading && items.length === 0 ? (
          <p className="t-body text-muted text-center py-10">No GIFs for “{debounced}”.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {items.map(gif => (
              <button
                key={gif.slug}
                type="button"
                onClick={() => onSelect(gif, debounced)}
                className="relative w-full overflow-hidden rounded-chip bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/60"
                style={{ aspectRatio: `${gif.width} / ${gif.height}` }}
                aria-label={gif.title || 'GIF'}
              >
                {gif.mp4Url ? (
                  <video
                    src={gif.mp4Url}
                    poster={gif.stillUrl ?? undefined}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- KLIPY media must load from their URL as returned
                  <img src={gif.gifUrl ?? ''} alt="" className="absolute inset-0 w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )}

        {loading && <p className="t-detail text-muted text-center py-4">Loading…</p>}

        {!loading && hasNext && items.length > 0 && (
          <div className="flex justify-center pt-4">
            <button
              type="button"
              onClick={() => void load(debounced, page + 1)}
              className="px-4 h-9 rounded-pill bg-mist t-body font-semibold text-ink hover:bg-ink/10 transition-colors"
            >
              More GIFs
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 sm:px-6 py-2 border-t border-border-subtle text-right">
        <span className="text-[11px] font-semibold text-muted">Powered by KLIPY</span>
      </div>
    </Modal>
  )
}
