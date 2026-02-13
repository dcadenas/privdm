import { nip19 } from 'nostr-tools';

export type ContentSegment =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string }
  | { type: 'image'; value: string }
  | { type: 'video'; value: string }
  | { type: 'youtube'; value: string; videoId: string }
  | { type: 'nostr-profile'; value: string; pubkey: string }
  | { type: 'nostr-event'; value: string; bech32: string; eventId: string; relays?: string[]; author?: string; kind?: number }
  | { type: 'nostr-address'; value: string; bech32: string; kind: number; pubkey: string; identifier: string; relays?: string[] };

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg)(\?[^\s]*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov)(\?[^\s]*)?$/i;

// Combined token regex: nostr entities, bare bech32 references, and URLs
const TOKEN_RE =
  /nostr:(npub1|nprofile1|note1|nevent1|naddr1)[a-z0-9]+|((npub1|nprofile1|note1|nevent1|naddr1)[a-z0-9]{58,})|(https?:\/\/[^\s<>"]+)/gi;

function extractYoutubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const shorts = u.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shorts?.[1]) return shorts[1];
      const embed = u.pathname.match(/^\/embed\/([a-zA-Z0-9_-]+)/);
      if (embed?.[1]) return embed[1];
    }
    if (host === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
  } catch {
    // invalid URL
  }
  return null;
}

function extractVimeoId(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') === 'vimeo.com' && /^\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
}

function stripTrailingPunctuation(url: string): [string, string] {
  // Strip trailing chars that are likely sentence punctuation, not part of URL
  // But respect balanced parens (common in Wikipedia URLs)
  let stripped = url;
  const trailingChars: string[] = [];

  while (stripped.length > 0) {
    const last = stripped[stripped.length - 1];
    if (last === '.' || last === ',' || last === ';' || last === '!' || last === '?') {
      trailingChars.unshift(last);
      stripped = stripped.slice(0, -1);
    } else if (last === ')') {
      // Only strip if parens are unbalanced
      const opens = (stripped.match(/\(/g) || []).length;
      const closes = (stripped.match(/\)/g) || []).length;
      if (closes > opens) {
        trailingChars.unshift(last);
        stripped = stripped.slice(0, -1);
      } else {
        break;
      }
    } else if (last === ']') {
      const opens = (stripped.match(/\[/g) || []).length;
      const closes = (stripped.match(/\]/g) || []).length;
      if (closes > opens) {
        trailingChars.unshift(last);
        stripped = stripped.slice(0, -1);
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return [stripped, trailingChars.join('')];
}

function classifyUrl(raw: string): ContentSegment {
  const [url, _trailing] = stripTrailingPunctuation(raw);

  const youtubeId = extractYoutubeId(url);
  if (youtubeId) return { type: 'youtube', value: url, videoId: youtubeId };
  if (extractVimeoId(url)) return { type: 'url', value: url };
  if (IMAGE_EXT.test(url)) return { type: 'image', value: url };
  if (VIDEO_EXT.test(url)) return { type: 'video', value: url };
  return { type: 'url', value: url };
}

function decodeNostrEntity(bech32: string, raw: string): ContentSegment {
  try {
    const decoded = nip19.decode(bech32);
    switch (decoded.type) {
      case 'npub':
        return { type: 'nostr-profile', value: raw, pubkey: decoded.data };
      case 'nprofile':
        return { type: 'nostr-profile', value: raw, pubkey: decoded.data.pubkey };
      case 'note':
        return { type: 'nostr-event', value: raw, bech32, eventId: decoded.data };
      case 'nevent':
        return {
          type: 'nostr-event',
          value: raw,
          bech32,
          eventId: decoded.data.id,
          relays: decoded.data.relays?.length ? decoded.data.relays : undefined,
          author: decoded.data.author,
          kind: decoded.data.kind,
        };
      case 'naddr':
        return {
          type: 'nostr-address',
          value: raw,
          bech32,
          kind: decoded.data.kind,
          pubkey: decoded.data.pubkey,
          identifier: decoded.data.identifier,
          relays: decoded.data.relays?.length ? decoded.data.relays : undefined,
        };
      default:
        return { type: 'text', value: raw };
    }
  } catch {
    return { type: 'text', value: raw };
  }
}

export function parseContent(text: string): ContentSegment[] {
  if (!text) return [];

  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;

    // Add preceding text
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }

    if (raw.startsWith('nostr:')) {
      // nostr: URI — entity is everything after "nostr:"
      const bech32 = raw.slice(6);
      segments.push(decodeNostrEntity(bech32, raw));
    } else if (/^(npub1|nprofile1|note1|nevent1|naddr1)/i.test(raw)) {
      // Bare bech32 reference
      segments.push(decodeNostrEntity(raw, raw));
    } else {
      // URL — handle trailing punctuation
      const [cleanUrl, trailing] = stripTrailingPunctuation(raw);
      const seg = classifyUrl(cleanUrl);
      segments.push(seg);
      if (trailing) {
        segments.push({ type: 'text', value: trailing });
      }
      // Adjust regex lastIndex if we gave back trailing chars
      if (trailing) {
        TOKEN_RE.lastIndex = start + raw.length - trailing.length + trailing.length;
      }
    }

    lastIndex = match.index + raw.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

export function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname + u.search;
    return display.length > 50 ? display.slice(0, 47) + '...' : display;
  } catch {
    return url.length > 50 ? url.slice(0, 47) + '...' : url;
  }
}
