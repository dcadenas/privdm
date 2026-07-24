import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { QueryClient } from '@tanstack/react-query';
import { NsecSigner } from 'divine-signer';
import { createGiftWraps } from '../../nip17/giftwrap';
import { GiftWrapSubscriptionManager, insertMessages } from '../subscription-manager';
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
    vi.useRealTimers();
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
      close: vi.fn(),
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
      close: vi.fn(),
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
      close: vi.fn(),
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
      close: vi.fn(),
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
      close: vi.fn(),
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
      close: vi.fn(),
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
      close: vi.fn(),
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

  it('restart() replays the three-day window so later wraps with older timestamps are recovered', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const threeDays = 3 * 24 * 60 * 60;
    const twoDays = 2 * 24 * 60 * 60;

    const { wraps: recentWraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'newer outer timestamp',
    );
    const { wraps: olderWraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'later published with older outer timestamp',
    );
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const recentWrap = { ...recentWraps[0]!, created_at: currentTimestamp };
    const olderWrap = { ...olderWraps[0]!, created_at: currentTimestamp - twoDays };

    const subscriptions: Array<{
      filter: { since?: number };
      onevent: (event: typeof recentWrap) => void;
    }> = [];
    const mockPool = {
      close: vi.fn(),
      subscribeMany: vi.fn((
        _relays: string[],
        filter: { since?: number },
        opts: { onevent: (event: typeof recentWrap) => void },
      ) => {
        subscriptions.push({ filter, onevent: opts.onevent });
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      since: currentTimestamp - threeDays,
    });

    subscriptions[0]!.onevent(recentWrap);
    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs).toHaveLength(1);
    });

    const earliestExpectedSince = Math.floor(Date.now() / 1000) - threeDays;
    manager.restart();
    const latestExpectedSince = Math.floor(Date.now() / 1000) - threeDays;

    expect(subscriptions[1]!.filter.since).toBeGreaterThanOrEqual(earliestExpectedSince);
    expect(subscriptions[1]!.filter.since).toBeLessThanOrEqual(latestExpectedSince);

    if (olderWrap.created_at >= subscriptions[1]!.filter.since!) {
      subscriptions[1]!.onevent(olderWrap);
    }

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

  it('ignores a delayed close from the subscription replaced by restart', async () => {
    vi.useFakeTimers();

    let subscriptionIndex = 0;
    const mockPool = {
      close: vi.fn(),
      subscribeMany: vi.fn((
        _relays: string[],
        _filters: unknown,
        opts: { onclose: (results: { url: string; reason: string }[]) => void },
      ) => {
        const index = subscriptionIndex++;
        return {
          close: vi.fn(() => {
            if (index === 0) {
              void Promise.resolve().then(() => {
                opts.onclose([{ url: 'wss://r', reason: 'closed by caller' }]);
              });
            }
          }),
        };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: 'pub',
      dmRelays: ['wss://r'],
      signer: {} as never,
      queryClient,
    });
    manager.restart();

    await Promise.resolve();
    vi.advanceTimersByTime(5_000);

    expect(mockPool.subscribeMany).toHaveBeenCalledTimes(2);
  });

  it('silently skips events that fail to decrypt', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const charlie = makeSigner();
    const decryptSpy = vi.spyOn(charlie.signer, 'nip44Decrypt');

    // Wrap for bob, but try to decrypt with charlie's signer
    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'hello bob',
    );

    let onEvent: ((event: (typeof wraps)[0]) => void) | undefined;
    const mockPool = {
      close: vi.fn(),
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

    await vi.waitFor(() => expect(decryptSpy).toHaveBeenCalled());

    // Give a tick for any pending cache writes (there should be none)
    await new Promise((r) => setTimeout(r, 50));

    expect(manager.processedCount).toBe(0);

    // No conversations should be created since decryption fails
    const conversations = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
    expect(conversations).toBeUndefined();
  });

  it('retries the same wrap after a transient decryption failure', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const originalDecrypt = bob.signer.nip44Decrypt.bind(bob.signer);
    const decryptSpy = vi.spyOn(bob.signer, 'nip44Decrypt')
      .mockRejectedValueOnce(new Error('signer bridge unavailable'))
      .mockImplementation(originalDecrypt);

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'retry decrypt',
    );
    const bobWrap = wraps[0]!;

    let onEvent: ((event: typeof bobWrap) => void) | undefined;
    const mockPool = {
      close: vi.fn(),
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

    onEvent!(bobWrap);
    onEvent!(bobWrap);

    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs?.[0]?.lastMessage.content).toBe('retry decrypt');
    });

    expect(decryptSpy).toHaveBeenCalledTimes(3);
    expect(manager.processedCount).toBe(1);
  });

  it('passes since filter to subscribeMany when provided', () => {
    const mockPool = {
      close: vi.fn(),
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
      close: vi.fn(),
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
      close: vi.fn(),
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
      close: vi.fn(),
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
      close: vi.fn(),
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

  it('retries the same wrap after a transient storage failure', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const store = makeMockStore();
    (store.saveMessage as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('IndexedDB unavailable'))
      .mockResolvedValue(true);

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'retry storage',
    );
    const bobWrap = wraps[0]!;

    let onEvent: ((event: typeof bobWrap) => void) | undefined;
    const mockPool = {
      close: vi.fn(),
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
    onEvent!(bobWrap);

    await vi.waitFor(() => {
      const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
      expect(convs?.[0]?.lastMessage.content).toBe('retry storage');
    });

    expect(store.saveMessage).toHaveBeenCalledTimes(2);
    expect(manager.processedCount).toBe(1);
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
      close: vi.fn(),
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
    onEvent!(bobWrap);

    await vi.waitFor(() => expect(manager.processedCount).toBe(1));
    await new Promise((r) => setTimeout(r, 50));

    expect(store.saveMessage).toHaveBeenCalledTimes(1);

    // Cache should NOT be updated since store said duplicate
    const conversations = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
    expect(conversations).toBeUndefined();
  });

  it('does not reconnect a quiet subscription', () => {
    vi.useFakeTimers();

    const mockPool = {
      close: vi.fn(),
      subscribeMany: vi.fn(() => {
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: 'pub',
      dmRelays: ['wss://r'],
      signer: {} as never,
      queryClient,
    });

    expect(mockPool.subscribeMany).toHaveBeenCalledTimes(1);

    // A quiet inbox is healthy. nostr-tools owns transport-level ping/reconnect.
    vi.advanceTimersByTime(10 * 60_000);

    expect(mockPool.subscribeMany).toHaveBeenCalledTimes(1);
  });

  it('retries indefinitely on close (no max attempts cap)', () => {
    vi.useFakeTimers();

    let onClose: ((results: { url: string; reason: string }[]) => void) | undefined;
    const mockPool = {
      close: vi.fn(),
      subscribeMany: vi.fn((
        _relays: string[],
        _filters: unknown,
        opts: { onclose: (results: { url: string; reason: string }[]) => void },
      ) => {
        onClose = opts.onclose;
        return { close: vi.fn() };
      }),
    };

    manager.start({
      pool: mockPool as never,
      userPubkey: 'pub',
      dmRelays: ['wss://r'],
      signer: {} as never,
      queryClient,
    });

    // Simulate 15 consecutive closes (previously would have stopped at 10)
    for (let i = 0; i < 15; i++) {
      onClose!([{ url: 'wss://r', reason: 'relay connection closed' }]);
      vi.advanceTimersByTime(60_000); // advance past max backoff
    }

    // Should have resubscribed 15 + 1 (initial) = 16 times
    expect(mockPool.subscribeMany).toHaveBeenCalledTimes(16);

    vi.useRealTimers();
  });

  it('insertMessages batch inserts multiple messages in one update', () => {
    const convId = 'aaa+bbb';
    const msg1: DecryptedMessage = {
      id: 'r1', conversationId: convId, senderPubkey: 'aaa',
      content: 'first', createdAt: 100, rumor: {} as never, wrapId: 'w1',
    };
    const msg2: DecryptedMessage = {
      id: 'r2', conversationId: convId, senderPubkey: 'bbb',
      content: 'second', createdAt: 200, rumor: {} as never, wrapId: 'w2',
    };

    // Track how many times setQueryData is called
    const spy = vi.spyOn(queryClient, 'setQueryData');
    insertMessages(queryClient, [msg1, msg2]);

    // Should call setQueryData for messages once per conversation (not once per message)
    // and once for conversations list
    const messageCalls = spy.mock.calls.filter(([key]) =>
      Array.isArray(key) && key[0] === 'messages'
    );
    expect(messageCalls).toHaveLength(1);

    const msgs = queryClient.getQueryData<DecryptedMessage[]>(QUERY_KEYS.messages(convId));
    expect(msgs).toHaveLength(2);

    spy.mockRestore();
  });
});
