import { test, expect } from '@playwright/test';
import { generateUser, loginWithNsec } from './helpers';

test.describe('Unread indicators', () => {
  test('unread dot appears on receive and disappears on read', async ({ browser }) => {
    const userA = generateUser();
    const userB = generateUser();

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await Promise.all([
        loginWithNsec(pageA, userA.nsec),
        loginWithNsec(pageB, userB.nsec),
      ]);

      // User A starts conversation with User B and sends a message
      await pageA.getByTestId('new-conversation-button').click();
      await pageA.getByTestId('new-conversation-input').fill(userB.npub);
      await pageA.getByTestId('new-conversation-start').click();

      const message = `Unread test ${Date.now()}`;
      await pageA.getByTestId('compose-input').fill(message);
      await pageA.getByTestId('send-button').click();

      // User B sees the conversation appear with an unread dot
      await expect(pageB.getByTestId('conversation-list')).toContainText(message, {
        timeout: 10_000,
      });
      const conversationItem = pageB
        .getByTestId('conversation-list')
        .locator('[data-testid^="conversation-"]')
        .first();
      await expect(conversationItem.getByTestId('unread-dot')).toBeVisible();

      // User B clicks into the conversation — unread dot disappears
      await conversationItem.click();
      await expect(pageB.getByTestId('message-list')).toContainText(message);
      await expect(conversationItem.getByTestId('unread-dot')).not.toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
