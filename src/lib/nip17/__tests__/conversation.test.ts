import { getConversationId } from '../conversation';
import type { Rumor } from '../types';

function makeRumor(pubkey: string, pTagPubkeys: string[]): Rumor {
  return {
    id: 'fake-id',
    pubkey,
    created_at: 0,
    kind: 14,
    tags: pTagPubkeys.map((pk) => ['p', pk]),
    content: '',
  };
}

describe('getConversationId', () => {
  it('combines sender + recipients, sorted', () => {
    const id = getConversationId(makeRumor('bbb', ['aaa']));
    expect(id).toBe('aaa+bbb');
  });

  it('deduplicates pubkeys', () => {
    const id = getConversationId(makeRumor('aaa', ['aaa', 'bbb']));
    expect(id).toBe('aaa+bbb');
  });

  it('sorts pubkeys lexicographically', () => {
    const id = getConversationId(makeRumor('ccc', ['aaa', 'bbb']));
    expect(id).toBe('aaa+bbb+ccc');
  });

  it('handles single participant (self-chat)', () => {
    const id = getConversationId(makeRumor('aaa', []));
    expect(id).toBe('aaa');
  });

  it('same participants in different order produce same id', () => {
    const id1 = getConversationId(makeRumor('alice', ['bob']));
    const id2 = getConversationId(makeRumor('bob', ['alice']));
    expect(id1).toBe(id2);
  });
});
