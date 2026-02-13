import { useAuth } from '@/context/auth-context';
import { useHandlers } from '@/hooks/use-handlers';
import { useContacts } from '@/hooks/use-contacts';
import { resolveHandlers, njumpFallbackUrl } from '@/lib/nip89/handlers';

interface HandlerLinksProps {
  kind: number;
  bech32: string;
  nip19Type: string;
  isMine?: boolean;
}

export function HandlerLinks({ kind, bech32, nip19Type, isMine }: HandlerLinksProps) {
  const { pubkey } = useAuth();
  const { data: handlers } = useHandlers(kind);
  const { data: contacts } = useContacts(pubkey);

  const resolved = resolveHandlers(
    handlers ?? [],
    bech32,
    nip19Type,
    contacts ?? new Set<string>(),
  );

  const links = resolved.slice(0, 3);
  const labelClass = isMine ? 'text-gray-950/50' : 'text-gray-500';
  const linkClass = isMine
    ? 'text-gray-950/70 hover:text-gray-950/90'
    : 'text-amber-400/70 hover:text-amber-400';

  return (
    <div className={`mt-1.5 flex items-center gap-1 text-[10px] ${labelClass}`}>
      <span>Open in:</span>
      {links.map((r, i) => (
        <span key={r.handler.pubkey + r.handler.dTag}>
          {i > 0 && <span className="mx-0.5">·</span>}
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {r.handler.name || 'app'}
          </a>
        </span>
      ))}
      {links.length > 0 && <span className="mx-0.5">·</span>}
      <a
        href={njumpFallbackUrl(bech32)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        njump
      </a>
    </div>
  );
}
