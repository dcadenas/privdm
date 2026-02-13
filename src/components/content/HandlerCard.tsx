import { useAuth } from '@/context/auth-context';
import { useHandlers } from '@/hooks/use-handlers';
import { useContacts } from '@/hooks/use-contacts';
import { resolveHandlers, njumpFallbackUrl } from '@/lib/nip89/handlers';

interface HandlerCardProps {
  kind: number;
  bech32: string;
  nip19Type: string;
}

function HandlerSkeleton() {
  return (
    <div className="my-1 rounded-lg border border-gray-700/40 bg-gray-800/40 px-3 py-2 animate-pulse">
      <div className="h-3 w-32 rounded bg-gray-700/40" />
      <div className="mt-2 h-3 w-48 rounded bg-gray-700/40" />
    </div>
  );
}

export function HandlerCard({ kind, bech32, nip19Type }: HandlerCardProps) {
  const { pubkey } = useAuth();
  const { data: handlers, isLoading: loadingHandlers } = useHandlers(kind);
  const { data: contacts } = useContacts(pubkey);

  if (loadingHandlers) return <HandlerSkeleton />;

  const resolved = resolveHandlers(
    handlers ?? [],
    bech32,
    nip19Type,
    contacts ?? new Set<string>(),
  );

  return (
    <div className="my-1 rounded-lg border border-gray-700/40 bg-gray-800/40 px-3 py-2 text-xs">
      {resolved.length > 0 && (
        <div className="flex flex-col gap-1">
          {resolved.map((r) => (
            <a
              key={r.handler.pubkey + r.handler.dTag}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded px-1 py-0.5 text-gray-300 hover:bg-gray-700/40"
            >
              {r.handler.picture && (
                <img
                  src={r.handler.picture}
                  alt=""
                  className="h-4 w-4 rounded"
                />
              )}
              <span className="flex-1 truncate">
                {r.handler.name || 'Unknown app'}
              </span>
              {r.isFollowed && (
                <span className="text-[10px] text-amber-400/70">followed</span>
              )}
              <span className="text-gray-500">&rarr;</span>
            </a>
          ))}
        </div>
      )}
      <a
        href={njumpFallbackUrl(bech32)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 block text-gray-500 hover:text-gray-400"
      >
        njump.me &rarr;
      </a>
    </div>
  );
}
