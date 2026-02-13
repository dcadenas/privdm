import { nip19 } from 'nostr-tools';
import { useEvent } from '@/hooks/use-event';
import { DisplayName } from '@/components/profile';
import { HandlerLinks } from './HandlerLinks';

const KIND_LABELS: Record<number, string> = {
  0: 'Profile',
  1: 'Note',
  6: 'Repost',
  7: 'Reaction',
  30023: 'Article',
  30311: 'Live Activity',
  31990: 'App Handler',
};

function kindLabel(kind: number): string {
  return KIND_LABELS[kind] ?? `Kind ${kind}`;
}

function formatEventTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function cardClasses(isMine: boolean): string {
  return isMine
    ? 'my-1 rounded-lg border border-gray-950/20 bg-gray-950/15 px-3 py-2 text-xs'
    : 'my-1 rounded-lg border border-gray-700/40 bg-gray-800/40 px-3 py-2 text-xs';
}

function QuotedEventSkeleton({ isMine }: { isMine: boolean }) {
  return (
    <div className={`${cardClasses(isMine)} animate-pulse`}>
      <div className="h-3 w-24 rounded bg-gray-700/40" />
      <div className="mt-2 h-3 w-48 rounded bg-gray-700/40" />
    </div>
  );
}

interface QuotedEventFallbackProps {
  eventId: string;
  bech32?: string;
  kind?: number;
  author?: string;
  isMine: boolean;
}

function QuotedEventFallback({ eventId, bech32, kind, author, isMine }: QuotedEventFallbackProps) {
  const eventBech32 = bech32 ?? nip19.neventEncode({ id: eventId, kind, author });
  const metaClass = isMine ? 'text-gray-950/60' : 'text-gray-500';
  const labelClass = isMine ? 'text-gray-950/80' : 'text-gray-300';

  return (
    <div className={cardClasses(isMine)}>
      <div className={`flex items-center gap-1.5 ${metaClass}`}>
        {author && <DisplayName pubkey={author} />}
        {kind !== undefined && (
          <span className={`${author ? 'ml-auto' : ''} text-[10px]`}>{kindLabel(kind)}</span>
        )}
      </div>
      {!author && kind === undefined && (
        <span className={`font-mono text-[10px] ${metaClass}`}>
          {eventBech32.slice(0, 16)}...{eventBech32.slice(-8)}
        </span>
      )}
      <p className={`mt-1 ${labelClass}`}>Referenced event not found on relays</p>
      <HandlerLinks kind={kind ?? 1} bech32={eventBech32} nip19Type="nevent" isMine={isMine} />
    </div>
  );
}

interface QuotedEventProps {
  eventId: string;
  relays?: string[];
  bech32?: string;
  kind?: number;
  isMine: boolean;
}

export function QuotedEvent({ eventId, relays, bech32, kind, isMine }: QuotedEventProps) {
  const { data: event, isLoading } = useEvent(eventId, relays);

  if (isLoading) return <QuotedEventSkeleton isMine={isMine} />;
  if (!event) {
    // Extract metadata from nevent encoding if available
    let author: string | undefined;
    let decodedKind = kind;
    if (bech32) {
      try {
        const decoded = nip19.decode(bech32);
        if (decoded.type === 'nevent') {
          author = decoded.data.author;
          decodedKind = decoded.data.kind ?? kind;
        }
      } catch { /* ignore decode errors */ }
    }
    return <QuotedEventFallback eventId={eventId} bech32={bech32} kind={decodedKind} author={author} isMine={isMine} />;
  }

  const eventKind = event.kind ?? kind;
  const isStandardNote = eventKind === 1 || eventKind === undefined;
  const eventBech32 = bech32 ?? nip19.neventEncode({
    id: eventId,
    relays,
    author: event.pubkey,
    kind: event.kind,
  });

  const metaClass = isMine ? 'text-gray-950/60' : 'text-gray-500';
  const contentClass = isMine ? 'text-gray-950/80' : 'text-gray-300';

  return (
    <div className={cardClasses(isMine)}>
      <div className={`flex items-center gap-1.5 ${metaClass}`}>
        <DisplayName pubkey={event.pubkey} />
        <span>·</span>
        <span>{formatEventTime(event.created_at)}</span>
        {!isStandardNote && (
          <span className="ml-auto text-[10px]">{kindLabel(eventKind!)}</span>
        )}
      </div>
      {event.content && (
        <p className={`mt-1 line-clamp-3 ${contentClass}`}>{event.content}</p>
      )}
      {!isStandardNote && (
        <HandlerLinks kind={eventKind!} bech32={eventBech32} nip19Type="nevent" isMine={isMine} />
      )}
    </div>
  );
}
