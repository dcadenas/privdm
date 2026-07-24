import type { Event, VerifiedEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import type { SimplePool } from 'nostr-tools/pool';
import type { QueryClient } from '@tanstack/react-query';
import type { NostrSigner } from 'divine-signer';
import type { MessageStore } from '../storage/message-store';
import type { DecryptedMessage } from './types';
import { unwrapGiftWrap } from '../nip17/unwrap';
import { insertMessages } from './subscription-manager';

export const BACKFILL_RETRY_DELAYS = [2_000, 4_000, 8_000];

type RelayCloseResult = { url: string; reason: string };

function isRateLimited(results: RelayCloseResult[]): boolean {
  return results.some(({ reason }) => reason.startsWith('rate-limited:'));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

async function queryWithRetry(
  pool: SimplePool,
  relays: string[],
  filter: Filter,
  signal?: AbortSignal,
): Promise<Event[]> {
  for (let attempt = 0; ; attempt++) {
    const { events, closeResults } = await new Promise<{
      events: Event[];
      closeResults: RelayCloseResult[];
    }>(resolve => {
      const collected: Event[] = [];
      const sub = pool.subscribeMany(relays, filter, {
        onevent(event: Event) { collected.push(event); },
        oneose() { sub.close(); },
        onclose(results: RelayCloseResult[]) {
          for (const { url, reason } of results) {
            if (reason && !reason.startsWith('closed')) {
              console.warn('[backfill] relay closed subscription:', { url, reason });
            }
          }
          resolve({ events: collected, closeResults: results });
        },
        maxWait: 15_000,
      });
    });

    if (!isRateLimited(closeResults) || attempt >= BACKFILL_RETRY_DELAYS.length) {
      return events;
    }

    const delay = BACKFILL_RETRY_DELAYS[attempt]!;
    console.warn(`[backfill] rate-limited, retrying in ${delay}ms (attempt ${attempt + 1}/${BACKFILL_RETRY_DELAYS.length})`);
    try {
      await sleep(delay, signal);
    } catch {
      return events; // aborted
    }
  }
}

export interface BackfillOptions {
  pool: SimplePool;
  userPubkey: string;
  dmRelays: string[];
  signer: NostrSigner;
  queryClient: QueryClient;
  store: MessageStore;
  processedWrapIds: Set<string>;
  signal?: AbortSignal;
  pageSize?: number;
}

export interface BackfillResult {
  complete: boolean;
  eventsProcessed: number;
}

function makeFilter(userPubkey: string, pageSize: number, cursor?: number): Filter {
  const filter: Record<string, unknown> = {
    kinds: [1059],
    '#p': [userPubkey],
    limit: pageSize,
  };
  if (cursor !== undefined) {
    filter.until = cursor;
  }
  return filter as Filter;
}

export async function backfillGiftWraps(options: BackfillOptions): Promise<BackfillResult> {
  const {
    pool,
    userPubkey,
    dmRelays,
    signer,
    queryClient,
    store,
    processedWrapIds,
    signal,
    pageSize = 100,
  } = options;

  let cursor: number | undefined;
  let eventsProcessed = 0;
  let page = 0;

  console.log(`[backfill] starting, relays=${dmRelays.join(',')}, pageSize=${pageSize}`);

  let events = await queryWithRetry(pool, dmRelays, makeFilter(userPubkey, pageSize), signal);

  while (!signal?.aborted) {
    if (events.length === 0) {
      console.log(`[backfill] page ${page}: empty → done (until=${cursor ?? 'none'})`);
      break;
    }

    let minTs = events[0]!.created_at;
    let maxTs = events[0]!.created_at;
    for (const event of events) {
      if (event.created_at < minTs) minTs = event.created_at;
      if (event.created_at > maxTs) maxTs = event.created_at;
    }

    const skipped = events.filter(e => processedWrapIds.has(e.id)).length;
    console.log(
      `[backfill] page ${page}: ${events.length} events, ` +
      `ts ${new Date(minTs * 1000).toISOString().slice(0, 16)}..${new Date(maxTs * 1000).toISOString().slice(0, 16)}, ` +
      `until=${cursor ?? 'none'}, skip=${skipped}`,
    );

    cursor = minTs - 1;

    // Fetch next page while processing current page sequentially
    const nextFetch = queryWithRetry(pool, dmRelays, makeFilter(userPubkey, pageSize, cursor), signal);

    // Collect successfully decrypted messages, then batch-insert
    const batchMessages: { message: DecryptedMessage; wrapCreatedAt: number }[] = [];
    let decryptFails = 0;
    for (const event of events) {
      if (signal?.aborted) break;
      if (processedWrapIds.has(event.id)) continue;
      processedWrapIds.add(event.id);

      try {
        const unwrapped = await unwrapGiftWrap(signer, event as VerifiedEvent);
        const message: DecryptedMessage = {
          id: unwrapped.rumor.id,
          conversationId: unwrapped.conversationId,
          senderPubkey: unwrapped.senderPubkey,
          content: unwrapped.rumor.content,
          createdAt: unwrapped.rumor.created_at,
          rumor: unwrapped.rumor,
          wrapId: event.id,
        };
        batchMessages.push({ message, wrapCreatedAt: event.created_at });
      } catch {
        decryptFails++;
      }
    }

    // Save to store individually (needs per-message dedup), then batch UI update
    let inserted = 0;
    const uiMessages: DecryptedMessage[] = [];
    for (const { message, wrapCreatedAt } of batchMessages) {
      const saved = await store.saveMessage(message, wrapCreatedAt);
      if (!saved) continue;
      uiMessages.push(message);
      inserted++;
    }
    insertMessages(queryClient, uiMessages);
    eventsProcessed += inserted;

    if (decryptFails > 0) {
      console.log(`[backfill] page ${page}: ${inserted} inserted, ${decryptFails} decrypt failures`);
    }

    events = await nextFetch;
    page++;
  }

  console.log(`[backfill] finished: ${signal?.aborted ? 'aborted' : 'complete'}, ${eventsProcessed} events processed across ${page} pages`);

  return { complete: !signal?.aborted, eventsProcessed };
}
