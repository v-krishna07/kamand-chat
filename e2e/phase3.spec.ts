import { test, expect } from '@playwright/test';

test('Phase 3 E2E: Structured IIT Mandi community, announcement-only restriction, channel messaging, and threaded replies across two users', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  // 1. User A signs in as @aravind (admin in IIT Mandi community)
  await pageA.goto('/');
  await pageA.getByRole('button', { name: '@aravind' }).click();
  await pageA.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 2. User B signs in as @priya (member in IIT Mandi community)
  await pageB.goto('/');
  await pageB.getByRole('button', { name: '@priya' }).click();
  await pageB.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  // 3. Both switch to the Groups (Communities) tab
  await pageA.getByRole('tab', { name: /Groups/i }).click();
  await pageB.getByRole('tab', { name: /Groups/i }).click();

  // 4. Verify Priya sees read-only notice on #announcements channel
  await pageB.getByRole('button', { name: 'announcements' }).click();
  await expect(
    pageB.getByText(/Only moderators, admins, and owners can post in this announcement channel/i)
  ).toBeVisible();

  // 5. Both open #kamand-prompt channel
  await pageA.getByRole('button', { name: 'kamand-prompt' }).click();
  await pageB.getByRole('button', { name: 'kamand-prompt' }).click();

  const channelMsg = `Kamand Prompt Sprint Check-in [${Date.now()}]`;
  await pageA.getByPlaceholder('Message #kamand-prompt…').fill(channelMsg);
  await pageA.getByRole('button', { name: 'Send channel message' }).click();

  await expect(pageB.getByText(channelMsg)).toBeVisible();

  // 6. Priya opens the thread on the seeded root message and posts a reply
  await pageB.getByRole('button', { name: /thread reply|Reply in thread/i }).first().click();
  const threadReplyText = `Thread reply from Priya [${Date.now()}]`;
  await pageB.getByPlaceholder('Reply to thread…').fill(threadReplyText);
  await pageB.getByRole('button', { name: 'Reply', exact: true }).click();

  await expect(pageB.getByText(threadReplyText)).toBeVisible();

  await contextA.close();
  await contextB.close();
});
