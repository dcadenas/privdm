import { Fragment, useMemo } from 'react';
import { parseContent, shortenUrl } from '@/lib/content/parse';
import { InlineImage, InlineVideo, YouTubeThumbnail } from './InlineMedia';
import { NostrMention } from './NostrMention';
import { QuotedEvent } from './QuotedEvent';
import { HandlerCard } from './HandlerCard';

export function MessageContent({ content, isMine }: { content: string; isMine: boolean }) {
  const segments = useMemo(() => parseContent(content), [content]);

  const linkClass = isMine
    ? 'text-gray-950/80 underline decoration-gray-950/40 hover:decoration-gray-950/70'
    : 'text-amber-400 underline decoration-amber-400/40 hover:decoration-amber-400/70';

  return (
    <span className="whitespace-pre-wrap break-words">
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'text':
            return <Fragment key={i}>{seg.value}</Fragment>;
          case 'url':
            return (
              <a key={i} href={seg.value} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {shortenUrl(seg.value)}
              </a>
            );
          case 'image':
            return <InlineImage key={i} url={seg.value} isMine={isMine} />;
          case 'video':
            return <InlineVideo key={i} url={seg.value} />;
          case 'youtube':
            return <YouTubeThumbnail key={i} videoId={seg.videoId} url={seg.value} />;
          case 'nostr-profile':
            return <NostrMention key={i} pubkey={seg.pubkey} isMine={isMine} />;
          case 'nostr-event':
            return <QuotedEvent key={i} eventId={seg.eventId} relays={seg.relays} bech32={seg.bech32} kind={seg.kind} isMine={isMine} />;
          case 'nostr-address':
            return <HandlerCard key={i} kind={seg.kind} bech32={seg.bech32} nip19Type="naddr" />;
        }
      })}
    </span>
  );
}
