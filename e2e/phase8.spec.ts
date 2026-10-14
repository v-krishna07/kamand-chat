import { test, expect } from '@playwright/test';

test('Phase 8 E2E: Tap B-19 room chip in chat to open Campus Map, search "A-12", toggle step-free route, and share walking ETA back to chat', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '@aravind' }).click();
  await page.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 1. Open conversation with Priya Nair and tap the B-19 room chip inside a message bubble
  await page.getByText('Priya Nair').first().click();
  await page.getByRole('button', { name: 'B-19' }).first().click();

  // 2. Verify Campus Map opens with B-19 selected
  await expect(page.getByRole('img', { name: 'IIT Mandi Interactive Campus Map' })).toBeVisible();

  // 3. Search "A-12" in the map search bar -> route updates to Hostel A-12
  await page.getByLabel('Search campus map').fill('A-12');
  await expect(page.getByText(/Hostel A-12/i).first()).toBeVisible();
  await expect(page.getByText(/min walk/i)).toBeVisible();

  // 4. Toggle Step-Free accessible routing
  await page.getByRole('button', { name: 'Step-Free' }).click();
  await expect(page.getByText('Step-Free Accessible')).toBeVisible();

  // 5. Click "Share My ETA" -> posts walking ETA to chat and navigates back to conversation
  await page.getByRole('button', { name: 'Share My ETA' }).click();
  await expect(page.getByText(/Walking to Hostel A-12/i).last()).toBeVisible();
});
