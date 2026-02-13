interface ConnectionBannerProps {
  isConnected: boolean;
  isReconnecting: boolean;
  onRetry: () => void;
}

export function ConnectionBanner({ isConnected, isReconnecting, onRetry }: ConnectionBannerProps) {
  if (isConnected) return null;

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-amber-400">
        {isReconnecting ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
        ) : (
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        )}
        <span>{isReconnecting ? 'Reconnecting...' : 'Connection lost'}</span>
      </div>
      {!isReconnecting && (
        <button
          onClick={onRetry}
          className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-amber-400
                     transition-colors hover:bg-amber-500/15 hover:text-amber-300"
          data-testid="retry-connection"
        >
          Retry
        </button>
      )}
    </div>
  );
}
