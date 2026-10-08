import { expect } from '@playwright/test';
import { test } from './fixtures/signedInUser';

test('resets identified browser telemetry when an expired session becomes a Visitor without remounting', async ({ page, signedInUser }) => {
  await page.addInitScript(() => {
    localStorage.setItem('daily.onboarding.v1', 'seen');
    localStorage.setItem('daily.cookieConsent.v1', JSON.stringify({ analytics: 'accepted', updatedAt: Date.now() }));
  });
  await page.goto('/');
  let resource: string | undefined;
  await expect.poll(async () => {
    resource = await page.evaluate(() => performance.getEntriesByType('resource').find(entry => entry.name.includes('/.vite/deps/posthog-js.js'))?.name);
    return resource;
  }).toBeTruthy();
  await page.addScriptTag({ type: 'module', content:
    'import posthog from ' + JSON.stringify(resource) + '; import {invalidateAll} from "/node_modules/@sveltejs/kit/src/runtime/app/navigation.js"; window.identityVerification={identified:()=>posthog.get_property("$user_id"),distinct:()=>posthog.get_distinct_id(),invalidate:invalidateAll};'
  });
  const identity = () => page.evaluate(() => (window as unknown as { identityVerification: { identified(): string | undefined } }).identityVerification?.identified());
  await expect.poll(identity).toBe(signedInUser.userId);
  await page.context().clearCookies();
  await page.evaluate(() => (window as unknown as { identityVerification: { invalidate(): Promise<void> } }).identityVerification.invalidate());
  await expect(page.getByLabel('Open account menu')).toHaveCount(0);
  await expect.poll(identity).toBeUndefined();
  expect(await page.evaluate(() => (window as unknown as { identityVerification: { distinct(): string } }).identityVerification.distinct()))
    .not.toBe(signedInUser.userId);
});
