import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useReadState } from '../use-read-state';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import type { Conversation, DecryptedMessage } from '@/lib/relay/types';
import type { Rumor } from '@/lib/nip17/types';
import type { ReactNode } from 'react';

// Mock auth context
vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ pubkey: 'me' }),
}));

// Mock Dexie store (we only test cache behavior here)
vi.mock('@/lib/storage/singleton', () => ({
  readStateStore: { markRead: vi.fn().mockResolvedValue(undefined) },
}));

function makeConversation(opts: { id: string; lastMessage?: Partial<DecryptedMessage> }): Conversation {
  const { id } = opts;
  const lastMessage: DecryptedMessage = {
    id: 'msg-1',
    conversationId: id,
    senderPubkey: opts.lastMessage?.senderPubkey ?? 'other',
    content: 'hi',
    createdAt: opts.lastMessage?.createdAt ?? 2000,
    rumor: { id: 'msg-1', pubkey: 'other', created_at: 2000, kind: 14, tags: [], content: 'hi' } as Rumor,
    wrapId: 'w1',
  };

  return {
    id,
    participants: id.split('+'),
    lastMessage,
    messageCount: 1,
  };
}

function setup(queryClient: QueryClient) {
  // Pre-seed cache so queries start in 'success' state (avoids queryFn race)
  if (!queryClient.getQueryData(QUERY_KEYS.readState)) {
    queryClient.setQueryData(QUERY_KEYS.readState, {});
  }
  if (!queryClient.getQueryData(QUERY_KEYS.conversations)) {
    queryClient.setQueryData(QUERY_KEYS.conversations, []);
  }

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(() => useReadState(), { wrapper });
}

describe('useReadState', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('returns empty readState initially', () => {
    const { result } = setup(queryClient);
    expect(result.current.readState).toEqual({});
  });

  it('isUnread returns true when lastMessage is newer than lastReadAt', () => {
    const { result } = setup(queryClient);

    const conv = makeConversation({
      id: 'me+other',
      lastMessage: { createdAt: 2000, senderPubkey: 'other' },
    });

    expect(result.current.isUnread(conv)).toBe(true);
  });

  it('isUnread returns false when lastMessage sender is me', () => {
    const { result } = setup(queryClient);

    const conv = makeConversation({
      id: 'me+other',
      lastMessage: { createdAt: 2000, senderPubkey: 'me' },
    });

    expect(result.current.isUnread(conv)).toBe(false);
  });

  it('isUnread returns false after markRead', async () => {
    const { result } = setup(queryClient);

    const conv = makeConversation({
      id: 'me+other',
      lastMessage: { createdAt: 2000, senderPubkey: 'other' },
    });

    expect(result.current.isUnread(conv)).toBe(true);

    act(() => {
      result.current.markRead('me+other', 2000);
    });

    await waitFor(() => {
      expect(result.current.isUnread(conv)).toBe(false);
    });
  });

  it('markRead is monotonic — ignores older timestamps', async () => {
    const { result } = setup(queryClient);

    act(() => {
      result.current.markRead('me+other', 3000);
    });

    await waitFor(() => {
      expect(result.current.readState['me+other']).toBe(3000);
    });

    act(() => {
      result.current.markRead('me+other', 1000);
    });

    // Should still be 3000
    await waitFor(() => {
      expect(result.current.readState['me+other']).toBe(3000);
    });
  });

  it('computes unreadCount from conversations in cache', async () => {
    // Seed conversations cache before rendering
    queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
      makeConversation({ id: 'me+alice', lastMessage: { createdAt: 1000, senderPubkey: 'alice' } }),
      makeConversation({ id: 'me+bob', lastMessage: { createdAt: 2000, senderPubkey: 'bob' } }),
      makeConversation({ id: 'me+carol', lastMessage: { createdAt: 3000, senderPubkey: 'me' } }),
    ]);

    const { result } = setup(queryClient);

    // alice + bob are unread, carol is sent by me so not unread
    expect(result.current.unreadCount).toBe(2);

    // Mark alice as read
    act(() => {
      result.current.markRead('me+alice', 1000);
    });

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(1);
    });
  });
});
