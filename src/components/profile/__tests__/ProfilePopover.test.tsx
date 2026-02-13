import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/render-with-providers';
import { ProfilePopover } from '../ProfilePopover';
import type { NostrProfile } from '@/hooks/use-profile';

// Mock useProfile
const mockProfile: { current: NostrProfile | null } = { current: null };
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ data: mockProfile.current }),
}));

// Fixed test pubkey (64 hex chars)
const pubkey = 'a'.repeat(64);

function renderPopover(profile: NostrProfile | null = null) {
  mockProfile.current = profile;

  // Create a real anchor element in the DOM
  const anchor = document.createElement('div');
  anchor.getBoundingClientRect = () => ({
    top: 50,
    bottom: 60,
    left: 100,
    right: 200,
    width: 100,
    height: 10,
    x: 100,
    y: 50,
    toJSON: () => {},
  });
  document.body.appendChild(anchor);

  const ref = { current: anchor } as React.RefObject<HTMLElement>;

  const onClose = vi.fn();
  renderWithProviders(
    <ProfilePopover pubkey={pubkey} anchorRef={ref} onClose={onClose} />,
  );

  return { onClose, anchor };
}

beforeEach(() => {
  mockProfile.current = null;
});

describe('ProfilePopover', () => {
  it('renders when open', () => {
    renderPopover();
    expect(screen.getByTestId('profile-popover')).toBeInTheDocument();
  });

  it('displays nip05 with checkmark when available', () => {
    renderPopover({ displayName: 'Alice', nip05: 'alice@example.com' });
    // nip05 appears in the checkmark badge area (amber-colored text)
    const nip05Elements = screen.getAllByText('alice@example.com');
    expect(nip05Elements.length).toBeGreaterThanOrEqual(1);
  });

  it('displays about text when available', () => {
    renderPopover({ about: 'A nostr user who loves decentralization' });
    expect(screen.getByTestId('profile-about')).toHaveTextContent(
      'A nostr user who loves decentralization',
    );
  });

  it('closes on Escape key', () => {
    const { onClose } = renderPopover();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on click outside', () => {
    const { onClose } = renderPopover();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it('copies npub to clipboard on copy button click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderPopover();
    fireEvent.click(screen.getByTestId('copy-npub-button'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^npub1/));
    });
    expect(screen.getByTestId('copy-npub-button')).toHaveTextContent('Copied!');
  });
});
