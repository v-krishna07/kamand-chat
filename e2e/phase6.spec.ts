import { test, expect } from '@playwright/test';

test('Phase 6 E2E: Open Opt-In AI Assistant in chat, inspect "What will be shared" preview, generate conversation summary, and use Private Ask AI', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '@aravind' }).click();
  await page.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 1. Open 1:1 conversation with Priya Nair
  await page.getByText('Priya Nair').first().click();

  // 2. Click "AI Assist" button -> Verify explicit consent preview modal opens
  await page.getByRole('button', { name: 'Open AI Assistant' }).click();
  await expect(page.getByText('What will be shared with AI')).toBeVisible();
  await expect(page.getByLabel('What will be shared preview')).toBeVisible();

  // 3. Click "Consent & Share" to summarize selected messages
  await page.getByRole('button', { name: /Consent & Share/i }).click();
  await expect(page.getByText(/Meeting Plan/i)).toBeVisible();

  // 4. Switch to Smart Replies and insert a one-tap reply into the composer
  await page.getByRole('button', { name: 'Smart Replies' }).click();
  await page.getByRole('button', { name: /Consent & Share/i }).click();
  await page.getByRole('button', { name: /On my way to B-19 in 5 mins!/i }).click();

  await expect(page.getByPlaceholder(/Message Priya Nair/i)).toHaveValue(
    'On my way to B-19 in 5 mins!'
  );

  // 5. Open Private "Ask AI" tab in Sidebar and ask a question
  await page.getByRole('tab', { name: /Ask AI/i }).click();
  await page.getByPlaceholder('Ask Kamand AI anything…').fill('Summarize our hackathon checklist');
  await page.getByRole('button', { name: 'Send to Ask AI' }).click();
  await expect(page.getByText(/First Commit hackathon at IIT Mandi/i)).toBeVisible();
});
