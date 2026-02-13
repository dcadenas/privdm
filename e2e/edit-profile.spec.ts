import { test, expect } from '@playwright/test';
import { generateUser, loginWithNsec } from './helpers';

test.describe('Edit profile', () => {
  test('opens edit profile dialog from account menu', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('edit-profile-button').click();

    await expect(page.getByTestId('edit-profile-backdrop')).toBeVisible();
    await expect(page.getByText('Edit profile')).toBeVisible();
  });

  test('closes dialog on cancel', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('edit-profile-button').click();
    await expect(page.getByTestId('edit-profile-backdrop')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('edit-profile-backdrop')).not.toBeVisible();
  });

  test('closes dialog on backdrop click', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('edit-profile-button').click();

    // Click the backdrop (not the dialog content)
    await page.getByTestId('edit-profile-backdrop').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('edit-profile-backdrop')).not.toBeVisible();
  });

  test('saves profile and updates sidebar display name', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    // Open edit profile
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('edit-profile-button').click();

    // Fill in display name
    const displayName = `TestUser_${Date.now()}`;
    await page.getByLabel('Display Name').fill(displayName);
    await page.getByLabel('Username').fill('testuser');

    // Save
    await page.getByTestId('save-profile-button').click();

    // Dialog should close
    await expect(page.getByTestId('edit-profile-backdrop')).not.toBeVisible({ timeout: 10_000 });

    // Sidebar should show the new display name
    await expect(page.getByTestId('account-menu-trigger')).toContainText(displayName, {
      timeout: 5_000,
    });
  });

  test('profile persists on relay and is fetched on re-login', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    const displayName = `Persist_${Date.now()}`;

    // Set profile
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('edit-profile-button').click();
    await page.getByLabel('Display Name').fill(displayName);
    await page.getByTestId('save-profile-button').click();
    await expect(page.getByTestId('edit-profile-backdrop')).not.toBeVisible({ timeout: 10_000 });

    // Logout and re-login (nsec sessions aren't persisted across reload)
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('account-sign-out').click();
    await loginWithNsec(page, user.nsec);

    // Display name should be fetched from relay
    await expect(page.getByTestId('account-menu-trigger')).toContainText(displayName, {
      timeout: 10_000,
    });
  });

  test('edit profile preserves existing fields', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    // Set initial profile with multiple fields
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('edit-profile-button').click();
    await page.getByLabel('Display Name').fill('Original Name');
    await page.getByLabel('About').fill('Original bio');
    await page.getByTestId('save-profile-button').click();
    await expect(page.getByTestId('edit-profile-backdrop')).not.toBeVisible({ timeout: 10_000 });

    // Re-open and verify fields are populated
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('edit-profile-button').click();
    await expect(page.getByLabel('Display Name')).toHaveValue('Original Name');
    await expect(page.getByLabel('About')).toHaveValue('Original bio');

    // Change only display name
    await page.getByLabel('Display Name').fill('Updated Name');
    await page.getByTestId('save-profile-button').click();
    await expect(page.getByTestId('edit-profile-backdrop')).not.toBeVisible({ timeout: 10_000 });

    // Re-open and verify about was preserved
    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('edit-profile-button').click();
    await expect(page.getByLabel('Display Name')).toHaveValue('Updated Name');
    await expect(page.getByLabel('About')).toHaveValue('Original bio');
  });

  test('other user sees updated profile', async ({ browser }) => {
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

      // User A sets their display name
      const displayName = `UserA_${Date.now()}`;
      await pageA.getByTestId('account-menu-trigger').click();
      await pageA.getByTestId('edit-profile-button').click();
      await pageA.getByLabel('Display Name').fill(displayName);
      await pageA.getByTestId('save-profile-button').click();
      await expect(pageA.getByTestId('edit-profile-backdrop')).not.toBeVisible({ timeout: 10_000 });

      // User A sends a message to User B so they can see the profile
      await pageA.getByTestId('new-conversation-button').click();
      await pageA.getByTestId('new-conversation-input').fill(userB.npub);
      await pageA.getByTestId('new-conversation-start').click();
      const message = `Hello ${Date.now()}`;
      await pageA.getByTestId('compose-input').fill(message);
      await pageA.getByTestId('send-button').click();

      // User B receives the message and sees User A's display name
      await expect(pageB.getByTestId('conversation-list')).toContainText(displayName, {
        timeout: 15_000,
      });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
