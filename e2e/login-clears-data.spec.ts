import { test, expect } from '@playwright/test';
import { generateUser, loginWithNsec, logout } from './helpers';

test.describe('Login clears previous user data', () => {
  test('new login without logout clears previous user conversations', async ({ page }) => {
    const userA = generateUser();
    const userB = generateUser();
    const userC = generateUser();

    // User A logs in and sends a message to User C
    await loginWithNsec(page, userA.nsec);
    await page.getByTestId('new-conversation-button').click();
    await page.getByTestId('new-conversation-input').fill(userC.npub);
    await page.getByTestId('new-conversation-start').click();

    const message = `Secret from A ${Date.now()}`;
    await page.getByTestId('compose-input').fill(message);
    await page.getByTestId('send-button').click();
    await expect(page.getByTestId('message-list')).toContainText(message);

    // User A logs out, then User B logs in on the same browser (same IndexedDB)
    await logout(page);

    await loginWithNsec(page, userB.nsec);

    // User B should NOT see User A's conversation
    await expect(page.getByTestId('conversation-list')).not.toContainText(message, {
      timeout: 3_000,
    });

    // The conversation list should be empty for User B
    const conversations = page.getByTestId('conversation-list').locator('[data-testid^="conversation-"]');
    await expect(conversations).toHaveCount(0);
  });
});
