import { useQuery } from '@tanstack/react-query';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import type { Conversation } from '@/lib/relay/types';

export function useConversations() {
  return useQuery<Conversation[]>({
    queryKey: QUERY_KEYS.conversations,
    queryFn: () => [],
    staleTime: Infinity,
  });
}
