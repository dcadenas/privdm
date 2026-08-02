/**
 * NIP-07 extensions run their signing logic in a Manifest V3 service worker,
 * which Chrome shuts down after ~30s idle. `window.nostr` stays injected, so a
 * call can reach the content script and then fail with a raw `chrome.runtime`
 * error while the worker is restarting. Retrying wakes it up.
 */
const WAKEUP_PATTERNS = [
  'could not establish connection',
  'receiving end does not exist',
  'message port closed',
  'extension context invalidated',
];

const WAKEUP_MESSAGE =
  'The signing extension did not respond (it may have been asleep). Try again.';

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return '';
}

export function isExtensionAsleepError(err: unknown): boolean {
  const text = errorText(err).toLowerCase();
  return WAKEUP_PATTERNS.some((pattern) => text.includes(pattern));
}

export function extensionErrorMessage(err: unknown): string {
  if (isExtensionAsleepError(err)) return WAKEUP_MESSAGE;
  return errorText(err) || 'Login failed';
}

interface RetryOptions {
  attempts?: number;
  delayMs?: number;
}

/** Runs `fn`, retrying only while the extension looks like a cold service worker. */
export async function withExtensionWakeupRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, delayMs = 400 }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isExtensionAsleepError(err)) throw err;
      lastError = err;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}
