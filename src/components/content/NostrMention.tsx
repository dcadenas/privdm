import { useState, useRef } from 'react';
import { DisplayName, ProfilePopover } from '@/components/profile';

export function NostrMention({ pubkey, isMine }: { pubkey: string; isMine: boolean }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const colorClass = isMine
    ? 'text-gray-950/80 hover:underline'
    : 'text-amber-400 hover:underline';

  return (
    <>
      <span
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        className={`cursor-pointer font-medium ${colorClass}`}
      >
        @<DisplayName pubkey={pubkey} />
      </span>
      {open && (
        <ProfilePopover
          pubkey={pubkey}
          anchorRef={anchorRef}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
