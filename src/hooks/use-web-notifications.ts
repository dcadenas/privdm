import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { QUERY_KEYS } from '@/lib/relay/query-keys';
import type { Conversation } from '@/lib/relay/types';
import type { NostrProfile } from './use-profile';

function truncatePubkey(pubkey: string): string {
  return pubkey.slice(0, 8) + '...';
}

function truncateBody(content: string, max = 100): string {
  if (content.length <= max) return content;
  return content.slice(0, max) + '...';
}

export function useWebNotifications(): void {
  const queryClient = useQueryClient();
  const { pubkey } = useAuth();
  const prevConversationsRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (!pubkey) return;
    if (typeof Notification === 'undefined') return;

    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return;
      if (event.action.type !== 'success') return;

      const queryKey = event.query.queryKey;
      if (
        queryKey.length !== QUERY_KEYS.conversations.length ||
        queryKey[0] !== QUERY_KEYS.conversations[0]
      ) {
        return;
      }

      if (Notification.permission !== 'granted') return;

      const conversations = event.query.state.data as Conversation[] | undefined;
      if (!conversations) return;

      const prev = prevConversationsRef.current;
      const next = new Map<string, string>();
      for (const conv of conversations) {
        next.set(conv.id, conv.lastMessage.id);
      }

      // First render — snapshot only, no notifications (hydration)
      if (prev === null) {
        prevConversationsRef.current = next;
        return;
      }

      for (const conv of conversations) {
        const prevMessageId = prev.get(conv.id);
        if (prevMessageId === conv.lastMessage.id) continue;

        // New or changed lastMessage
        if (conv.lastMessage.senderPubkey === pubkey) continue;
        if (!document.hidden) continue;

        const senderPubkey = conv.lastMessage.senderPubkey;
        const profile = queryClient.getQueryData<NostrProfile | null>(
          QUERY_KEYS.profile(senderPubkey),
        );

        const title = profile?.displayName || profile?.name || truncatePubkey(senderPubkey);
        const body = truncateBody(conv.lastMessage.content);
        const icon = profile?.picture;

        const notification = new Notification(title, {
          body,
          icon,
          tag: conv.id,
        });

        notification.onclick = () => {
          window.focus();
        };
      }

      prevConversationsRef.current = next;
    });

    return unsubscribe;
  }, [pubkey, queryClient]);
}
