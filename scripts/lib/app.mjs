/**
 * Shared browser helpers for the harnesses.
 *
 * These exist because the same UI change has broken five scripts at once, more
 * than once: renaming the login field broke them all, and so did dropping the
 * word "streak" from the header. One copy of "how do you sign in" and "how do
 * you know the app has loaded" is one place to fix.
 */

/** The app has rendered its day view. A stable hook, never user-visible copy. */
export const READY = '[data-testid=day-header]';

export async function waitForApp(page, timeout = 20_000) {
  await page.waitForSelector(READY, { timeout });
}

/**
 * Sign in with either kind of code. The name field only appears once the server
 * says this is a first-time invite, so it is waited for rather than assumed.
 */
export async function signIn(page, code, name) {
  await page.getByLabel('Code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();

  const nameField = page.getByLabel('Your name');
  if (name) {
    await nameField.waitFor({ timeout: 10_000 });
    await nameField.fill(name);
    await page.getByRole('button', { name: 'Join' }).click();
  }
  await waitForApp(page);
}

/** Waits for a URL to answer, for scripts that spawn their own servers. */
export async function waitForUrl(url, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`never came up: ${url}`);
}
