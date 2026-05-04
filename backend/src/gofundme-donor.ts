import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';

export interface DonationResult {
  success: boolean;
  donationAmountUsd: number;
  goFundMeUrl: string;
  screenshotPaths: string[];
  confirmationText?: string;
  error?: string;
}

const SCREENSHOT_DIR = '/tmp/pumpfundme-screenshots';

function ensureScreenshotDir(): void {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

async function screenshot(page: Page, label: string): Promise<string> {
  const filename = `${Date.now()}-${label}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}

/**
 * Donate to a GoFundMe campaign using Playwright browser automation.
 *
 * GoFundMe flow (as of 2026-05):
 * 1. Navigate to /donate page
 * 2. Fill donation amount (input#checkout-donation)
 * 3. Set tip to $0 via "Enter custom tip" button → number input
 * 4. Select "Credit or debit" via label click (not radio force-click)
 * 5. Fill email, first/last name, card details (all direct DOM, Braintree not Stripe)
 * 6. Submit donation
 * 7. Verify URL changes to thank-you/confirmation page
 */
export async function donateToGoFundMe(goFundMeUrl: string, amountUsd: number): Promise<DonationResult> {
  const { koloCardNumber, koloCardExpiry, koloCardCvc, koloCardName, koloCardZip, koloCardEmail } = config;

  if (!koloCardNumber || !koloCardExpiry || !koloCardCvc || !koloCardName || !koloCardEmail) {
    throw new Error('Missing KOLO_CARD_* env vars');
  }

  if (amountUsd < config.donationMinUsd) {
    return {
      success: false, donationAmountUsd: amountUsd, goFundMeUrl, screenshotPaths: [],
      error: `Amount $${amountUsd} below minimum $${config.donationMinUsd}`,
    };
  }

  ensureScreenshotDir();
  const screenshots: string[] = [];
  let browser: Browser | null = null;

  // Split name into first/last
  const nameParts = koloCardName.trim().split(/\s+/);
  const firstName = nameParts[0] || koloCardName;
  const lastName = nameParts.slice(1).join(' ') || '';

  try {
    browser = await chromium.launch({ headless: config.headlessBrowser });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1200 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    // --- Step 1: Navigate directly to donate page ---
    const donateUrl = goFundMeUrl.replace(/\/$/, '') + '/donate?source=btn_donate';
    console.log(`[donor] navigating to ${donateUrl}`);
    await page.goto(donateUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // --- Step 2: Fill donation amount ---
    console.log(`[donor] filling amount: $${amountUsd}`);
    const amountInput = page.locator('input#checkout-donation');
    await amountInput.waitFor({ state: 'visible', timeout: 10000 });
    await amountInput.click({ clickCount: 3 });
    await amountInput.fill(String(amountUsd));
    await page.waitForTimeout(500);

    // --- Step 3: Set tip to $0 ---
    console.log('[donor] setting tip to $0');
    try {
      // Click "Enter custom tip" to get the number input
      const customTipBtn = page.locator('button:has-text("Enter custom tip")');
      if (await customTipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await customTipBtn.click();
        await page.waitForTimeout(500);
      }
      // Fill the tip number input with 0
      const tipInput = page.locator('input[id*="tip" i], input[name*="tip" i]').first();
      if (await tipInput.isVisible({ timeout: 1500 }).catch(() => false)) {
        await tipInput.fill('0');
        console.log('[donor] tip set to $0');
      } else {
        // Fallback: try the range slider via JS
        const tipSlider = page.locator('input[aria-label="Tip amount"]');
        if (await tipSlider.isVisible({ timeout: 1000 }).catch(() => false)) {
          await tipSlider.evaluate((el: HTMLInputElement) => {
            el.value = '0';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
          console.log('[donor] tip slider set to 0 via JS');
        }
      }
    } catch {
      console.log('[donor] tip section not found — continuing');
    }
    await page.waitForTimeout(500);

    // --- Step 4: Select Credit or Debit via label click ---
    console.log('[donor] selecting credit/debit card');
    const cardLabel = page.locator('label:has-text("Credit or debit")');
    if (await cardLabel.isVisible({ timeout: 3000 })) {
      await cardLabel.click();
    } else {
      // Fallback to radio input
      await page.locator('input#add-card').click({ force: true });
    }
    await page.waitForTimeout(2500);

    // --- Step 5: Fill contact info ---
    console.log('[donor] filling email + name');
    await page.locator('input#email-address').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('input#email-address').fill(koloCardEmail);
    await page.locator('input#first-name').fill(firstName);
    await page.locator('input#last-name').fill(lastName);

    // --- Step 6: Fill card details (direct DOM, Braintree) ---
    console.log('[donor] filling card details');
    await page.locator('input#card-number').fill(koloCardNumber);
    await page.locator('input#card-expiration').fill(koloCardExpiry);
    await page.locator('input#card-cvv').fill(koloCardCvc);

    // Card name (may be pre-filled from first/last)
    const cardNameInput = page.locator('input#card-name');
    if (await cardNameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      const currentVal = await cardNameInput.inputValue();
      if (!currentVal) {
        await cardNameInput.fill(koloCardName);
      }
    }

    // Postal code
    if (koloCardZip) {
      const postalInput = page.locator('input#location-postal-code');
      if (await postalInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await postalInput.fill(koloCardZip);
      }
    }

    // Uncheck "save card" if checked
    const saveCard = page.locator('input#save-card');
    if (await saveCard.isVisible({ timeout: 500 }).catch(() => false)) {
      if (await saveCard.isChecked()) {
        await saveCard.uncheck();
      }
    }

    // --- Step 7: Pre-submit screenshot ---
    screenshots.push(await screenshot(page, 'pre-submit'));
    console.log('[donor] pre-submit screenshot taken');

    // Record the URL before submit
    const urlBeforeSubmit = page.url();

    // --- Step 8: Submit ---
    console.log('[donor] submitting donation...');
    const submitBtn = page.locator('button[type="submit"]:visible').first();
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // --- Step 9: Wait for URL change or confirmation ---
    console.log('[donor] waiting for confirmation...');
    let confirmationText = '';
    let donationSucceeded = false;

    // Wait up to 60s for URL to change (payment processing)
    try {
      await page.waitForURL((url) => url.toString() !== urlBeforeSubmit, { timeout: 60000 });
      donationSucceeded = true;
      confirmationText = `Donation completed (redirected to: ${page.url()})`;
    } catch {
      // URL didn't change — check if there's an error
    }

    await page.waitForTimeout(3000);
    screenshots.push(await screenshot(page, 'after-submit'));

    if (!donationSucceeded) {
      // Check for specific success indicators
      const currentUrl = page.url();
      if (currentUrl.includes('thank') || currentUrl.includes('success') || currentUrl.includes('confirm')) {
        donationSucceeded = true;
        confirmationText = `Donation completed (URL: ${currentUrl})`;
      }
    }

    if (!donationSucceeded) {
      // Check for visible errors on the page
      const errorTexts = await page.locator(
        '[class*="error" i], [role="alert"], .hrt-field-error, [data-testid*="error" i], [class*="declined" i]'
      ).evaluateAll(els =>
        els.filter(e => (e as HTMLElement).offsetParent !== null && e.textContent?.trim())
          .map(e => e.textContent!.trim().slice(0, 200))
      );

      if (errorTexts.length > 0) {
        throw new Error(`Payment errors: ${errorTexts.join(' | ')}`);
      }

      // Check body text for common payment failure indicators
      const bodyText = await page.locator('body').textContent() ?? '';
      const lowerBody = bodyText.toLowerCase();
      if (lowerBody.includes('declined') || lowerBody.includes('insufficient') || lowerBody.includes('card was not accepted')) {
        throw new Error('Card was declined');
      }

      // If no errors but URL didn't change, payment likely didn't go through
      throw new Error('Payment did not complete — URL unchanged after submit and no confirmation detected');
    }

    // Try to get better confirmation text
    if (donationSucceeded) {
      try {
        const heading = page.locator('h1, h2').first();
        if (await heading.isVisible({ timeout: 3000 }).catch(() => false)) {
          const headingText = await heading.textContent();
          if (headingText && (headingText.toLowerCase().includes('thank') || headingText.toLowerCase().includes('success'))) {
            confirmationText = headingText.trim();
          }
        }
      } catch { /* keep existing confirmationText */ }
    }

    console.log(`[donor] ✅ donation confirmed: ${confirmationText.slice(0, 100)}`);
    return { success: true, donationAmountUsd: amountUsd, goFundMeUrl, screenshotPaths: screenshots, confirmationText };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[donor] ❌ donation failed: ${error}`);
    return { success: false, donationAmountUsd: amountUsd, goFundMeUrl, screenshotPaths: screenshots, error };
  } finally {
    if (browser) await browser.close();
  }
}
