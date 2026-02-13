import { useState } from 'react';
import { useMyDMRelayList } from '@/hooks/use-my-dm-relay-list';
import { usePublishDMRelays } from '@/hooks/use-publish-dm-relays';
import { normalizeRelayUrl } from '@/lib/relay/dm-relays';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { relays, isPublished, isLoading } = useMyDMRelayList();
  const { mutate: publish, isPending: isPublishing } = usePublishDMRelays();

  const [editedRelays, setEditedRelays] = useState<string[] | null>(null);
  const [newRelay, setNewRelay] = useState('');
  const [error, setError] = useState<string | null>(null);

  const currentRelays = editedRelays ?? relays;
  const hasChanges = editedRelays !== null;

  function addRelay() {
    setError(null);
    const raw = newRelay.trim();
    if (!raw) return;

    if (!raw.startsWith('wss://')) {
      setError('Relay URL must start with wss://');
      return;
    }

    const normalized = normalizeRelayUrl(raw);
    if (currentRelays.includes(normalized)) {
      setError('Relay already in list');
      return;
    }

    setEditedRelays([...currentRelays, normalized]);
    setNewRelay('');
  }

  function removeRelay(url: string) {
    const next = currentRelays.filter((r) => r !== url);
    setEditedRelays(next);
  }

  function handlePublish() {
    if (currentRelays.length === 0) {
      setError('At least one relay is required');
      return;
    }
    publish(currentRelays, {
      onSuccess: () => {
        setEditedRelays(null);
        setError(null);
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : 'Failed to publish');
      },
    });
  }

  return (
    <div className="border-b border-gray-800/40 bg-gray-900/50 animate-fade-in">
      <div className="px-4 py-3 space-y-3">
        {/* Section header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            DM Relays
          </h3>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:text-gray-300 transition-colors"
            data-testid="settings-close"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status */}
        {!isLoading && (
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${isPublished ? 'bg-emerald-500' : 'bg-amber-500'}`}
                data-testid="relay-status-dot"
              />
              <span
                className={`text-xs ${isPublished ? 'text-gray-400' : 'font-medium text-amber-400'}`}
                data-testid="relay-status-text"
              >
                {isPublished ? 'Published — others can find you' : 'Not published'}
              </span>
            </div>
            {!isPublished && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
                Your DM relay list tells others where to send you messages.
                Without it, senders have to guess — publish to be reliably reachable.
              </p>
            )}
          </div>
        )}

        {/* Relay list */}
        {!isLoading && !isPublished && (
          <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">Defaults</p>
        )}
        <div className="space-y-1.5" data-testid="relay-list">
          {currentRelays.map((url) => (
            <div
              key={url}
              className="flex items-center justify-between rounded-lg border border-gray-800/40 bg-gray-950/50 px-3 py-2"
            >
              <span className="truncate font-mono text-xs text-gray-300">{url}</span>
              <button
                onClick={() => removeRelay(url)}
                className="ml-2 shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                title="Remove relay"
                data-testid={`remove-relay-${url}`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Add relay */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newRelay}
            onChange={(e) => { setNewRelay(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === 'Enter' && addRelay()}
            placeholder="wss://relay.example.com"
            className="flex-1 rounded-lg border border-gray-800/50 bg-gray-950/60 px-3 py-1.5
                       font-mono text-xs text-gray-200 placeholder-gray-600 outline-none
                       transition-colors focus:border-gray-700"
            data-testid="add-relay-input"
          />
          <button
            onClick={addRelay}
            disabled={!newRelay.trim()}
            className="rounded-lg border border-gray-700/40 px-3 py-1.5 text-xs text-gray-400
                       transition-colors hover:border-gray-600 hover:text-gray-200
                       disabled:opacity-30 disabled:hover:border-gray-700/40"
            data-testid="add-relay-button"
          >
            Add
          </button>
        </div>

        {/* Relay count note */}
        {(!isPublished || currentRelays.length > 3) && (
          <p className="text-[10px] text-gray-600">
            1–3 relays recommended.
          </p>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400" data-testid="settings-error">{error}</p>
        )}

        {/* Actions */}
        {(!isPublished || hasChanges) && (
          <div className="pt-1">
            <button
              onClick={handlePublish}
              disabled={isPublishing || currentRelays.length === 0}
              className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-medium text-gray-950
                         transition-all hover:bg-amber-400 active:scale-[0.98]
                         disabled:opacity-40 disabled:hover:bg-amber-500"
              data-testid="publish-relays-button"
            >
              {isPublishing ? 'Publishing...' : isPublished && hasChanges ? 'Publish changes' : 'Publish'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
