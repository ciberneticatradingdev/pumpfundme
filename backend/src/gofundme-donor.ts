import { chromium, Browser, Page, FrameLocator } from 'playwright';
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

async function takeScreenshot(page: Page, label: string): Promise<string> {
  const filename = `${Date.now()}-${label}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}

async function tryClick(page: Page, selectors: string[], timeout = 3000): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout })) {
        await el.click({ timeout });
        return true;
      }
    } catch {
      // try next selector
    }
  }
  return false;
}

async function tryFill(page: Page, selectors: string[], value: string, timeout = 3000): Promise<boolean> {
  for (const selector of selectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout })) {
        await el.click({ clickCount: 3 });
        await el.fill(value);
        return true;
      }
    } catch {
      // try next selector
    }
  }
  return false;
}

async function fillInStripeFrame(
  page: Page,
  frameTitles: string[],
  inputSelectors: string[],
  value: string,
): Promise<boolean> {
  // Try each iframe title
  for (const title of frameTitles) {
    try {
      const frame: FrameLocator = page.frameLocator(`iframe[title="${title}"]`).first();
      for (const selector of inputSelectors) {
        try {
          const input = frame.locator(selector).first();
          if (await input.isVisible({ timeout: 3000 })) {
            await input.fill(value);
            return true;
          }
        } catch {
          // try next input selector
        }
      }
    } catch {
      // try next frame title
    }
  }
  // Fallback: direct input on the page (no iframe)
  return tryFill(page, inputSelectors, value, 2000);
}

export async function donateToGoFundMe(goFundMeUrl: string, amountUsd: number): Promise<DonationResult> {
  const { koloCardNumber, koloCardExpiry, koloCardCvc, koloCardName, koloCardZip, koloCardEmail } = config;

  if (!koloCardNumber || !koloCardExpiry || !koloCardCvc || !koloCardName || !koloCardEmail) {
    throw new Error('Missing required KOLO_CARD_* env vars (KOLO_CARD_NUMBER, KOLO_CARD_EXPIRY, KOLO_CARD_CVC, KOLO_CARD_NAME, KOLO_CARD_EMAIL)');
  }

  if (amountUsd < config.donationMinUsd) {
    return {
      success: false,
      donationAmountUsd: amountUsd,
      goFundMeUrl,
      screenshotPaths: [],
      error: `Amount $${amountUsd} is below minimum $${config.donationMinUsd}`,
    };
  }

  ensureScreenshotDir();
  const screenshotPaths: string[] = [];
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: config.headlessBrowser });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    // --- Step 1: Navigate to campaign ---
    console.log(`[donor] navigating to ${goFundMeUrl}`);
    await page.goto(goFundMeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // --- Step 2: Click Donate button ---
    console.log('[donor] clicking Donate button');
    const donateClicked = await tryClick(page, [
      '[data-testid="donate-button"]',
      'a[href*="/donate"]',
      'button:has-text("Donate")',
      'a:has-text("Donate now")',
      'a:has-text("Donate")',
      '[aria-label*="Donate" i]',
    ]);
    if (!donateClicked) {
      screenshotPaths.push(await takeScreenshot(page, 'error-no-donate-button'));
      throw new Error('Could not find Donate button on campaign page');
    }
    await page.waitForTimeout(2000);

    // --- Step 3: Enter donation amount ---
    console.log(`[donor] entering amount $${amountUsd}`);
    const amountSelectors = [
      'input[data-testid="amount-input"]',
      'input[name="amount"]',
      'input[placeholder*="Amount" i]',
      '[data-element="amount"] input',
      'input[id*="amount" i]',
      'input[type="number"]',
    ];

    let amountFilled = await tryFill(page, amountSelectors, String(amountUsd));

    if (!amountFilled) {
      // Some flows require clicking "Other" / "Custom" first
      await tryClick(page, [
        'button:has-text("Other")',
        'button:has-text("Custom")',
        '[data-testid="custom-amount"]',
      ]);
      await page.waitForTimeout(800);
      amountFilled = await tryFill(page, amountSelectors, String(amountUsd));
    }

    if (!amountFilled) {
      screenshotPaths.push(await takeScreenshot(page, 'error-amount-fill'));
      throw new Error('Could not fill donation amount');
    }

    // Continue after amount
    await tryClick(page, [
      'button[data-testid="btn-continue"]',
      'button:has-text("Continue")',
      'button:has-text("Next")',
    ]);
    await page.waitForTimeout(2000);

    // --- Step 4: Handle tip screen (set to $0 or skip) ---
    try {
      const tipHandled = await tryClick(page, [
        '[data-testid="tip-0"]',
        'button[aria-label*="0%" i]',
        'button:has-text("0%")',
        '[data-testid="tip-none"]',
        'button:has-text("No thanks")',
        'button:has-text("Skip")',
      ], 2000);

      if (!tipHandled) {
        // Try filling tip input with 0
        await tryFill(page, [
          'input[name*="tip" i]',
          'input[id*="tip" i]',
          'input[placeholder*="tip" i]',
        ], '0', 2000);
      }

      await tryClick(page, [
        'button[data-testid="btn-continue"]',
        'button:has-text("Continue")',
        'button:has-text("Next")',
      ], 2000);
      await page.waitForTimeout(1500);
    } catch {
      // Tip screen may not appear — continue
    }

    // --- Step 5: Select credit/debit card ---
    console.log('[donor] selecting credit/debit card');
    await tryClick(page, [
      '[data-testid="payment-method-card"]',
      'button:has-text("Credit or debit card")',
      'button:has-text("Credit card")',
      'label:has-text("Credit or debit")',
      '[aria-label*="credit" i]',
      '[aria-label*="debit" i]',
      'input[value="card"]',
    ], 3000);
    await page.waitForTimeout(1500);

    // --- Step 6: Fill contact info ---
    console.log('[donor] filling email');
    await tryFill(page, [
      'input[type="email"]',
      'input[name="email"]',
      'input[id*="email" i]',
      'input[placeholder*="email" i]',
    ], koloCardEmail);

    console.log('[donor] filling cardholder name');
    await tryFill(page, [
      'input[name="name"]',
      'input[name="cardName"]',
      'input[autocomplete="cc-name"]',
      'input[id*="name" i]',
      'input[placeholder*="name" i]',
    ], koloCardName);

    // --- Step 7: Fill Stripe card fields (iframes) ---
    console.log('[donor] filling card number');
    await fillInStripeFrame(
      page,
      ['Secure card number input frame', 'Card number'],
      ['input[name="cardnumber"]', 'input[autocomplete="cc-number"]', 'input[placeholder*="1234" i]'],
      koloCardNumber,
    );

    console.log('[donor] filling expiry');
    await fillInStripeFrame(
      page,
      ['Secure expiration date input frame', 'Expiration date'],
      ['input[name="exp-date"]', 'input[autocomplete="cc-exp"]', 'input[placeholder*="MM" i]'],
      koloCardExpiry,
    );

    console.log('[donor] filling CVC');
    await fillInStripeFrame(
      page,
      ['Secure CVC input frame', 'CVC'],
      ['input[name="cvc"]', 'input[autocomplete="cc-csc"]', 'input[placeholder*="CVC" i]'],
      koloCardCvc,
    );

    // ZIP if required
    if (koloCardZip) {
      await tryFill(page, [
        'input[name="postal"]',
        'input[name="zip"]',
        'input[autocomplete="postal-code"]',
        'input[placeholder*="zip" i]',
        'input[placeholder*="postal" i]',
      ], koloCardZip);
    }

    // --- Step 8: Screenshot before submit ---
    screenshotPaths.push(await takeScreenshot(page, 'pre-submit'));
    console.log('[donor] pre-submit screenshot taken');

    // --- Step 9: Submit ---
    console.log('[donor] submitting donation');
    const submitted = await tryClick(page, [
      '[data-testid="donate-submit"]',
      'button[type="submit"]:has-text("Donate")',
      'button:has-text("Donate now")',
      'button:has-text("Give now")',
      'button:has-text("Give")',
      'button[type="submit"]',
    ]);
    if (!submitted) {
      screenshotPaths.push(await takeScreenshot(page, 'error-no-submit'));
      throw new Error('Could not find submit button');
    }

    // --- Step 10: Wait for confirmation ---
    console.log('[donor] waiting for confirmation...');
    let confirmationText = '';
    try {
      await page.waitForSelector(
        '[data-testid="confirmation"], h1:has-text("Thank you"), h1:has-text("Donation confirmed"), [class*="confirmation" i], [class*="thank" i]',
        { timeout: 45000 },
      );
      const el = page.locator(
        '[data-testid="confirmation"], h1:has-text("Thank you"), h1:has-text("Donation confirmed")',
      ).first();
      confirmationText = (await el.textContent()) ?? 'Donation confirmed';
    } catch {
      const currentUrl = page.url();
      if (
        currentUrl.includes('thank') ||
        currentUrl.includes('confirm') ||
        currentUrl.includes('success')
      ) {
        confirmationText = `Donation confirmed (url: ${currentUrl})`;
      } else {
        screenshotPaths.push(await takeScreenshot(page, 'error-no-confirmation'));
        throw new Error('No confirmation page detected after submission');
      }
    }

    screenshotPaths.push(await takeScreenshot(page, 'confirmation'));
    console.log(`[donor] ✅ donation confirmed: ${confirmationText}`);

    return { success: true, donationAmountUsd: amountUsd, goFundMeUrl, screenshotPaths, confirmationText };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[donor] ❌ donation failed: ${error}`);
    return { success: false, donationAmountUsd: amountUsd, goFundMeUrl, screenshotPaths, error };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
