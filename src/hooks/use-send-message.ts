import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { useRelayPool } from './use-relay-pool';
import { createGiftWraps } from '@/lib/nip17/giftwrap';
import { createRumor } from '@/lib/nip17/rumor';
import { fetchDMRelays } from '@/lib/relay/dm-relays';
import { DEFAULT_DM_RELAYS } from '@/lib/relay/defaults';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import { messageStore, readStateStore } from '@/lib/storage/singleton';
import type { ReadStateMap } from '@/lib/storage/read-state-store';
import type { DecryptedMessage, Conversation } from '@/lib/relay/types';
import type { Recipient, CreateRumorOptions } from '@/lib/nip17/types';

interface SendMessageParams {
  recipients: Recipient[];
  message: string;
  options?: CreateRumorOptions;
}

export function useSendMessage() {
  const { signer, pubkey } = useAuth();
  const pool = useRelayPool();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ recipients, message, options }: SendMessageParams) => {
      if (!signer || !pubkey) throw new Error('Not authenticated');

      // Optimistic update: insert message into cache immediately
      const rumor = createRumor(pubkey, recipients, message, options);
      const allPubkeys = [pubkey, ...recipients.map((r) => r.pubkey)];
      const conversationId = [...new Set(allPubkeys)].sort().join('+');

      const optimisticMessage: DecryptedMessage = {
        id: rumor.id,
        conversationId,
        senderPubkey: pubkey,
        content: message,
        createdAt: rumor.created_at,
        rumor,
        wrapId: `optimistic-${rumor.id}`,
      };

      queryClient.setQueryData<DecryptedMessage[]>(
        QUERY_KEYS.messages(conversationId),
        (prev = []) => [...prev, optimisticMessage].sort((a, b) => a.createdAt - b.createdAt),
      );

      queryClient.setQueryData<Conversation[]>(
        QUERY_KEYS.conversations,
        (prev = []) => {
          const existing = prev.find((c) => c.id === conversationId);
          if (existing) {
            return prev
              .map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      lastMessage:
                        optimisticMessage.createdAt >= c.lastMessage.createdAt
                          ? optimisticMessage
                          : c.lastMessage,
                      messageCount: c.messageCount + 1,
                    }
                  : c,
              )
              .sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt);
          }
          const newConv: Conversation = {
            id: conversationId,
            participants: [...new Set(allPubkeys)],
            lastMessage: optimisticMessage,
            messageCount: 1,
          };
          return [newConv, ...prev].sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt);
        },
      );

      // Persist to Dexie so the subscription manager's dedup catches it
      await messageStore.saveMessage(optimisticMessage, rumor.created_at);

      // Sent = read: mark conversation as read at the time of our message
      queryClient.setQueryData<ReadStateMap>(
        QUERY_KEYS.readState,
        (prev = {}) => ({ ...prev, [conversationId]: rumor.created_at }),
      );
      void readStateStore.markRead(conversationId, rumor.created_at);

      // Now do the actual gift-wrap + publish (slow part)
      const { wraps, selfWrap } = await createGiftWraps(signer, recipients, message, options);

      const publishPromises: Promise<void>[] = [];

      // Publish each wrap to the recipient's DM relays
      for (let i = 0; i < recipients.length; i++) {
        const wrap = wraps[i]!;
        const recipientRelayList = await fetchDMRelays(pool, recipients[i]!.pubkey);
        const relays = recipientRelayList?.relays ?? DEFAULT_DM_RELAYS;
        publishPromises.push(
          Promise.any(pool.publish(relays, wrap)).then(() => {}),
        );
      }

      // Publish self-wrap to own DM relays
      const senderRelayList = await fetchDMRelays(pool, pubkey);
      const senderRelays = senderRelayList?.relays ?? DEFAULT_DM_RELAYS;
      publishPromises.push(
        Promise.any(pool.publish(senderRelays, selfWrap)).then(() => {}),
      );

      await Promise.allSettled(publishPromises);
    },
  });
}
