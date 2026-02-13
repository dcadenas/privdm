import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { QueryClient } from '@tanstack/react-query';
import { NsecSigner } from '../../signer/nsec-signer';
import { createGiftWraps } from '../../nip17/giftwrap';
import { GiftWrapSubscriptionManager } from '../subscription-manager';
import { QUERY_KEYS } from '../query-keys';
import type { DecryptedMessage, Conversation } from '../types';
import type { MessageStore } from '../../storage/message-store';

function makeSigner() {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);
  const pubkey = getPublicKey(sk);
  return { signer: new NsecSigner(nsec), pubkey };
}

function makeMockStore(): MessageStore {
  return {
    saveMessage: vi.fn().mockResolvedValue(true),
    loadConversations: vi.fn().mockResolvedValue([]),
    loadMessages: vi.fn().mockResolvedValue([]),
    getWrapIds: vi.fn().mockResolvedValue(new Set()),
    getSinceTimestamp: vi.fn().mockResolvedValue(undefined),
    getBackfillStatus: vi.fn().mockResolvedValue({ complete: false, completedAt: null }),
    setBackfillComplete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  };
}

describe('GiftWrapSubscriptionManager', () => {
  let manager: GiftWrapSubscriptionManager;
  let queryClient: QueryClient;

  beforeEach(() => {
    manager = new GiftWrapSubscriptionManager();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    manager.stop();
  });

  it('unwraps a gift wrap and inserts into query cache', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'hello bob',
    );
    const bobWrap = wraps[0]!;

    // Mock pool that captures the onevent callback and calls it
    let onEvent: ((event: typeof bobWrap) => void) | undefined;
    const mockPool = {
      subscribeMany: vi.fn((_relays, _filters, opts) => {
        onEvent = opts.onevent;
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
    });

    expect(mockPool.subscribeMany).toHaveBeenCalledWith(
      ['wss://test.relay'],
      { kinds: [1059], '#p': [bob.pubkey] },
      expect.objectContaining({ onevent: expect.any(Function) }),
    );

    // Feed the gift wrap event
    onEvent!(bobWrap);

    // Wait for async unwrap + cache write
    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs).toHaveLength(1);
    });

    const conversations = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations)!;
    expect(conversations).toHaveLength(1);
    expect(conversations![0]!.lastMessage.content).toBe('hello bob');
    expect(conversations![0]!.participants).toContain(alice.pubkey);
    expect(conversations![0]!.participants).toContain(bob.pubkey);

    // Check messages cache using the conversation id
    const convId = conversations![0]!.id;
    const msgs = queryClient.getQueryData<DecryptedMessage[]>(QUERY_KEYS.messages(convId));
    expect(msgs).toHaveLength(1);
    expect(msgs![0]!.content).toBe('hello bob');
    expect(msgs![0]!.senderPubkey).toBe(alice.pubkey);
  });

  it('deduplicates events by wrap ID', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'hello',
    );
    const bobWrap = wraps[0]!;

    let onEvent: ((event: typeof bobWrap) => void) | undefined;
    const mockPool = {
      subscribeMany: vi.fn((_relays, _filters, opts) => {
        onEvent = opts.onevent;
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
    });

    // Feed the same event twice
    onEvent!(bobWrap);
    onEvent!(bobWrap);

    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs).toHaveLength(1);
    });

    const conversations = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations)!;
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.messageCount).toBe(1);
  });

  it('handles multiple messages in same conversation', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps: wraps1 } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'first',
    );
    const { wraps: wraps2 } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'second',
    );

    let onEvent: ((event: (typeof wraps1)[0]) => void) | undefined;
    const mockPool = {
      subscribeMany: vi.fn((_relays, _filters, opts) => {
        onEvent = opts.onevent;
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
    });

    onEvent!(wraps1[0]!);
    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs).toHaveLength(1);
    });

    onEvent!(wraps2[0]!);
    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs?.[0]?.messageCount).toBe(2);
    });

    const conversations = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations)!;
    const convId = conversations[0]!.id;
    const msgs = queryClient.getQueryData<DecryptedMessage[]>(QUERY_KEYS.messages(convId));
    expect(msgs).toHaveLength(2);
  });

  it('stop() closes the subscription', () => {
    const closeFn = vi.fn();
    const mockPool = {
      subscribeMany: vi.fn(() => ({ close: closeFn })),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: 'pub',
      dmRelays: ['wss://r'],
      signer: {} as never,
      queryClient,
    });
    manager.stop();

    expect(closeFn).toHaveBeenCalled();
    expect(manager.processedCount).toBe(0);
  });

  it('isRunning() returns false before start', () => {
    expect(manager.isRunning()).toBe(false);
  });

  it('isRunning() returns true after start', () => {
    const mockPool = {
      subscribeMany: vi.fn(() => ({ close: vi.fn() })),
    };
    manager.start({
      pool: mockPool as never,
      userPubkey: 'pub',
      dmRelays: ['wss://r'],
      signer: {} as never,
      queryClient,
    });
    expect(manager.isRunning()).toBe(true);
  });

  it('isRunning() returns false after stop', () => {
    const mockPool = {
      subscribeMany: vi.fn(() => ({ close: vi.fn() })),
    };
    manager.start({
      pool: mockPool as never,
      userPubkey: 'pub',
      dmRelays: ['wss://r'],
      signer: {} as never,
      queryClient,
    });
    manager.stop();
    expect(manager.isRunning()).toBe(false);
  });

  it('restart() stops and re-starts with stored params', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const closeFn = vi.fn();
    let onEvent: ((event: unknown) => void) | undefined;
    const mockPool = {
      subscribeMany: vi.fn((_relays: string[], _filters: unknown, opts: { onevent: (event: unknown) => void }) => {
        onEvent = opts.onevent;
        return { close: closeFn };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
    });
    expect(mockPool.subscribeMany).toHaveBeenCalledTimes(1);

    // Feed a message before restart
    const { wraps } = await createGiftWraps(alice.signer, [{ pubkey: bob.pubkey }], 'before restart');
    onEvent!(wraps[0]!);
    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs).toHaveLength(1);
    });

    // Restart — should close old sub and open new one
    manager.restart();
    expect(closeFn).toHaveBeenCalled();
    expect(mockPool.subscribeMany).toHaveBeenCalledTimes(2); // initial start + restart's start

    // Feed a message after restart — should still work
    const { wraps: wraps2 } = await createGiftWraps(alice.signer, [{ pubkey: bob.pubkey }], 'after restart');
    onEvent!(wraps2[0]!);
    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs?.[0]?.messageCount).toBe(2);
    });
  });

  it('restart() is a no-op if never started', () => {
    // Should not throw
    manager.restart();
    expect(manager.isRunning()).toBe(false);
  });

  it('silently skips events that fail to decrypt', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const charlie = makeSigner();

    // Wrap for bob, but try to decrypt with charlie's signer
    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'hello bob',
    );

    let onEvent: ((event: (typeof wraps)[0]) => void) | undefined;
    const mockPool = {
      subscribeMany: vi.fn((_relays, _filters, opts) => {
        onEvent = opts.onevent;
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: charlie.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: charlie.signer,
      queryClient,
    });

    onEvent!(wraps[0]!);

    // Wait for async processing to complete (event is processed but decryption fails)
    await vi.waitFor(() => expect(manager.processedCount).toBe(1));

    // Give a tick for any pending cache writes (there should be none)
    await new Promise((r) => setTimeout(r, 50));

    // No conversations should be created since decryption fails
    const conversations = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
    expect(conversations).toBeUndefined();
  });

  it('passes since filter to subscribeMany when provided', () => {
    const mockPool = {
      subscribeMany: vi.fn(() => ({ close: vi.fn() })),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: 'pub',
      dmRelays: ['wss://r'],
      signer: {} as never,
      queryClient,
      since: 1_700_000_000,
    });

    expect(mockPool.subscribeMany).toHaveBeenCalledWith(
      ['wss://r'],
      { kinds: [1059], '#p': ['pub'], since: 1_700_000_000 },
      expect.any(Object),
    );
  });

  it('omits since filter when not provided', () => {
    const mockPool = {
      subscribeMany: vi.fn(() => ({ close: vi.fn() })),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: 'pub',
      dmRelays: ['wss://r'],
      signer: {} as never,
      queryClient,
    });

    expect(mockPool.subscribeMany).toHaveBeenCalledWith(
      ['wss://r'],
      { kinds: [1059], '#p': ['pub'] },
      expect.any(Object),
    );
  });

  it('seedProcessedWrapIds prevents re-processing seeded IDs', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'hello',
    );
    const bobWrap = wraps[0]!;

    // Seed the wrap ID before starting
    manager.seedProcessedWrapIds(new Set([bobWrap.id]));

    let onEvent: ((event: typeof bobWrap) => void) | undefined;
    const mockPool = {
      subscribeMany: vi.fn((_relays, _filters, opts) => {
        onEvent = opts.onevent;
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
    });

    // Feed the seeded event — should be skipped
    onEvent!(bobWrap);

    await vi.waitFor(() => expect(manager.processedCount).toBeGreaterThanOrEqual(1));
    await new Promise((r) => setTimeout(r, 50));

    // No conversations should be created
    const conversations = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
    expect(conversations).toBeUndefined();
  });

  it('start() preserves processedWrapIds across restarts', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'hello',
    );
    const bobWrap = wraps[0]!;

    let onEvent: ((event: typeof bobWrap) => void) | undefined;
    const mockPool = {
      subscribeMany: vi.fn((_relays, _filters, opts) => {
        onEvent = opts.onevent;
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
    });

    // Process once
    onEvent!(bobWrap);
    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs).toHaveLength(1);
    });

    // Restart (start again preserves processedWrapIds)
    manager.restart();

    // Feed same event again — should be skipped
    onEvent!(bobWrap);
    await new Promise((r) => setTimeout(r, 50));

    const conversations = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations)!;
    expect(conversations[0]!.messageCount).toBe(1);
  });

  it('writes to store when provided', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const store = makeMockStore();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'stored message',
    );
    const bobWrap = wraps[0]!;

    let onEvent: ((event: typeof bobWrap) => void) | undefined;
    const mockPool = {
      subscribeMany: vi.fn((_relays, _filters, opts) => {
        onEvent = opts.onevent;
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store,
    });

    onEvent!(bobWrap);

    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs).toHaveLength(1);
    });

    expect(store.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'stored message' }),
      bobWrap.created_at,
    );
  });

  it('skips cache update when store reports duplicate', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const store = makeMockStore();
    (store.saveMessage as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'duplicate',
    );
    const bobWrap = wraps[0]!;

    let onEvent: ((event: typeof bobWrap) => void) | undefined;
    const mockPool = {
      subscribeMany: vi.fn((_relays, _filters, opts) => {
        onEvent = opts.onevent;
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store,
    });

    onEvent!(bobWrap);

    await vi.waitFor(() => expect(manager.processedCount).toBe(1));
    await new Promise((r) => setTimeout(r, 50));

    // Cache should NOT be updated since store said duplicate
    const conversations = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
    expect(conversations).toBeUndefined();
  });
});
