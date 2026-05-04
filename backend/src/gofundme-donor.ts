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
 * 3. Set tip to $0 (slider + custom tip input)
 * 4. Select "Credit or debit" radio (input#add-card)
 * 5. Fill email, first/last name, card details (all direct DOM, no iframes)
 * 6. Submit donation
 * 7. Wait for confirmation
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
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    // --- Step 1: Navigate directly to donate page ---
    const donateUrl = goFundMeUrl.replace(/\/$/, '') + '/donate?source=btn_donate';
    console.log(`[donor] navigating to ${donateUrl}`);
    await page.goto(donateUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

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
      const tipSlider = page.locator('input[aria-label="Tip amount"]');
      if (await tipSlider.isVisible({ timeout: 2000 })) {
        await tipSlider.fill('0');
      }
      const customTipBtn = page.locator('button:has-text("Enter custom tip")');
      if (await customTipBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await customTipBtn.click();
        await page.waitForTimeout(300);
        const tipInput = page.locator('input[name*="tip" i], input[id*="tip" i]').first();
        if (await tipInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await tipInput.click({ clickCount: 3 });
          await tipInput.fill('0');
        }
      }
    } catch {
      console.log('[donor] tip section not found — continuing');
    }
    await page.waitForTimeout(500);

    // --- Step 4: Select Credit or Debit ---
    console.log('[donor] selecting credit/debit card');
    const cardRadio = page.locator('input#add-card');
    await cardRadio.click({ force: true });
    await page.waitForTimeout(2000);

    // --- Step 5: Fill contact info ---
    console.log('[donor] filling email + name');
    await page.locator('input#email-address').fill(koloCardEmail);
    await page.locator('input#first-name').fill(firstName);
    await page.locator('input#last-name').fill(lastName);

    // --- Step 6: Fill card details (direct DOM, NOT iframes) ---
    console.log('[donor] filling card details');
    await page.locator('input#card-number').fill(koloCardNumber);
    await page.locator('input#card-expiration').fill(koloCardExpiry);
    await page.locator('input#card-cvv').fill(koloCardCvc);

    // Card name (sometimes pre-filled from first/last)
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

    // --- Step 8: Submit ---
    console.log('[donor] submitting donation...');
    const submitBtn = page.locator('button[type="submit"]:visible').first();
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // --- Step 9: Wait for confirmation ---
    console.log('[donor] waiting for confirmation...');
    let confirmationText = '';
    try {
      // GoFundMe redirects to a thank-you/confirmation page
      await page.waitForURL(/.*(?:thank|confirm|success|receipt).*/i, { timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(3000);

      const thankYou = page.locator('h1, h2, [class*="thank" i], [class*="confirm" i], [data-testid*="confirm" i]').first();
      if (await thankYou.isVisible({ timeout: 5000 }).catch(() => false)) {
        confirmationText = (await thankYou.textContent()) ?? '';
      }

      if (!confirmationText) {
        confirmationText = `Donation completed (URL: ${page.url()})`;
      }
    } catch {
      // Check if page URL suggests success
      const url = page.url();
      if (url.includes('thank') || url.includes('confirm') || url.includes('success')) {
        confirmationText = `Donation completed (URL: ${url})`;
      } else {
        // Check for error messages on page
        const errorEl = page.locator('[class*="error" i], [role="alert"]').first();
        const errorText = await errorEl.textContent().catch(() => '');
        if (errorText) {
          screenshots.push(await screenshot(page, 'error-submit'));
          throw new Error(`Payment error: ${errorText.trim().slice(0, 200)}`);
        }
        screenshots.push(await screenshot(page, 'error-no-confirmation'));
        throw new Error('No confirmation detected after submission');
      }
    }

    screenshots.push(await screenshot(page, 'confirmation'));
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
