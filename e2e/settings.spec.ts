import { test, expect } from '@playwright/test';
import { generateUser, loginWithNsec } from './helpers';

test.describe('Settings', () => {
  test('toggle settings panel', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    await page.getByTestId('settings-button').click();
    await expect(page.getByTestId('relay-list')).toBeVisible();

    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('relay-list')).not.toBeVisible();
  });

  test('relay list shows default relays', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    await page.getByTestId('settings-button').click();
    const relayList = page.getByTestId('relay-list');

    await expect(relayList).toContainText('localhost:8080');
  });

  test('new user sees not published status', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    await page.getByTestId('settings-button').click();
    await expect(page.getByTestId('relay-status-text')).toContainText('Not published');
  });
});
