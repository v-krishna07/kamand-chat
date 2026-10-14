import { test, expect } from '@playwright/test';

test('Phase 7 E2E: Open Campus Hub, connect Moodle LMS with consent, view deadlines, disconnect to purge cache, and query Grounded Campus AI', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '@aravind' }).click();
  await page.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 1. Navigate to Campus tab
  await page.getByRole('tab', { name: /Campus/i }).click();
  await expect(page.getByText('IIT Mandi Campus Hub')).toBeVisible();
  await expect(page.getByText(/B23101/i)).toBeVisible();

  // 2. Initially Moodle widget is hidden until connected
  await expect(page.getByTestId('moodle-dashboard-widget')).toHaveCount(0);

  // 3. Connect Moodle with explicit consent
  await page.getByRole('button', { name: 'Connect Moodle' }).click();
  await expect(page.getByText('What is read from your Moodle account:')).toBeVisible();
  await page.getByRole('button', { name: 'Consent & Connect Moodle LMS' }).click();

  // 4. Verify Moodle deadlines and courses appear
  await expect(page.getByTestId('moodle-dashboard-widget')).toBeVisible();
  await expect(page.getByText(/IC-152 · Computing and Data Science/i)).toBeVisible();

  // 5. Ask Grounded Campus AI about Pine Mess
  await page
    .getByPlaceholder(/Ask about Pine Mess menu/i)
    .fill('What is served at Pine Mess?');
  await page.getByRole('button', { name: 'Ask Campus AI' }).click();
  await expect(page.getByText(/Paneer Butter Masala/i).first()).toBeVisible();

  // 6. Click "Disconnect & Delete Cache" -> Moodle widget hides immediately
  await page.getByRole('button', { name: 'Disconnect & Delete Cache' }).click();
  await expect(page.getByTestId('moodle-dashboard-widget')).toHaveCount(0);
});
