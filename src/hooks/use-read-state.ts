import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { useConversations } from './use-conversations';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import { readStateStore } from '@/lib/storage/singleton';
import type { ReadStateMap } from '@/lib/storage/read-state-store';
import type { Conversation } from '@/lib/relay/types';

export function useReadState() {
  const { pubkey } = useAuth();
  const queryClient = useQueryClient();
  const { data: conversations = [] } = useConversations();

  const { data: readState = {} } = useQuery<ReadStateMap>({
    queryKey: QUERY_KEYS.readState,
    queryFn: () => ({}),
    staleTime: Infinity,
  });

  const markRead = useCallback(
    (conversationId: string, timestamp: number) => {
      queryClient.setQueryData<ReadStateMap>(QUERY_KEYS.readState, (prev = {}) => {
        if (timestamp <= (prev[conversationId] ?? 0)) return prev;
        return { ...prev, [conversationId]: timestamp };
      });
      void readStateStore.markRead(conversationId, timestamp);
    },
    [queryClient],
  );

  const isUnread = useCallback(
    (conversation: Conversation) => {
      if (!pubkey) return false;
      if (conversation.lastMessage.senderPubkey === pubkey) return false;
      return conversation.lastMessage.createdAt > (readState[conversation.id] ?? 0);
    },
    [pubkey, readState],
  );

  const unreadCount = useMemo(
    () => conversations.filter((c) => isUnread(c)).length,
    [conversations, isUnread],
  );

  return { readState, markRead, isUnread, unreadCount };
}
