import { test, expect } from '@playwright/test';
import { generateUser, loginWithNsec, logout } from './helpers';

test.describe('Login', () => {
  test('nsec login navigates to chat view', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);

    await expect(page.getByTestId('settings-button')).toBeVisible();
    await expect(page.getByTestId('conversation-list')).toBeVisible();
  });

  test('invalid nsec shows error', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /nsec/i }).click();
    await page.getByTestId('nsec-input').fill('nsec1invalid');
    await page.getByTestId('login-button').click();

    await expect(page.getByTestId('login-error')).toBeVisible();
  });

  test('logout returns to login screen', async ({ page }) => {
    const user = generateUser();
    await loginWithNsec(page, user.nsec);
    await logout(page);

    await expect(page.getByTestId('divine-login-button')).toBeVisible();
  });
});
