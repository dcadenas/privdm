import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWebNotifications } from '../use-web-notifications';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import type { Conversation, DecryptedMessage } from '@/lib/relay/types';
import type { Rumor } from '@/lib/nip17/types';
import type { ReactNode } from 'react';

const MY_PUBKEY = 'mypubkey123456789abcdef';
const OTHER_PUBKEY = 'otherpubkey9876543210ab';

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ pubkey: MY_PUBKEY }),
}));

let mockNotificationInstances: Array<{
  title: string;
  options: NotificationOptions;
  onclick: (() => void) | null;
}>;

let mockPermission: NotificationPermission;
let mockRequestPermission: ReturnType<typeof vi.fn>;

function setupNotificationMock(permission: NotificationPermission = 'granted') {
  mockPermission = permission;
  mockNotificationInstances = [];
  mockRequestPermission = vi.fn().mockResolvedValue(permission);

  class MockNotification {
    title: string;
    options: NotificationOptions;
    onclick: (() => void) | null = null;

    constructor(title: string, options: NotificationOptions = {}) {
      this.title = title;
      this.options = options;
      mockNotificationInstances.push(this);
    }

    static get permission() {
      return mockPermission;
    }

    static requestPermission = mockRequestPermission;
  }

  vi.stubGlobal('Notification', MockNotification);
}

function makeMessage(overrides: Partial<DecryptedMessage> = {}): DecryptedMessage {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    senderPubkey: OTHER_PUBKEY,
    content: 'Hello there!',
    createdAt: 1000,
    rumor: { id: 'msg-1', pubkey: OTHER_PUBKEY, created_at: 1000, kind: 14, tags: [], content: 'Hello there!' } as Rumor,
    wrapId: 'w1',
    ...overrides,
  };
}

interface MakeConversationOpts {
  id?: string;
  lastMessage?: Partial<DecryptedMessage>;
}

function makeConversation(opts: MakeConversationOpts = {}): Conversation {
  const id = opts.id ?? 'conv-1';
  const lastMessage = makeMessage({ conversationId: id, ...opts.lastMessage });
  return {
    id,
    participants: [MY_PUBKEY, OTHER_PUBKEY],
    lastMessage,
    messageCount: 1,
  };
}

function setup(queryClient: QueryClient) {
  // Pre-seed empty conversations
  queryClient.setQueryData(QUERY_KEYS.conversations, []);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return renderHook(() => useWebNotifications(), { wrapper });
}

describe('useWebNotifications', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    setupNotificationMock('granted');
    // Default: tab is hidden
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests permission on mount when permission is default', () => {
    setupNotificationMock('default' as NotificationPermission);
    setup(queryClient);
    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('does not request permission when already granted', () => {
    setupNotificationMock('granted');
    setup(queryClient);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('does not request permission when already denied', () => {
    setupNotificationMock('denied');
    setup(queryClient);
    expect(mockRequestPermission).not.toHaveBeenCalled();
  });

  it('does not fire notification on initial hydration', () => {
    // Seed with existing conversations before mounting
    queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
      makeConversation(),
    ]);

    setup(queryClient);
    expect(mockNotificationInstances).toHaveLength(0);
  });

  it('fires notification when new message arrives while document is hidden', () => {
    setup(queryClient);

    // First update establishes baseline (hydration)
    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1' } }),
      ]);
    });
    expect(mockNotificationInstances).toHaveLength(0);

    // Second update with new message
    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-2', content: 'New message!' } }),
      ]);
    });

    expect(mockNotificationInstances).toHaveLength(1);
    expect(mockNotificationInstances[0]!.options.body).toBe('New message!');
  });

  it('does not fire when message is from self', () => {
    setup(queryClient);

    // Hydration
    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, []);
    });

    // New message from self
    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1', senderPubkey: MY_PUBKEY } }),
      ]);
    });

    expect(mockNotificationInstances).toHaveLength(0);
  });

  it('does not fire when document is visible', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    setup(queryClient);

    // Hydration
    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1' } }),
      ]);
    });

    // New message
    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-2' } }),
      ]);
    });

    expect(mockNotificationInstances).toHaveLength(0);
  });

  it('uses profile displayName as title when available', () => {
    queryClient.setQueryData(QUERY_KEYS.profile(OTHER_PUBKEY), {
      displayName: 'Alice',
      name: 'alice',
      picture: 'https://example.com/alice.jpg',
    });

    setup(queryClient);

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1' } }),
      ]);
    });

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-2' } }),
      ]);
    });

    expect(mockNotificationInstances).toHaveLength(1);
    expect(mockNotificationInstances[0]!.title).toBe('Alice');
  });

  it('uses profile name when displayName is not available', () => {
    queryClient.setQueryData(QUERY_KEYS.profile(OTHER_PUBKEY), {
      name: 'alice_handle',
    });

    setup(queryClient);

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1' } }),
      ]);
    });

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-2' } }),
      ]);
    });

    expect(mockNotificationInstances[0]!.title).toBe('alice_handle');
  });

  it('falls back to truncated pubkey when no profile', () => {
    setup(queryClient);

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1' } }),
      ]);
    });

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-2' } }),
      ]);
    });

    expect(mockNotificationInstances[0]!.title).toBe('otherpub...');
  });

  it('uses profile picture as icon', () => {
    queryClient.setQueryData(QUERY_KEYS.profile(OTHER_PUBKEY), {
      name: 'Alice',
      picture: 'https://example.com/alice.jpg',
    });

    setup(queryClient);

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1' } }),
      ]);
    });

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-2' } }),
      ]);
    });

    expect(mockNotificationInstances[0]!.options.icon).toBe('https://example.com/alice.jpg');
  });

  it('sets conversation ID as tag for dedup', () => {
    setup(queryClient);

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ id: 'conv-abc', lastMessage: { id: 'msg-1' } }),
      ]);
    });

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ id: 'conv-abc', lastMessage: { id: 'msg-2' } }),
      ]);
    });

    expect(mockNotificationInstances[0]!.options.tag).toBe('conv-abc');
  });

  it('calls window.focus() on notification click', () => {
    const focusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {});

    setup(queryClient);

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1' } }),
      ]);
    });

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-2' } }),
      ]);
    });

    expect(mockNotificationInstances).toHaveLength(1);
    mockNotificationInstances[0]!.onclick!();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('does not fire when permission is denied', () => {
    setupNotificationMock('denied');

    setup(queryClient);

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1' } }),
      ]);
    });

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-2' } }),
      ]);
    });

    expect(mockNotificationInstances).toHaveLength(0);
  });

  it('truncates long message body to 100 chars', () => {
    const longContent = 'A'.repeat(150);

    setup(queryClient);

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-1' } }),
      ]);
    });

    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ lastMessage: { id: 'msg-2', content: longContent } }),
      ]);
    });

    expect(mockNotificationInstances[0]!.options.body).toBe('A'.repeat(100) + '...');
  });

  it('handles multiple conversations with different states', () => {
    setup(queryClient);

    // Hydration with two conversations
    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ id: 'conv-1', lastMessage: { id: 'msg-1' } }),
        makeConversation({ id: 'conv-2', lastMessage: { id: 'msg-3' } }),
      ]);
    });

    // Only conv-1 gets a new message, conv-2 has new message from self
    act(() => {
      queryClient.setQueryData<Conversation[]>(QUERY_KEYS.conversations, [
        makeConversation({ id: 'conv-1', lastMessage: { id: 'msg-2' } }),
        makeConversation({ id: 'conv-2', lastMessage: { id: 'msg-4', senderPubkey: MY_PUBKEY } }),
      ]);
    });

    // Only one notification (conv-1), not for conv-2 (self-sent)
    expect(mockNotificationInstances).toHaveLength(1);
    expect(mockNotificationInstances[0]!.options.tag).toBe('conv-1');
  });
});
