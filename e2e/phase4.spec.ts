import { test, expect } from '@playwright/test';

test('Phase 4 E2E: Google OAuth login, E2EE Safety Number verification, and PIN-wrapped key backup in Security settings', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // 1. User A signs in with seeded @aravind
  await pageA.goto('/');
  await pageA.getByRole('button', { name: '@aravind' }).click();
  await pageA.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();
  await expect(pageA.getByText('Aravind Sharma')).toBeVisible();

  // 2. User B signs in via Google OAuth shortcut
  await pageB.goto('/');
  await pageB.getByRole('button', { name: /Google \(@iitmandi\)/i }).click();
  await expect(pageB.getByRole('tab', { name: /Chats/i })).toBeVisible();

  // 3. User A opens conversation with Priya and verifies E2EE Banner & Safety Number
  await pageA.getByText('Priya Nair').first().click();
  await expect(pageA.getByText(/Messages are end-to-end encrypted/i)).toBeVisible();

  // 4. Open Safety Number verification sheet
  await pageA.getByRole('button', { name: /Safety Number/i }).click();
  await expect(pageA.getByText(/Compare this 60-digit Safety Number/i)).toBeVisible();
  // Close Safety Number sheet
  await pageA.keyboard.press('Escape');

  // 5. Open Security & E2EE Devices Sheet from sidebar
  await pageA.getByRole('button', { name: 'Security, E2EE Keys & Devices' }).click();
  await expect(pageA.getByText(/Active \(ECDH P-256 \+ AES-256-GCM\)/i)).toBeVisible();
  await expect(pageA.getByText(/Active Sessions/i)).toBeVisible();

  // 6. Save a PIN-wrapped private key backup
  await pageA.getByPlaceholder(/Enter 4\+ digit backup PIN/i).fill('1234');
  await pageA.getByRole('button', { name: 'Backup Keys' }).click();
  await expect(pageA.getByText(/Wrapped private key backup saved!/i)).toBeVisible();

  await contextA.close();
  await contextB.close();
});
