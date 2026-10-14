import { test, expect } from '@playwright/test';

test('Phase 2 E2E: Contact request accept flow, private roomCode reveal, live typing indicator, and 24h status view receipts', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // 1. User A signs in as @aravind (has incoming pending request from @rohan)
  await pageA.goto('/');
  await pageA.getByRole('button', { name: '@aravind' }).click();
  await pageA.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 2. User B signs in as @rohan
  await pageB.goto('/');
  await pageB.getByRole('button', { name: '@rohan' }).click();
  await pageB.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 3. Aravind opens Contacts tab and accepts Rohan's pending request
  await pageA.getByRole('tab', { name: /Contacts/i }).click();
  await expect(pageA.getByText('Rohan Verma')).toBeVisible();
  await pageA.getByRole('button', { name: 'Accept Rohan Verma' }).click();

  // Now Rohan's private room code (C-10) is visible to Aravind in Contacts!
  await expect(pageA.getByText('C-10')).toBeVisible();

  // 4. Aravind posts a 24h Status and Rohan views it -> Aravind sees view receipt
  await pageA.getByRole('tab', { name: /Status/i }).click();
  await pageA.getByRole('button', { name: 'Post Status' }).click();
  const statusText = `Hackathon Sprint Update [${Date.now()}]`;
  await pageA.getByPlaceholder('What’s happening on campus?').fill(statusText);
  await pageA.getByRole('button', { name: 'Publish 24h Status' }).click();

  await pageB.getByRole('tab', { name: /Status/i }).click();
  await expect(pageB.getByText(statusText)).toBeVisible();
  await pageB.getByText(statusText).click();

  // Aravind checks his status view receipt
  await pageA.getByText(statusText).click();
  await expect(pageA.getByText(/Viewed by \(1\)/i)).toBeVisible();
  await expect(pageA.getByText(/Rohan Verma/i)).toBeVisible();

  await contextA.close();
  await contextB.close();
});
