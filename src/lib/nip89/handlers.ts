import type { Event } from 'nostr-tools/pure';
import type { HandlerInfo, HandlerUrl, ResolvedHandler } from './types';

export function parseHandlerEvent(event: Event): HandlerInfo {
  const dTag = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
  const kinds = event.tags
    .filter((t) => t[0] === 'k' && t[1])
    .map((t) => Number(t[1]));

  const urls: HandlerUrl[] = event.tags
    .filter((t): t is [string, string, ...string[]] => t[0] === 'web' && !!t[1])
    .map((t) => ({
      template: t[1],
      nip19Type: t[2] || undefined,
    }));

  let name = '';
  let picture: string | undefined;
  let about: string | undefined;

  if (event.content) {
    try {
      const meta = JSON.parse(event.content);
      name = meta.name ?? meta.display_name ?? '';
      picture = meta.picture || undefined;
      about = meta.about || undefined;
    } catch {
      // invalid JSON content
    }
  }

  return { pubkey: event.pubkey, dTag, name, picture, about, kinds, urls };
}

export function buildHandlerUrl(
  handler: HandlerInfo,
  bech32: string,
  nip19Type: string,
): string | null {
  // First try exact nip19Type match
  const exact = handler.urls.find((u) => u.nip19Type === nip19Type);
  if (exact) return exact.template.replace('<bech32>', bech32);

  // Fall back to generic (no nip19Type specified)
  const generic = handler.urls.find((u) => !u.nip19Type);
  if (generic) return generic.template.replace('<bech32>', bech32);

  return null;
}

export function njumpFallbackUrl(bech32: string): string {
  return `https://njump.me/${bech32}`;
}

export function resolveHandlers(
  handlers: HandlerInfo[],
  bech32: string,
  nip19Type: string,
  followedPubkeys: Set<string>,
): ResolvedHandler[] {
  const resolved: ResolvedHandler[] = [];

  for (const handler of handlers) {
    const url = buildHandlerUrl(handler, bech32, nip19Type);
    if (!url) continue;
    resolved.push({
      handler,
      url,
      isFollowed: followedPubkeys.has(handler.pubkey),
    });
  }

  resolved.sort((a, b) => {
    if (a.isFollowed !== b.isFollowed) return a.isFollowed ? -1 : 1;
    return a.handler.name.localeCompare(b.handler.name);
  });

  return resolved;
}
