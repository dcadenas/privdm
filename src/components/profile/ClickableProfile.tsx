import { useState, useRef } from 'react';
import { ProfilePic } from './ProfilePic';
import { DisplayName } from './DisplayName';
import { ProfilePopover } from './ProfilePopover';

export function ClickableProfile({
  pubkey,
  picSize = 'sm',
  showSecondary = false,
}: {
  pubkey: string;
  picSize?: 'sm' | 'md' | 'lg';
  showSecondary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-2.5"
        data-testid="clickable-profile"
      >
        <ProfilePic pubkey={pubkey} size={picSize} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-200">
            <DisplayName pubkey={pubkey} showSecondary={showSecondary} />
          </p>
        </div>
      </div>
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
