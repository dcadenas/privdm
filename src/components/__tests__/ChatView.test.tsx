import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatView } from '../ChatView';
import type { Conversation, DecryptedMessage } from '@/lib/relay/types';

const myPubkey = 'a'.repeat(64);
const otherPubkey = 'b'.repeat(64);
const conversationId = `${myPubkey}+${otherPubkey}`;
const markRead = vi.fn();
const state: {
  conversations: Conversation[];
  messages: DecryptedMessage[];
} = {
  conversations: [],
  messages: [],
};

vi.mock('@/context/auth-context', () => ({
  useAuth: () => ({ pubkey: myPubkey }),
}));

vi.mock('@/hooks/use-conversations', () => ({
  useConversations: () => ({ data: state.conversations }),
}));

vi.mock('@/hooks/use-messages', () => ({
  useMessages: () => ({ data: state.messages }),
}));

vi.mock('@/hooks/use-send-message', () => ({
  useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-read-state', () => ({
  useReadState: () => ({
    markRead,
    isUnread: () => false,
    unreadCount: 0,
  }),
}));

vi.mock('@/components/profile', () => ({
  ProfilePic: () => <span />,
  DisplayName: ({ pubkey }: { pubkey: string }) => <span>{pubkey.slice(0, 8)}</span>,
  ClickableProfile: () => <span />,
}));

vi.mock('@/components/content', () => ({
  MessageContent: ({ content }: { content: string }) => <span>{content}</span>,
}));

vi.mock('@/components/AccountMenu', () => ({
  AccountMenu: () => <span />,
}));

vi.mock('@/components/SettingsPanel', () => ({
  SettingsPanel: () => <span />,
}));

vi.mock('@/components/ConnectionBanner', () => ({
  ConnectionBanner: () => <span />,
}));

function makeMessage(id: string, createdAt: number): DecryptedMessage {
  return {
    id,
    conversationId,
    senderPubkey: otherPubkey,
    content: id,
    createdAt,
    rumor: {
      id,
      pubkey: otherPubkey,
      kind: 14,
      content: id,
      created_at: createdAt,
      tags: [['p', myPubkey]],
    },
    wrapId: `wrap-${id}`,
  };
}

function setConversation(messages: DecryptedMessage[]) {
  state.messages = messages;
  state.conversations = [{
    id: conversationId,
    participants: [myPubkey, otherPubkey],
    lastMessage: messages[messages.length - 1]!,
    messageCount: messages.length,
  }];
}

function setVisibility(visibilityState: DocumentVisibilityState) {
  Object.defineProperties(document, {
    visibilityState: { configurable: true, value: visibilityState },
    hidden: { configurable: true, value: visibilityState === 'hidden' },
  });
}

const connectionStatus = {
  isConnected: true,
  isReconnecting: false,
  reconnect: vi.fn(),
};

function openConversation() {
  fireEvent.click(screen.getByTestId(`conversation-${conversationId.slice(0, 12)}`));
}

beforeEach(() => {
  markRead.mockReset();
  connectionStatus.reconnect.mockReset();
  setVisibility('visible');
  setConversation([makeMessage('first', 100)]);
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
});

describe('ChatView read state', () => {
  it('does not mark a message read while the tab is hidden', () => {
    const view = render(<ChatView connectionStatus={connectionStatus} />);
    openConversation();
    markRead.mockClear();

    setVisibility('hidden');
    setConversation([...state.messages, makeMessage('hidden-message', 200)]);
    view.rerender(<ChatView connectionStatus={connectionStatus} />);

    expect(markRead).not.toHaveBeenCalledWith(conversationId, 200);

    setVisibility('visible');
    fireEvent(document, new Event('visibilitychange'));

    expect(markRead).toHaveBeenCalledWith(conversationId, 200);
  });

  it('does not mark a new message read while the reader is above the bottom', () => {
    const view = render(<ChatView connectionStatus={connectionStatus} />);
    openConversation();

    const messageList = screen.getByTestId('message-list');
    Object.defineProperties(messageList, {
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 100, writable: true },
      clientHeight: { configurable: true, value: 400 },
    });
    fireEvent.scroll(messageList);
    markRead.mockClear();

    setConversation([...state.messages, makeMessage('offscreen-message', 200)]);
    view.rerender(<ChatView connectionStatus={connectionStatus} />);

    expect(markRead).not.toHaveBeenCalledWith(conversationId, 200);

    messageList.scrollTop = 600;
    fireEvent.scroll(messageList);

    expect(markRead).toHaveBeenCalledWith(conversationId, 200);
  });

  it('marks a new message read when it is visible at the bottom', () => {
    const view = render(<ChatView connectionStatus={connectionStatus} />);
    openConversation();

    const messageList = screen.getByTestId('message-list');
    Object.defineProperties(messageList, {
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 600, writable: true },
      clientHeight: { configurable: true, value: 400 },
    });
    fireEvent.scroll(messageList);
    markRead.mockClear();

    setConversation([...state.messages, makeMessage('visible-message', 200)]);
    view.rerender(<ChatView connectionStatus={connectionStatus} />);

    expect(markRead).toHaveBeenCalledWith(conversationId, 200);
  });
});
