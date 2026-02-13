import { useProfile } from '@/hooks/use-profile';
import { resolveIdentity } from '@/lib/nostr-identity';

export function DisplayName({
  pubkey,
  showSecondary = false,
}: {
  pubkey: string;
  showSecondary?: boolean;
}) {
  const { data: profile } = useProfile(pubkey);
  const identity = resolveIdentity(profile ?? null, pubkey);

  return (
    <span className="inline-flex flex-col">
      <span className={identity.primaryIsMono ? 'font-mono text-xs' : ''}>
        {identity.primary}
      </span>
      {showSecondary && identity.secondary && (
        <span
          className={`text-[10px] text-gray-500 ${identity.secondaryIsMono ? 'font-mono' : ''}`}
        >
          {identity.secondary}
        </span>
      )}
    </span>
  );
}
