import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useProfile } from '@/hooks/use-profile';
import { resolveIdentity, toNpub } from '@/lib/nostr-identity';

export function ProfilePopover({
  pubkey,
  anchorRef,
  onClose,
}: {
  pubkey: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const { data: profile } = useProfile(pubkey);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const identity = resolveIdentity(profile ?? null, pubkey);
  const npub = toNpub(pubkey);

  useEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 8,
      left: Math.max(8, rect.left),
    });
  }, [anchorRef]);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    },
    [onClose, anchorRef],
  );

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [handleClickOutside, handleEscape]);

  async function handleCopy() {
    await navigator.clipboard.writeText(npub);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      data-testid="profile-popover"
      className="fixed z-50 w-72 rounded-xl border border-gray-800/60 bg-gray-900 p-4 shadow-2xl animate-fade-in"
      style={{ top: position.top, left: position.left }}
    >
      {/* Picture + name */}
      <div className="flex items-center gap-3">
        {profile?.picture ? (
          <img
            src={profile.picture}
            alt=""
            className="h-14 w-14 rounded-full object-cover ring-1 ring-gray-800"
          />
        ) : (
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-lg font-medium text-white/80"
            style={{ backgroundColor: `hsl(${parseInt(pubkey.slice(0, 6), 16) % 360}, 40%, 25%)` }}
          >
            {pubkey.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium text-gray-100 ${identity.primaryIsMono ? 'font-mono text-xs' : ''}`}>
            {identity.primary}
          </p>
          {profile?.nip05 && (
            <p className="flex items-center gap-1 truncate text-xs text-amber-400/80">
              <svg className="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="truncate">{profile.nip05}</span>
            </p>
          )}
        </div>
      </div>

      {/* About */}
      {profile?.about && (
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-gray-400" data-testid="profile-about">
          {profile.about}
        </p>
      )}

      {/* Npub with copy button */}
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 truncate rounded-lg bg-gray-800/60 px-2.5 py-1.5 font-mono text-[10px] text-gray-400">
          {npub}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded-lg bg-gray-800/60 px-2.5 py-1.5 text-[10px] text-gray-400
                     transition-colors hover:bg-gray-700/60 hover:text-gray-200"
          data-testid="copy-npub-button"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
