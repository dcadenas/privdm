import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/render-with-providers';
import { EditProfileDialog } from '../EditProfileDialog';
import type { NostrProfile } from '@/hooks/use-profile';

// Mock useProfile
const mockProfile: { current: NostrProfile | null } = { current: null };
vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({ data: mockProfile.current }),
  parseProfile: vi.fn((raw: Record<string, unknown>) => raw),
}));

// Mock useAuth
const mockPubkey = 'a'.repeat(64);
vi.mock('@/context/auth-context', async () => {
  const actual = await vi.importActual('@/context/auth-context');
  return {
    ...actual,
    useAuth: () => ({ pubkey: mockPubkey, signer: {} }),
  };
});

// Mock usePublishProfile
const mockMutate = vi.fn();
const mockMutationState = { current: { isPending: false } };
vi.mock('@/hooks/use-publish-profile', () => ({
  usePublishProfile: () => ({
    mutateAsync: mockMutate,
    isPending: mockMutationState.current.isPending,
  }),
}));

function renderDialog(profile: NostrProfile | null = null) {
  mockProfile.current = profile;
  const onClose = vi.fn();
  renderWithProviders(<EditProfileDialog onClose={onClose} />);
  return { onClose };
}

beforeEach(() => {
  mockProfile.current = null;
  mockMutate.mockReset();
  mockMutationState.current.isPending = false;
});

describe('EditProfileDialog', () => {
  it('renders with all form fields', () => {
    renderDialog();
    expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('About')).toBeInTheDocument();
    expect(screen.getByLabelText('Picture URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Banner URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Website')).toBeInTheDocument();
    expect(screen.getByLabelText('NIP-05')).toBeInTheDocument();
  });

  it('populates fields from existing profile', () => {
    renderDialog({
      displayName: 'Alice W',
      name: 'alice',
      about: 'A nostrich',
      picture: 'https://example.com/pic.jpg',
      banner: 'https://example.com/banner.jpg',
      website: 'https://example.com',
      nip05: 'alice@example.com',
    });

    expect(screen.getByLabelText('Display Name')).toHaveValue('Alice W');
    expect(screen.getByLabelText('Username')).toHaveValue('alice');
    expect(screen.getByLabelText('About')).toHaveValue('A nostrich');
    expect(screen.getByLabelText('Picture URL')).toHaveValue('https://example.com/pic.jpg');
    expect(screen.getByLabelText('Banner URL')).toHaveValue('https://example.com/banner.jpg');
    expect(screen.getByLabelText('Website')).toHaveValue('https://example.com');
    expect(screen.getByLabelText('NIP-05')).toHaveValue('alice@example.com');
  });

  it('calls mutateAsync with updated fields on save', async () => {
    mockMutate.mockResolvedValue(undefined);
    const { onClose } = renderDialog({ name: 'alice' });

    fireEvent.change(screen.getByLabelText('Display Name'), {
      target: { value: 'Alice Updated' },
    });

    fireEvent.click(screen.getByTestId('save-profile-button'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        displayName: 'Alice Updated',
        name: 'alice',
        about: '',
        picture: '',
        banner: '',
        website: '',
        nip05: '',
      });
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('closes on cancel without saving', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('closes on backdrop click', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByTestId('edit-profile-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows picture preview when URL is provided', () => {
    renderDialog({ picture: 'https://example.com/pic.jpg' });
    const img = screen.getByTestId('picture-preview') as HTMLImageElement;
    expect(img.src).toBe('https://example.com/pic.jpg');
  });
});
