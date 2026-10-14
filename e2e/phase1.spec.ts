import { test, expect } from '@playwright/test';

test('Phase 1 E2E: Two users sign in, start a 1:1 chat, exchange real-time messages, reload to verify persistence, and sign out', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // 1. User A signs in using seeded @aravind account
  await pageA.goto('/');
  await pageA.getByRole('button', { name: '@aravind' }).click();
  await pageA.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();
  await expect(pageA.getByText('Aravind Sharma')).toBeVisible();

  // 2. User B signs in using seeded @priya account
  await pageB.goto('/');
  await pageB.getByRole('button', { name: '@priya' }).click();
  await pageB.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();
  await expect(pageB.getByText('Priya Nair')).toBeVisible();

  // 3. Both open their 1:1 conversation
  await pageA.getByText('Priya Nair').first().click();
  await pageB.getByText('Aravind Sharma').first().click();

  // 4. User A sends a real-time message to User B
  const uniqueMessage = `Live E2E ping at B-19 [${Date.now()}]`;
  await pageA.getByPlaceholder('Message Priya Nair…').fill(uniqueMessage);
  await pageA.getByRole('button', { name: 'Send message' }).click();

  // Verify instant delivery on both User A and User B without reload
  await expect(pageA.getByText(uniqueMessage)).toBeVisible();
  await expect(pageB.getByText(uniqueMessage)).toBeVisible();

  // 5. Reload User B and confirm session + message persistence
  await pageB.reload();
  await pageB.getByText('Aravind Sharma').first().click();
  await expect(pageB.getByText(uniqueMessage)).toBeVisible();

  // 6. Sign out User A
  await pageA.getByRole('button', { name: 'Sign out' }).click();
  await expect(pageA.getByRole('button', { name: 'Sign In to Kamand Chat' })).toBeVisible();

  await contextA.close();
  await contextB.close();
});
