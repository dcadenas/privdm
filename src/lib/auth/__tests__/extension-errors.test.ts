import { describe, it, expect, vi } from 'vitest';
import {
  isExtensionAsleepError,
  extensionErrorMessage,
  withExtensionWakeupRetry,
} from '../extension-errors';

const asleep = new Error('Could not establish connection. Receiving end does not exist.');

describe('isExtensionAsleepError', () => {
  it('detects the Chrome service worker wakeup error', () => {
    expect(isExtensionAsleepError(asleep)).toBe(true);
  });

  it('detects a closed message port', () => {
    expect(
      isExtensionAsleepError(new Error('The message port closed before a response was received.')),
    ).toBe(true);
  });

  it('detects an invalidated extension context', () => {
    expect(isExtensionAsleepError(new Error('Extension context invalidated.'))).toBe(true);
  });

  it('accepts a plain string rejection', () => {
    expect(isExtensionAsleepError('Receiving end does not exist')).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isExtensionAsleepError(new Error('User rejected the request'))).toBe(false);
  });
});

describe('withExtensionWakeupRetry', () => {
  it('returns the value when the first attempt succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('pubkey');
    await expect(withExtensionWakeupRetry(fn, { delayMs: 0 })).resolves.toBe('pubkey');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries while the extension is still waking up', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(asleep)
      .mockRejectedValueOnce(asleep)
      .mockResolvedValue('pubkey');
    await expect(withExtensionWakeupRetry(fn, { delayMs: 0 })).resolves.toBe('pubkey');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after the attempt budget and rethrows', async () => {
    const fn = vi.fn().mockRejectedValue(asleep);
    await expect(
      withExtensionWakeupRetry(fn, { delayMs: 0, attempts: 3 }),
    ).rejects.toThrow(asleep);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry unrelated errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('User rejected the request'));
    await expect(withExtensionWakeupRetry(fn, { delayMs: 0 })).rejects.toThrow(
      'User rejected the request',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('extensionErrorMessage', () => {
  it('replaces the raw Chrome message with actionable text', () => {
    const message = extensionErrorMessage(asleep);
    expect(message).not.toContain('Receiving end');
    expect(message).toMatch(/extension/i);
  });

  it('passes other errors through unchanged', () => {
    expect(extensionErrorMessage(new Error('User rejected the request'))).toBe(
      'User rejected the request',
    );
  });

  it('falls back for non-Error values', () => {
    expect(extensionErrorMessage(undefined)).toBe('Login failed');
  });
});
