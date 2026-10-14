import { test, expect } from '@playwright/test';

test('Phase 9 E2E: Admin Console, Zero-Knowledge E2EE Invariant, Moderation Queue, Rich Message Actions & Local Search', async ({
  page,
}) => {
  // 1. Log in as a regular student (@aravind)
  await page.goto('/');
  await page.getByRole('button', { name: '@aravind' }).click();
  await page.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 2. Verify regular user does NOT see the Admin tab in Sidebar
  await expect(page.getByRole('tab', { name: 'Admin' })).toHaveCount(0);

  // 3. Open conversation with Priya Nair
  await page.getByText('Priya Nair').first().click();
  await expect(page.getByRole('heading', { name: 'Priya Nair' })).toBeVisible();

  // 4. Test client-side message search
  await page.getByRole('button', { name: 'Search messages in this conversation' }).click();
  await page.getByLabel('Search conversation messages').fill('Oak Mess');
  await expect(page.getByText(/match/i)).toBeVisible();
  await page.getByRole('button', { name: 'Close search' }).click();

  // 5. Submit an abuse report to the moderation queue with voluntary evidence
  await page.getByRole('button', { name: 'Report conversation to moderation' }).click();
  await page.getByPlaceholder(/Describe the issue/i).fill('Testing moderation reporting in E2E');
  await page.getByRole('button', { name: 'Submit Report' }).click();
  await expect(page.getByText(/Report successfully submitted/i)).toBeVisible();

  // 6. Sign out
  await page.getByRole('button', { name: 'Sign out' }).click();

  // 7. Log in as Campus Administrator (@admin)
  await page.getByRole('button', { name: '@admin' }).click();
  await page.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 8. Admin tab is visible and clickable
  const adminTab = page.getByRole('tab', { name: 'Admin' });
  await expect(adminTab).toBeVisible();
  await adminTab.click();

  // 9. Verify Zero-Knowledge Invariant Banner and System Overview Stats
  await expect(page.getByText(/Zero-Knowledge E2EE Enforcement/i)).toBeVisible();
  await expect(page.getByText(/Connector Health/i)).toBeVisible();

  // 10. Check Reports Queue tab
  await page.getByRole('button', { name: /Reports Queue/i }).click();
  await expect(page.getByText('Testing moderation reporting in E2E')).toBeVisible();

  // 11. Resolve the report
  await page.getByRole('button', { name: 'Resolve', exact: true }).first().click();
  await expect(page.getByText('RESOLVED').first()).toBeVisible();

  // 12. Check Users tab
  await page.getByRole('button', { name: /Users \(/i }).click();
  await expect(page.getByText('Aravind Sharma')).toBeVisible();
});
