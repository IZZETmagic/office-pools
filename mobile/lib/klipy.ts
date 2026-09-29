/**
 * KLIPY — the GIF provider for Banter. ⚠ A COPY of the web's `lib/banter/klipy.ts`.
 *
 * Metro cannot reach the web's `lib/`, so the phone carries its own copy. The root guard
 * `lib/__tests__/klipyParity.guard.test.ts` feeds both the same KLIPY response and fails if they
 * disagree — change both files together. KLIPY's terms and why they shape this are documented in
 * the web file.
 */

export const KLIPY_API = 'https://api.klipy.com/api/v1';

/** KLIPY's required attribution — the search input's placeholder, verbatim. */
export const KLIPY_SEARCH_PLACEHOLDER = 'Search KLIPY';

/** What a GIF message carries as `content`: old builds, pushes and reply quotes show this. */
export const GIF_MESSAGE_CONTENT = '🎞️ sent a GIF';

/** Every media URL we store must be on one of KLIPY's documented media hosts (150 enforces it). */
const KLIPY_MEDIA_URL = /^https:\/\/static[12]?\.klipy\.com\//;

export function isKlipyMediaUrl(url: unknown): url is string {
  return typeof url === 'string' && KLIPY_MEDIA_URL.test(url);
}

/** One GIF as the picker shows it and the message stores it. */
export type KlipyGif = {
  slug: string;
  title: string;
  /** Intrinsic size of the file we render — sets the aspect ratio before it loads. */
  width: number;
  height: number;
  /** Small MP4 — what the web plays (a fraction of the GIF's bytes). */
  mp4Url: string | null;
  /** Small animated GIF — what RN plays through expo-image. */
  gifUrl: string | null;
  /** First frame, for posters and reduced motion. */
  stillUrl: string | null;
};

/** The `metadata` of a `message_type = 'gif'` row. Keys match migration 150 exactly. */
export type GifMetadata = {
  provider: 'klipy';
  slug: string;
  title?: string;
  width: number;
  height: number;
  mp4_url?: string;
  gif_url?: string;
  still_url?: string;
};

/**
 * KLIPY wants a stable per-user id. We send an opaque hash of ours rather than the id itself, so
 * nothing KLIPY holds can be joined back to our database. Two salted FNV-1a 32-bit passes = 64
 * bits: no dependency and no BigInt, so it is identical on web and RN (Hermes).
 */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function klipyCustomerId(userId: string): string {
  return `sp-${fnv1a32(`sportpool:a:${userId}`)}${fnv1a32(`sportpool:b:${userId}`)}`;
}

export type KlipyQuery = {
  apiKey: string;
  customerId: string;
  /** Blank = trending. */
  q?: string;
  page?: number;
  perPage?: number;
  /** ISO 3166 alpha-2, lower case. */
  locale?: string;
  /** Only the formats the caller renders — keeps each response small. */
  formats: ('mp4' | 'gif' | 'jpg')[];
};

export function klipyGifsUrl({
  apiKey,
  customerId,
  q,
  page = 1,
  perPage = 24,
  locale = 'us',
  formats,
}: KlipyQuery): string {
  const term = q?.trim() ?? '';
  const params = new URLSearchParams({
    page: String(page),
    // Search refuses fewer than 8 per page; trending allows 1. 50 is the cap for both.
    per_page: String(Math.min(50, Math.max(8, perPage))),
    customer_id: customerId,
    locale,
    // The strictest level KLIPY offers. The Partner Panel's blocked terms sit on top of it.
    content_filter: 'high',
    format_filter: formats.join(','),
  });
  if (term) params.set('q', term);
  return `${KLIPY_API}/${encodeURIComponent(apiKey)}/gifs/${term ? 'search' : 'trending'}?${params}`;
}

/** POST target that tells KLIPY a GIF was sent (their analytics; body: customer_id, q). */
export function klipyShareUrl(apiKey: string, slug: string): string {
  return `${KLIPY_API}/${encodeURIComponent(apiKey)}/gifs/share/${encodeURIComponent(slug)}`;
}

type RawFile = { url?: unknown; width?: unknown; height?: unknown };
type RawTier = Partial<Record<'gif' | 'webp' | 'jpg' | 'mp4' | 'webm', RawFile>>;
type RawItem = {
  slug?: unknown;
  title?: unknown;
  type?: unknown;
  file?: Partial<Record<'hd' | 'md' | 'sm' | 'xs', RawTier>>;
};

function mediaUrl(f: RawFile | undefined): string | null {
  return f && isKlipyMediaUrl(f.url) ? f.url : null;
}

function dims(f: RawFile | undefined): { width: number; height: number } | null {
  const w = Number(f?.width);
  const h = Number(f?.height);
  return w > 0 && h > 0 ? { width: w, height: h } : null;
}

/**
 * The `sm` tier is the one we send: small enough for a chat bubble (~220px wide), and its MP4 is
 * typically a few tens of KB. Falls back to `md` only when `sm` lacks a format.
 */
export function parseKlipyItem(raw: unknown): KlipyGif | null {
  const item = raw as RawItem | null;
  // Ads are switched off for our keys; if one ever arrives we cannot render it as a GIF.
  if (!item || item.type === 'ad' || typeof item.slug !== 'string' || !item.slug) return null;
  const sm = item.file?.sm ?? {};
  const md = item.file?.md ?? {};
  const mp4Url = mediaUrl(sm.mp4) ?? mediaUrl(md.mp4);
  const gifUrl = mediaUrl(sm.gif) ?? mediaUrl(md.gif);
  const stillUrl = mediaUrl(sm.jpg) ?? mediaUrl(md.jpg);
  const size = dims(sm.gif) ?? dims(sm.mp4) ?? dims(sm.jpg) ?? dims(md.gif) ?? dims(md.mp4);
  if (!size || (!mp4Url && !gifUrl)) return null;
  return {
    slug: item.slug,
    title: typeof item.title === 'string' ? item.title : '',
    width: size.width,
    height: size.height,
    mp4Url,
    gifUrl,
    stillUrl,
  };
}

export type KlipyPage = { items: KlipyGif[]; hasNext: boolean };

export function parseKlipyPage(json: unknown): KlipyPage {
  const body = json as { result?: unknown; data?: { data?: unknown; has_next?: unknown } } | null;
  if (!body || body.result !== true || !Array.isArray(body.data?.data)) {
    throw new Error('KLIPY returned an unexpected response');
  }
  const items: KlipyGif[] = [];
  for (const raw of body.data.data) {
    const gif = parseKlipyItem(raw);
    if (gif) items.push(gif);
  }
  return { items, hasNext: body.data.has_next === true };
}

export function toGifMetadata(gif: KlipyGif): GifMetadata {
  const meta: GifMetadata = {
    provider: 'klipy',
    slug: gif.slug,
    width: gif.width,
    height: gif.height,
  };
  if (gif.title) meta.title = gif.title.slice(0, 200);
  if (gif.mp4Url) meta.mp4_url = gif.mp4Url;
  if (gif.gifUrl) meta.gif_url = gif.gifUrl;
  if (gif.stillUrl) meta.still_url = gif.stillUrl;
  return meta;
}

/** Read a stored row's metadata back, refusing anything that is not a KLIPY URL. */
export function readGifMetadata(metadata: unknown): GifMetadata | null {
  const m = metadata as Partial<GifMetadata> | null;
  if (!m || m.provider !== 'klipy' || typeof m.slug !== 'string') return null;
  const width = Number(m.width);
  const height = Number(m.height);
  if (!(width > 0 && height > 0)) return null;
  const out: GifMetadata = { provider: 'klipy', slug: m.slug, width, height };
  if (typeof m.title === 'string') out.title = m.title;
  if (isKlipyMediaUrl(m.mp4_url)) out.mp4_url = m.mp4_url;
  if (isKlipyMediaUrl(m.gif_url)) out.gif_url = m.gif_url;
  if (isKlipyMediaUrl(m.still_url)) out.still_url = m.still_url;
  return out.mp4_url || out.gif_url ? out : null;
}

/** Fit a GIF inside a bubble, never blowing it up past 1.25× its own pixels. */
export function fitGif(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1.25, maxWidth / width, maxHeight / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
