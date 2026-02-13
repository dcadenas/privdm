import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/context/auth-context';
import { useProfile } from '@/hooks/use-profile';
import { resolveIdentity, toNpub } from '@/lib/nostr-identity';
import { ProfilePic } from '@/components/profile';
import { EditProfileDialog } from '@/components/EditProfileDialog';

export function AccountMenu() {
  const { pubkey, logout } = useAuth();
  const { data: profile } = useProfile(pubkey ?? '');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const identity = pubkey ? resolveIdentity(profile ?? null, pubkey) : null;
  const npub = pubkey ? toNpub(pubkey) : '';

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        close();
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, close]);

  async function handleCopy() {
    await navigator.clipboard.writeText(npub);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!pubkey) return null;

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 -mx-1
                   transition-colors hover:bg-gray-800/40"
        data-testid="account-menu-trigger"
      >
        <ProfilePic pubkey={pubkey} size="sm" />
        <div className="min-w-0">
          {identity && (
            <p className={`truncate text-sm font-medium text-gray-200 ${identity.primaryIsMono ? 'font-mono text-xs' : ''}`}>
              {identity.primary}
            </p>
          )}
          {identity?.secondary && (
            <p className="truncate text-[10px] text-gray-500 font-mono">
              {identity.secondary}
            </p>
          )}
        </div>
      </div>

      {open && anchorRef.current && createPortal(
        <AccountDropdown
          ref={menuRef}
          anchorRef={anchorRef}
          npub={npub}
          copied={copied}
          onCopy={handleCopy}
          onEditProfile={() => { close(); setShowEditProfile(true); }}
          onSignOut={() => { close(); logout(); }}
          onClose={close}
        />,
        document.body,
      )}

      {showEditProfile && (
        <EditProfileDialog onClose={() => setShowEditProfile(false)} />
      )}
    </>
  );
}

interface AccountDropdownProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  npub: string;
  copied: boolean;
  onCopy: () => void;
  onEditProfile: () => void;
  onSignOut: () => void;
  onClose: () => void;
}

import { forwardRef } from 'react';

const AccountDropdown = forwardRef<HTMLDivElement, AccountDropdownProps>(
  function AccountDropdown({ anchorRef, npub, copied, onCopy, onEditProfile, onSignOut }, ref) {
    const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 6,
        left: Math.max(8, rect.left),
      });
    }, [anchorRef]);

    if (!position) return null;

    return (
      <div
        ref={ref}
        role="menu"
        data-testid="account-menu"
        className="fixed z-50 w-64 rounded-xl border border-gray-800/60 bg-gray-900 p-1.5 shadow-2xl animate-fade-in"
        style={{ top: position.top, left: position.left }}
      >
        {/* Copy npub */}
        <button
          onClick={onCopy}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left
                     transition-colors hover:bg-gray-800/60"
          data-testid="copy-npub-button"
          role="menuitem"
        >
          <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-300">{copied ? 'Copied!' : 'Copy public key'}</p>
            <p className="truncate font-mono text-[10px] text-gray-600">{npub}</p>
          </div>
        </button>

        {/* Edit profile */}
        <button
          onClick={onEditProfile}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left
                     transition-colors hover:bg-gray-800/60"
          data-testid="edit-profile-button"
          role="menuitem"
        >
          <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          <p className="text-xs text-gray-300">Edit profile</p>
        </button>

        {/* Divider */}
        <div className="mx-2 my-1 border-t border-gray-800/50" />

        {/* Sign out */}
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left
                     transition-colors hover:bg-red-950/40"
          data-testid="account-sign-out"
          role="menuitem"
        >
          <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          <p className="text-xs text-gray-300">Sign out</p>
        </button>
      </div>
    );
  },
);
