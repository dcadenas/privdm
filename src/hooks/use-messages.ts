import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import { messageStore } from '@/lib/storage/singleton';
import type { DecryptedMessage } from '@/lib/relay/types';

export function useMessages(conversationId: string) {
  return useQuery<DecryptedMessage[]>({
    queryKey: QUERY_KEYS.messages(conversationId),
    queryFn: () => messageStore.loadMessages(conversationId),
    staleTime: Infinity,
  });
}
