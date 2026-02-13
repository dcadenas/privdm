import { test, expect } from '@playwright/test';
import { generateUser, loginWithNsec } from './helpers';

test.describe('Two-user messaging', () => {
  test('real-time message delivery between two users', async ({ browser }) => {
    const userA = generateUser();
    const userB = generateUser();

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // Login both users in parallel
      await Promise.all([
        loginWithNsec(pageA, userA.nsec),
        loginWithNsec(pageB, userB.nsec),
      ]);

      // User A starts conversation with User B
      await pageA.getByTestId('new-conversation-button').click();
      await pageA.getByTestId('new-conversation-input').fill(userB.npub);
      await pageA.getByTestId('new-conversation-start').click();

      // User A sends a message
      const message = `Hello from A! ${Date.now()}`;
      await pageA.getByTestId('compose-input').fill(message);
      await pageA.getByTestId('send-button').click();

      // Optimistic: message appears instantly for User A
      await expect(pageA.getByTestId('message-list')).toContainText(message);

      // User B receives the message via relay
      await expect(pageB.getByTestId('conversation-list')).toContainText(message, {
        timeout: 10_000,
      });

      // User B clicks into the conversation
      await pageB
        .getByTestId('conversation-list')
        .locator('[data-testid^="conversation-"]')
        .first()
        .click();
      await expect(pageB.getByTestId('message-list')).toContainText(message);

      // User B replies
      const reply = `Hi from B! ${Date.now()}`;
      await pageB.getByTestId('compose-input').fill(reply);
      await pageB.getByTestId('send-button').click();

      // Optimistic: reply appears instantly for User B
      await expect(pageB.getByTestId('message-list')).toContainText(reply);

      // User A receives the reply via relay
      await expect(pageA.getByTestId('message-list')).toContainText(reply, {
        timeout: 10_000,
      });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
