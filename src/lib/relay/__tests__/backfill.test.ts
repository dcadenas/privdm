import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { Event } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { QueryClient } from '@tanstack/react-query';
import { NsecSigner } from '../../signer/nsec-signer';
import { createGiftWraps } from '../../nip17/giftwrap';
import { backfillGiftWraps, BACKFILL_RETRY_DELAYS } from '../backfill';
import { QUERY_KEYS } from '../query-keys';
import type { Conversation } from '../types';
import type { MessageStore } from '../../storage/message-store';

interface MockPoolOptions {
  /** Override close reasons per call. Return string[] to use as onclose reasons. */
  closeReasons?: (callIndex: number) => string[];
}

/**
 * Wraps a querySync-style mock fn into a subscribeMany-compatible mock pool.
 * The querySync fn is called with (_relays, filter) and should return Event[].
 */
function makeMockPool(querySyncFn: ReturnType<typeof vi.fn>, options?: MockPoolOptions) {
  const filterCalls: Record<string, unknown>[] = [];
  let callIndex = 0;
  return {
    subscribeMany: vi.fn().mockImplementation((_relays: string[], filter: unknown, params: {
      onevent: (e: Event) => void;
      oneose: () => void;
      onclose: (reasons: string[]) => void;
    }) => {
      const idx = callIndex++;
      filterCalls.push(filter as Record<string, unknown>);
      const reasons = options?.closeReasons?.(idx) ?? [];
      const sub = { close: () => { params.onclose(reasons); } };
      Promise.resolve(querySyncFn(_relays, filter)).then((events: Event[]) => {
        for (const event of events) {
          params.onevent(event);
        }
        params.oneose();
      });
      return sub;
    }),
    filterCalls,
  };
}

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

describe('backfillGiftWraps', () => {
  let queryClient: QueryClient;
  const origDelays = [...BACKFILL_RETRY_DELAYS];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Use fast delays for testing
    BACKFILL_RETRY_DELAYS.splice(0, BACKFILL_RETRY_DELAYS.length, 10, 10, 10);
  });

  afterEach(() => {
    BACKFILL_RETRY_DELAYS.splice(0, BACKFILL_RETRY_DELAYS.length, ...origDelays);
  });

  it('pages backward using until cursor', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps: page1Wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'message 1',
    );
    const { wraps: page2Wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'message 2',
    );

    page1Wraps[0]!.created_at = 2000;
    page2Wraps[0]!.created_at = 1000;

    let callCount = 0;
    const mockPool = makeMockPool(vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [page1Wraps[0]!];
      if (callCount === 2) return [page2Wraps[0]!];
      return [];
    }));

    const result = await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store: makeMockStore(),
      processedWrapIds: new Set(),
    });

    expect(result.complete).toBe(true);
    expect(result.eventsProcessed).toBe(2);

    // First call: no until
    expect(mockPool.filterCalls[0]).toEqual(
      expect.objectContaining({ kinds: [1059], limit: 100 }),
    );
    expect(mockPool.filterCalls[0]).not.toHaveProperty('until');

    // Second call: until = min(page1.created_at) - 1 = 1999
    expect(mockPool.filterCalls[1]).toEqual(
      expect.objectContaining({ until: 1999 }),
    );

    // Third call: until = min(page2.created_at) - 1 = 999
    expect(mockPool.filterCalls[2]).toEqual(
      expect.objectContaining({ until: 999 }),
    );
  });

  it('returns complete when relay returns empty page', async () => {
    const bob = makeSigner();

    const mockPool = makeMockPool(vi.fn().mockReturnValue([]));

    const result = await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store: makeMockStore(),
      processedWrapIds: new Set(),
    });

    expect(result.complete).toBe(true);
    expect(result.eventsProcessed).toBe(0);
  });

  it('skips events in processedWrapIds', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'already seen',
    );

    const processedWrapIds = new Set([wraps[0]!.id]);
    let callCount = 0;
    const mockPool = makeMockPool(vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [wraps[0]!];
      return [];
    }));

    const result = await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store: makeMockStore(),
      processedWrapIds,
    });

    expect(result.complete).toBe(true);
    expect(result.eventsProcessed).toBe(0);

    const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
    expect(convs).toBeUndefined();
  });

  it('deduplicates via store.saveMessage returning false', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'dup in store',
    );

    const store = makeMockStore();
    (store.saveMessage as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    let callCount = 0;
    const mockPool = makeMockPool(vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [wraps[0]!];
      return [];
    }));

    const result = await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store,
      processedWrapIds: new Set(),
    });

    expect(result.eventsProcessed).toBe(0);

    const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
    expect(convs).toBeUndefined();
  });

  it('stops on signal abort between pages', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'page 1',
    );

    const controller = new AbortController();

    const mockPool = makeMockPool(vi.fn().mockImplementation(() => {
      controller.abort();
      return [wraps[0]!];
    }));

    const result = await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store: makeMockStore(),
      processedWrapIds: new Set(),
      signal: controller.signal,
    });

    expect(result.complete).toBe(false);
    expect(mockPool.subscribeMany).toHaveBeenCalledTimes(1);
  });

  it('processes events sequentially within each page', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps: page1Wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'page 1 msg',
    );
    page1Wraps[0]!.created_at = 2000;

    const { wraps: page2Wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'page 2 msg',
    );
    page2Wraps[0]!.created_at = 1000;

    const callOrder: string[] = [];

    const store = makeMockStore();
    (store.saveMessage as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('save');
      return true;
    });

    const mockPool = makeMockPool(vi.fn().mockImplementation((_relays: string[], filter: { until?: number }) => {
      callOrder.push('fetch');
      if (filter.until === undefined) return [page1Wraps[0]!];
      if (filter.until === 1999) return [page2Wraps[0]!];
      return [];
    }));

    const result = await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store,
      processedWrapIds: new Set(),
    });

    expect(result.complete).toBe(true);
    expect(result.eventsProcessed).toBe(2);

    // Pipelined: fetch page → start next fetch + process concurrently
    // fetch p0 → fetch p1 (pipelined) + save p0 → fetch p2 (pipelined) + save p1
    expect(callOrder).toEqual(['fetch', 'fetch', 'save', 'fetch', 'save']);
  });

  it('silently skips undecryptable events', async () => {
    const alice = makeSigner();
    const bob = makeSigner();
    const charlie = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'secret',
    );

    let callCount = 0;
    const mockPool = makeMockPool(vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [wraps[0]!];
      return [];
    }));

    const store = makeMockStore();

    const result = await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: charlie.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: charlie.signer,
      queryClient,
      store,
      processedWrapIds: new Set(),
    });

    expect(result.complete).toBe(true);
    expect(result.eventsProcessed).toBe(0);
    expect(store.saveMessage).not.toHaveBeenCalled();
  });

  it('adds wrapIds to shared set', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'tracked',
    );

    const processedWrapIds = new Set<string>();
    let callCount = 0;
    const mockPool = makeMockPool(vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [wraps[0]!];
      return [];
    }));

    await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store: makeMockStore(),
      processedWrapIds,
    });

    expect(processedWrapIds.has(wraps[0]!.id)).toBe(true);
  });

  it('respects custom pageSize', async () => {
    const bob = makeSigner();

    const mockPool = makeMockPool(vi.fn().mockReturnValue([]));

    await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store: makeMockStore(),
      processedWrapIds: new Set(),
      pageSize: 50,
    });

    expect(mockPool.filterCalls[0]).toEqual(
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('inserts unwrapped messages into query cache', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'backfilled message',
    );

    let callCount = 0;
    const mockPool = makeMockPool(vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return [wraps[0]!];
      return [];
    }));

    await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store: makeMockStore(),
      processedWrapIds: new Set(),
    });

    const convs = queryClient.getQueryData<Conversation[]>(QUERY_KEYS.conversations);
    expect(convs).toHaveLength(1);
    expect(convs![0]!.lastMessage.content).toBe('backfilled message');
  });

  it('retries on rate-limited close and succeeds', async () => {
    const alice = makeSigner();
    const bob = makeSigner();

    const { wraps } = await createGiftWraps(
      alice.signer,
      [{ pubkey: bob.pubkey }],
      'rate limited then ok',
    );

    let callCount = 0;
    const mockPool = makeMockPool(
      vi.fn().mockImplementation(() => {
        callCount++;
        // First call: rate-limited, return empty
        if (callCount === 1) return [];
        // Second call (retry): return events
        if (callCount === 2) return [wraps[0]!];
        return [];
      }),
      {
        closeReasons: (idx) =>
          idx === 0 ? ['rate-limited: slow down'] : [],
      },
    );

    const result = await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store: makeMockStore(),
      processedWrapIds: new Set(),
    });

    expect(result.complete).toBe(true);
    expect(result.eventsProcessed).toBe(1);
    // Called 3 times: rate-limited empty, retry with events, then empty (done)
    expect(mockPool.subscribeMany).toHaveBeenCalledTimes(3);
  });

  it('gives up after max rate-limit retries', async () => {
    const bob = makeSigner();

    const mockPool = makeMockPool(
      vi.fn().mockReturnValue([]),
      {
        closeReasons: () => ['rate-limited: too many requests'],
      },
    );

    const result = await backfillGiftWraps({
      pool: mockPool as never,
      userPubkey: bob.pubkey,
      dmRelays: ['wss://test.relay'],
      signer: bob.signer,
      queryClient,
      store: makeMockStore(),
      processedWrapIds: new Set(),
    });

    expect(result.complete).toBe(true);
    expect(result.eventsProcessed).toBe(0);
    // 1 initial + 3 retries = 4 calls
    expect(mockPool.subscribeMany).toHaveBeenCalledTimes(4);
  });
});
