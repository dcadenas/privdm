import { useState, useRef, useEffect, useCallback } from 'react';
import { nip19, nip05 } from 'nostr-tools';
import { useAuth } from '@/context/auth-context';
import { useConversations } from '@/hooks/use-conversations';
import { useMessages } from '@/hooks/use-messages';
import { useSendMessage } from '@/hooks/use-send-message';
import { useReadState } from '@/hooks/use-read-state';
import { ProfilePic, DisplayName, ClickableProfile } from '@/components/profile';
import { AccountMenu } from '@/components/AccountMenu';
import { MessageContent } from '@/components/content';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import type { ConnectionStatus } from '@/hooks/use-connection-status';
import type { Conversation, DecryptedMessage } from '@/lib/relay/types';

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function shouldShowTimestamp(current: DecryptedMessage, next: DecryptedMessage | undefined): boolean {
  if (!next) return true;
  // Show timestamp if >5 minutes gap or different sender
  if (next.senderPubkey !== current.senderPubkey) return true;
  return (next.createdAt - current.createdAt) > 300;
}

// ─── Conversation List Item ─────────────────────────────────────
function ConversationItem({
  conversation,
  myPubkey,
  isSelected,
  isUnread,
  onClick,
}: {
  conversation: Conversation;
  myPubkey: string;
  isSelected: boolean;
  isUnread: boolean;
  onClick: () => void;
}) {
  const otherPubkey = conversation.participants.find((p) => p !== myPubkey) ?? conversation.participants[0]!;

  return (
    <button
      onClick={onClick}
      data-testid={`conversation-${conversation.id.slice(0, 12)}`}
      className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-150 ${
        isSelected
          ? 'bg-gray-800/70 border border-gray-700/40'
          : 'border border-transparent hover:bg-gray-800/30'
      }`}
    >
      <ProfilePic pubkey={otherPubkey} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm ${isUnread ? 'font-semibold text-gray-100' : `font-medium ${isSelected ? 'text-gray-100' : 'text-gray-300'}`}`}>
            <DisplayName pubkey={otherPubkey} />
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className={`text-[10px] ${isUnread ? 'text-amber-500' : 'text-gray-600'}`}>
              {formatTime(conversation.lastMessage.createdAt)}
            </span>
            {isUnread && <span className="h-2.5 w-2.5 rounded-full bg-amber-500" data-testid="unread-dot" />}
          </div>
        </div>
        <p className={`mt-0.5 truncate text-xs ${isUnread ? 'text-gray-300' : 'text-gray-500'}`}>
          {conversation.lastMessage.senderPubkey === myPubkey && (
            <span className="text-gray-600">You: </span>
          )}
          {conversation.lastMessage.content}
        </p>
      </div>
    </button>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────
function MessageBubble({
  message,
  isMine,
  showSender,
  showTimestamp,
  isFirstInGroup,
}: {
  message: DecryptedMessage;
  isMine: boolean;
  showSender: boolean;
  showTimestamp: boolean;
  isFirstInGroup: boolean;
}) {
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? '' : 'mt-0.5'}`}>
      <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
        {showSender && !isMine && (
          <p className="mb-1 ml-1 text-[10px] text-gray-500">
            <DisplayName pubkey={message.senderPubkey} />
          </p>
        )}
        <div
          className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
            isMine
              ? 'bg-amber-500 text-gray-950 rounded-br-md'
              : 'bg-gray-800/80 text-gray-200 border border-gray-700/30 rounded-bl-md'
          }`}
        >
          <MessageContent content={message.content} isMine={isMine} />
        </div>
        {showTimestamp && (
          <p className={`mt-0.5 flex items-center gap-1 text-[10px] text-gray-600 ${isMine ? 'justify-end mr-1' : 'ml-1'}`}>
            {formatTime(message.createdAt)}
            {isMine && (
              <svg className="h-3 w-3 text-gray-500" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 8.5L6.5 11.5L12.5 5" />
              </svg>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── New Conversation Dialog ────────────────────────────────────
function NewConversationDialog({
  onStart,
  onClose,
}: {
  onStart: (pubkey: string) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  async function handleSubmit() {
    setErr(null);
    let pubkey = input.trim();

    // NIP-05 address (contains @)
    if (pubkey.includes('@')) {
      if (!nip05.isNip05(pubkey)) {
        setErr('Invalid NIP-05 address');
        return;
      }
      setResolving(true);
      try {
        const profile = await nip05.queryProfile(pubkey);
        if (!profile) {
          setErr('Could not resolve NIP-05 address');
          return;
        }
        pubkey = profile.pubkey;
      } finally {
        setResolving(false);
      }
    }
    // Try to decode npub
    else if (pubkey.startsWith('npub1')) {
      try {
        const decoded = nip19.decode(pubkey);
        if (decoded.type !== 'npub') {
          setErr('Invalid npub');
          return;
        }
        pubkey = decoded.data;
      } catch {
        setErr('Invalid npub format');
        return;
      }
    }

    // Validate hex pubkey (64 hex chars)
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      setErr('Enter a valid npub, NIP-05 address, or hex pubkey');
      return;
    }

    onStart(pubkey);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-gray-800/60 bg-gray-900 p-6 shadow-2xl animate-slide-up">
        <h2 className="font-display text-lg font-semibold text-gray-100">New conversation</h2>
        <p className="mt-1 text-xs text-gray-500">
          Enter an npub, NIP-05 address, or hex pubkey
        </p>
        <input
          type="text"
          placeholder="npub1... or user@domain.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !resolving && handleSubmit()}
          className="input-dark mt-4"
          autoFocus
          data-testid="new-conversation-input"
        />
        {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
        <div className="mt-4 flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost text-xs">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || resolving}
            className="btn-primary text-xs"
            data-testid="new-conversation-start"
          >
            {resolving ? 'Resolving...' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Message Area ───────────────────────────────────────────────
function MessageArea({
  conversationId,
  myPubkey,
}: {
  conversationId: string;
  myPubkey: string;
}) {
  const { data: messages = [] } = useMessages(conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-600">No messages yet. Say hello.</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" data-testid="message-list">
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const showSender = !prev || prev.senderPubkey !== msg.senderPubkey;
        const isFirstInGroup = !prev || prev.senderPubkey !== msg.senderPubkey;
        const showTimestamp = shouldShowTimestamp(msg, next);
        return (
          <div key={msg.id} className={isFirstInGroup && i > 0 ? 'mt-3' : ''}>
            <MessageBubble
              message={msg}
              isMine={msg.senderPubkey === myPubkey}
              showSender={showSender}
              showTimestamp={showTimestamp}
              isFirstInGroup={isFirstInGroup}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Compose Area ───────────────────────────────────────────────
function ComposeArea({
  recipientPubkeys,
  disabled,
}: {
  recipientPubkeys: string[];
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const { mutate: send, isPending } = useSendMessage();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    setText('');
    send({
      recipients: recipientPubkeys.map((pk) => ({ pubkey: pk })),
      message: trimmed,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-gray-800/50 bg-gray-950/80 px-3 py-2.5 md:px-4 md:py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Reconnecting...' : 'Write a message...'}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-800/50 bg-gray-900/60 px-4 py-2.5
                     text-sm text-gray-100 placeholder-gray-600 outline-none
                     transition-colors focus:border-gray-700 focus:bg-gray-900/80"
          data-testid="compose-input"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500
                     text-gray-950 transition-all hover:bg-amber-400 active:scale-95
                     disabled:opacity-30 disabled:hover:bg-amber-500"
          data-testid="send-button"
        >
          {isPending ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-950/30 border-t-gray-950" />
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main Chat View ─────────────────────────────────────────────
export function ChatView({ connectionStatus }: { connectionStatus: ConnectionStatus }) {
  const { pubkey } = useAuth();
  const { data: conversations = [] } = useConversations();
  const { markRead, isUnread, unreadCount } = useReadState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const selected = conversations.find((c) => c.id === selectedId);

  // Mark conversation as read when opened or when new messages arrive in the open conversation
  useEffect(() => {
    if (!selectedId) return;
    const conv = conversations.find((c) => c.id === selectedId);
    if (conv) markRead(selectedId, conv.lastMessage.createdAt);
  }, [selectedId, conversations, markRead]);

  // Update document title with unread count
  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) PrivDM` : 'PrivDM';
  }, [unreadCount]);

  const startNewConversation = useCallback(
    (recipientPubkey: string) => {
      if (!pubkey) return;
      // Derive conversation ID (sorted pubkeys)
      const id = [pubkey, recipientPubkey].sort().join('+');
      setSelectedId(id);
      setShowNewConv(false);
    },
    [pubkey],
  );

  const recipientPubkeys = selected
    ? selected.participants.filter((p) => p !== pubkey)
    : selectedId
      ? selectedId.split('+').filter((p) => p !== pubkey)
      : [];

  // On mobile, show either conversation list or chat (not both)
  const showChat = !!selectedId;

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-gray-100">
      <ConnectionBanner
        isConnected={connectionStatus.isConnected}
        isReconnecting={connectionStatus.isReconnecting}
        onRetry={connectionStatus.reconnect}
      />
      <div className="flex flex-1 overflow-hidden">
      {/* Sidebar — full-width on mobile, fixed-width on desktop */}
      <aside className={`flex w-full flex-col border-r border-gray-800/40 bg-gray-950
                         md:w-80 md:shrink-0 md:flex ${showChat ? 'hidden md:flex' : 'flex'}`}>
        {/* Sidebar header — avatar + name on left, gear + compose on right */}
        <div className="flex items-center justify-between border-b border-gray-800/40 px-4 py-3.5">
          <AccountMenu />
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors
                         ${showSettings
                           ? 'bg-gray-800/70 text-gray-200'
                           : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'}`}
              title="Settings"
              data-testid="settings-button"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={() => setShowNewConv(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400
                         transition-colors hover:bg-gray-800/50 hover:text-gray-200"
              title="New conversation"
              data-testid="new-conversation-button"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </button>
          </div>
        </div>

        {/* Settings panel (slides in below header) */}
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto p-2" data-testid="conversation-list">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 text-2xl text-gray-700">💬</div>
              <p className="text-xs text-gray-600">No conversations yet</p>
              <button
                onClick={() => setShowNewConv(true)}
                className="mt-3 text-xs text-amber-500 hover:text-amber-400 transition-colors"
              >
                Start one →
              </button>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                myPubkey={pubkey!}
                isSelected={conv.id === selectedId}
                isUnread={isUnread(conv)}
                onClick={() => setSelectedId(conv.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-800/40 px-4 py-3 space-y-2">
          <p className="text-[10px] leading-relaxed text-gray-600">
            Messages are end-to-end encrypted using the Nostr protocol
            (NIP-17/NIP-44). This software is provided as-is with no warranty.{' '}
            <a
              href="https://github.com/dcadenas/privdm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-400 transition-colors"
            >
              Open source (MIT)
            </a>
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="text-[10px] text-gray-600">Discover Nostr:</span>
            <a href="https://nostr.com" target="_blank" rel="noopener noreferrer"
               className="text-[10px] text-gray-500 hover:text-amber-400 transition-colors">nostr.com</a>
            <a href="https://nostr.net" target="_blank" rel="noopener noreferrer"
               className="text-[10px] text-gray-500 hover:text-amber-400 transition-colors">nostr.net</a>
          </div>
        </div>
      </aside>

      {/* Main message area — full-width on mobile, flex on desktop */}
      <main className={`flex flex-1 flex-col ${showChat ? 'flex' : 'hidden md:flex'}`}>
        {selectedId ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-gray-800/40 px-4 py-3 md:px-5">
              {/* Back button (mobile only) */}
              <button
                onClick={() => setSelectedId(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400
                           transition-colors hover:bg-gray-800/50 hover:text-gray-200 md:hidden"
                data-testid="back-button"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
              {recipientPubkeys[0] && (
                <ClickableProfile pubkey={recipientPubkeys[0]} picSize="sm" showSecondary />
              )}
              {recipientPubkeys.length > 1 && (
                <span className="ml-1 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">
                  +{recipientPubkeys.length - 1}
                </span>
              )}
            </div>

            {/* Messages */}
            <MessageArea conversationId={selectedId} myPubkey={pubkey!} />

            {/* Compose */}
            <ComposeArea recipientPubkeys={recipientPubkeys} disabled={!connectionStatus.isConnected} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-4 text-4xl text-gray-800">⚡</div>
            <h2 className="font-display text-xl font-semibold text-gray-600">
              Select a conversation
            </h2>
            <p className="mt-1.5 text-xs text-gray-700">
              or start a new one with the compose button
            </p>
          </div>
        )}
      </main>
      </div>

      {/* New conversation modal */}
      {showNewConv && (
        <NewConversationDialog
          onStart={startNewConversation}
          onClose={() => setShowNewConv(false)}
        />
      )}
    </div>
  );
}
