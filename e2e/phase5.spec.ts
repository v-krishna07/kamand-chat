import { test, expect } from '@playwright/test';

test('Phase 5 E2E: Two browser contexts initiate a 1:1 E2EE call, accept on full-screen incoming sheet, toggle PiP, hang up, and verify call log in chat', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto('/');
  await pageA.getByRole('button', { name: '@aravind' }).click();
  await pageA.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  await pageB.goto('/');
  await pageB.getByRole('button', { name: '@priya' }).click();
  await pageB.getByRole('button', { name: 'Sign In to Kamand Chat' }).click();

  await pageA.getByText('Priya Nair').first().click();
  await pageB.getByText('Aravind Sharma').first().click();

  // 1. Aravind opens pre-call device check and starts an E2EE video call
  await pageA.getByRole('button', { name: 'Start video call' }).click();
  await expect(pageA.getByText(/Ready to Call Priya Nair\?/i)).toBeVisible();
  await pageA.getByRole('button', { name: 'Start E2EE Call' }).click();

  // 2. Priya sees the full-screen incoming call sheet and accepts
  await expect(pageB.getByRole('dialog', { name: 'Incoming call' })).toBeVisible();
  await pageB.getByRole('button', { name: 'Accept call' }).click();

  // 3. Both see the active Insertable Streams E2EE call stage
  await expect(pageA.getByText(/Insertable Streams E2EE/i)).toBeVisible();
  await expect(pageB.getByText(/Insertable Streams E2EE/i)).toBeVisible();

  // 4. Aravind switches to Picture-in-Picture mode and back
  await pageA.getByRole('button', { name: 'Minimize to Picture-in-Picture' }).click();
  await expect(pageA.getByRole('region', { name: 'Picture in Picture Call' })).toBeVisible();
  await pageA.getByRole('button', { name: 'Expand call' }).click();

  // 5. Aravind ends the call -> both return to chat and see the CallLog entry in the message stream
  await pageA.getByRole('button', { name: 'End call' }).click();
  await expect(pageA.getByText(/Video call ·/i).last()).toBeVisible();
  await expect(pageB.getByText(/Video call ·/i).last()).toBeVisible();

  await contextA.close();
  await contextB.close();
});
