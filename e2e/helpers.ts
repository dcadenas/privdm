import type { Page } from '@playwright/test';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';

export interface TestUser {
  nsec: string;
  npub: string;
  pubkey: string;
}

export function generateUser(): TestUser {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  return {
    nsec: nip19.nsecEncode(sk),
    npub: nip19.npubEncode(pubkey),
    pubkey,
  };
}

export async function loginWithNsec(page: Page, nsec: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /nsec/i }).click();
  await page.getByTestId('nsec-input').fill(nsec);
  await page.getByTestId('login-button').click();
  await page.getByTestId('settings-button').waitFor({ timeout: 15_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.getByTestId('account-menu-trigger').click();
  await page.getByTestId('account-sign-out').click();
  await page.getByTestId('divine-login-button').waitFor({ timeout: 5_000 });
}
