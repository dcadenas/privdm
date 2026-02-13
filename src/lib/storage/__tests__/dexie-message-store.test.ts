import { DexieMessageStore } from '../dexie-message-store';
import { PrivdmDatabase } from '../database';
import type { DecryptedMessage } from '../../relay/types';
import type { Rumor } from '../../nip17/types';

function makeMessage(overrides: Partial<DecryptedMessage> = {}): DecryptedMessage {
  const id = overrides.id ?? crypto.randomUUID();
  return {
    id,
    conversationId: 'alice+bob',
    senderPubkey: 'alice',
    content: 'hello',
    createdAt: 1000,
    rumor: { id, pubkey: 'alice', created_at: 1000, kind: 14, tags: [], content: 'hello' } as Rumor,
    wrapId: overrides.wrapId ?? crypto.randomUUID(),
    ...overrides,
  };
}

describe('DexieMessageStore', () => {
  let store: DexieMessageStore;

  beforeEach(async () => {
    store = new DexieMessageStore(new PrivdmDatabase());
    await store.clear();
  });

  afterEach(async () => {
    await store.clear();
  });

  it('saves and loads a message', async () => {
    const msg = makeMessage();
    const saved = await store.saveMessage(msg, 2000);
    expect(saved).toBe(true);

    const messages = await store.loadMessages('alice+bob');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe('hello');
    expect(messages[0]!.id).toBe(msg.id);
  });

  it('returns false for duplicate message id', async () => {
    const msg = makeMessage();
    await store.saveMessage(msg, 2000);
    const second = await store.saveMessage(msg, 2000);
    expect(second).toBe(false);
  });

  it('creates a conversation on first message', async () => {
    const msg = makeMessage();
    await store.saveMessage(msg, 2000);

    const conversations = await store.loadConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.id).toBe('alice+bob');
    expect(conversations[0]!.participants).toEqual(['alice', 'bob']);
    expect(conversations[0]!.messageCount).toBe(1);
    expect(conversations[0]!.lastMessage.content).toBe('hello');
  });

  it('updates conversation on subsequent messages', async () => {
    await store.saveMessage(makeMessage({ createdAt: 1000 }), 2000);
    await store.saveMessage(
      makeMessage({ content: 'goodbye', createdAt: 2000 }),
      3000,
    );

    const conversations = await store.loadConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.messageCount).toBe(2);
    expect(conversations[0]!.lastMessage.content).toBe('goodbye');
  });

  it('keeps earlier lastMessage if new message is older', async () => {
    await store.saveMessage(makeMessage({ content: 'newer', createdAt: 2000 }), 3000);
    await store.saveMessage(makeMessage({ content: 'older', createdAt: 500 }), 1000);

    const conversations = await store.loadConversations();
    expect(conversations[0]!.lastMessage.content).toBe('newer');
  });

  it('returns all wrap IDs', async () => {
    const msg1 = makeMessage({ wrapId: 'wrap-1' });
    const msg2 = makeMessage({ wrapId: 'wrap-2' });
    await store.saveMessage(msg1, 2000);
    await store.saveMessage(msg2, 3000);

    const wrapIds = await store.getWrapIds();
    expect(wrapIds).toEqual(new Set(['wrap-1', 'wrap-2']));
  });

  it('returns since timestamp with 3-day safety margin', async () => {
    const wrapCreatedAt = 1_700_000_000;
    await store.saveMessage(makeMessage(), wrapCreatedAt);

    const since = await store.getSinceTimestamp();
    const threeDays = 3 * 24 * 60 * 60;
    expect(since).toBe(wrapCreatedAt - threeDays);
  });

  it('returns undefined since when no messages', async () => {
    const since = await store.getSinceTimestamp();
    expect(since).toBeUndefined();
  });

  it('tracks the latest wrapCreatedAt across messages', async () => {
    await store.saveMessage(makeMessage(), 1000);
    await store.saveMessage(makeMessage(), 5000);
    await store.saveMessage(makeMessage(), 3000);

    const since = await store.getSinceTimestamp();
    const threeDays = 3 * 24 * 60 * 60;
    expect(since).toBe(5000 - threeDays);
  });

  it('clear() wipes all data', async () => {
    await store.saveMessage(makeMessage(), 2000);
    await store.clear();

    expect(await store.loadConversations()).toEqual([]);
    expect(await store.loadMessages('alice+bob')).toEqual([]);
    expect(await store.getWrapIds()).toEqual(new Set());
    expect(await store.getSinceTimestamp()).toBeUndefined();
  });

  it('sorts conversations by lastMessage.createdAt descending', async () => {
    await store.saveMessage(
      makeMessage({ conversationId: 'a+b', createdAt: 1000 }),
      2000,
    );
    await store.saveMessage(
      makeMessage({ conversationId: 'c+d', createdAt: 3000 }),
      4000,
    );

    const conversations = await store.loadConversations();
    expect(conversations[0]!.id).toBe('c+d');
    expect(conversations[1]!.id).toBe('a+b');
  });

  it('sorts messages by createdAt ascending', async () => {
    await store.saveMessage(makeMessage({ createdAt: 3000 }), 4000);
    await store.saveMessage(makeMessage({ createdAt: 1000 }), 2000);
    await store.saveMessage(makeMessage({ createdAt: 2000 }), 3000);

    const messages = await store.loadMessages('alice+bob');
    expect(messages.map((m) => m.createdAt)).toEqual([1000, 2000, 3000]);
  });

  it('getBackfillStatus returns incomplete when fresh', async () => {
    const status = await store.getBackfillStatus();
    expect(status.complete).toBe(false);
    expect(status.completedAt).toBeNull();
  });

  it('setBackfillComplete then getBackfillStatus returns complete with timestamp', async () => {
    const before = Math.floor(Date.now() / 1000);
    await store.setBackfillComplete();
    const after = Math.floor(Date.now() / 1000);

    const status = await store.getBackfillStatus();
    expect(status.complete).toBe(true);
    expect(status.completedAt).toBeGreaterThanOrEqual(before);
    expect(status.completedAt).toBeLessThanOrEqual(after);
  });

  it('clear resets backfill status', async () => {
    await store.setBackfillComplete();
    await store.clear();

    const status = await store.getBackfillStatus();
    expect(status.complete).toBe(false);
    expect(status.completedAt).toBeNull();
  });
});
