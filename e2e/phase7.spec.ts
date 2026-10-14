import { test, expect } from '@playwright/test';

test('Phase 7 E2E: Navigate to Campus Tab, view Today Dashboard, inspect Valley Buses, check Mess Menu, and ask Grounded Campus AI with Citations', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '@aravind' }).click();
  await page.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 1. Click Campus Tab in navigation bar
  await page.getByRole('tab', { name: 'Campus' }).click();
  await expect(page.getByText('IIT Mandi Campus')).toBeVisible();

  // 2. Verify Today Dashboard Hero Cards
  await expect(page.getByText(/Next Class Today/i)).toBeVisible();
  await expect(page.getByText(/Next Bus/i)).toBeVisible();
  await expect(page.getByText(/Mess Meal/i)).toBeVisible();

  // 3. Switch to Buses & Commute Tab
  await page.getByRole('button', { name: 'Buses & Commute' }).click();
  await expect(page.getByText('North Campus → South Campus')).toBeVisible();
  await expect(page.getByText('South Campus → North Campus')).toBeVisible();

  // 4. Switch to Mess Menu Tab
  await page.getByRole('button', { name: 'Mess Menu' }).click();
  await expect(page.getByText('Oak Mess')).toBeVisible();
  await expect(page.getByText(/breakfast|lunch|dinner/i).first()).toBeVisible();

  // 5. Switch to Campus AI (Citations) Tab and ask grounded campus question
  await page.getByRole('button', { name: /Campus AI/i }).click();
  await page.getByPlaceholder(/Ask about IIT Mandi buses/i).fill('Tell me about the electric buses in Kamand');
  await page.getByRole('button', { name: 'Ask' }).click();

  // 6. Verify Grounded AI Answer & Citations are visible
  await expect(page.getByText(/Electric buses run regularly between North Campus/i)).toBeVisible();
  await expect(page.getByText(/IIT Mandi Transit & Electric Bus Schedule/i)).toBeVisible();
});
