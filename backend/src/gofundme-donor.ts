import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';
import { solveRecaptchaEnterprise } from './captcha-solver';

const GOFUNDME_RECAPTCHA_SITEKEY = '6LdRSOIUAAAAACEGtT2MgSZzB7Y97gitstHArN8P';
const BRAINTREE_GRAPHQL_URL = 'https://payments.braintree-api.com/graphql';
const BRAINTREE_VERSION = '2018-05-10';

export interface DonationResult {
  success: boolean;
  donationAmountUsd: number;
  goFundMeUrl: string;
  screenshotPaths: string[];
  confirmationText?: string;
  error?: string;
}

interface BraintreeTokenResult {
  token: string;
  bin?: string;
  brandCode?: string;
  last4?: string;
}

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
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

async function tokenizeCardViaBraintree(
  btAuthToken: string,
  cardNumber: string,
  expiry: string,
  cvv: string,
): Promise<BraintreeTokenResult> {
  const parts = expiry.split('/').map((s) => s.trim());
  const month = parts[0] ?? '';
  const rawYear = parts[1] ?? '';
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

  const tokenizeQuery = {
    clientSdkMetadata: {
      source: 'client',
      integration: 'custom',
      sessionId: 'session-' + Date.now(),
    },
    query: `mutation TokenizeCreditCard($input: TokenizeCreditCardInput!) {
      tokenizeCreditCard(input: $input) {
        token
        creditCard { bin brandCode last4 expirationMonth expirationYear }
      }
    }`,
    variables: {
      input: {
        creditCard: {
          number: cardNumber,
          expirationMonth: month,
          expirationYear: year,
          cvv: cvv,
        },
        options: { validate: false },
      },
    },
    operationName: 'TokenizeCreditCard',
  };

  console.log('[donor] tokenizing card via Braintree GraphQL API...');
  console.log(`[donor]   endpoint: ${BRAINTREE_GRAPHQL_URL}`);
  console.log(`[donor]   auth token (first 80 chars): ${btAuthToken.slice(0, 80)}...`);

  const res = await fetch(BRAINTREE_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': btAuthToken,
      'Braintree-Version': BRAINTREE_VERSION,
    },
    body: JSON.stringify(tokenizeQuery),
  });

  const responseText = await res.text();
  console.log(`[donor] Braintree tokenize HTTP ${res.status}`);
  console.log(`[donor] Braintree tokenize response: ${responseText.slice(0, 600)}`);

  if (!res.ok) {
    throw new Error(`Braintree tokenization HTTP ${res.status}: ${responseText.slice(0, 300)}`);
  }

  const data = JSON.parse(responseText) as {
    data?: { tokenizeCreditCard?: { token?: string; creditCard?: { bin?: string; brandCode?: string; last4?: string } } };
    errors?: unknown[];
  };

  if (data.errors && data.errors.length > 0) {
    throw new Error(`Braintree GraphQL errors: ${JSON.stringify(data.errors).slice(0, 300)}`);
  }

  const card = data?.data?.tokenizeCreditCard;
  if (!card?.token) {
    throw new Error(`No token in Braintree response: ${responseText.slice(0, 300)}`);
  }

  console.log(`[donor] ✅ card tokenized — token: ${card.token}, brand: ${card.creditCard?.brandCode}, last4: ${card.creditCard?.last4}`);
  return {
    token: card.token,
    bin: card.creditCard?.bin,
    brandCode: card.creditCard?.brandCode,
    last4: card.creditCard?.last4,
  };
}

/**
 * Donate to GoFundMe using API-direct approach:
 * 1. Browser loads page ONLY to capture Braintree auth token + session cookies
 * 2. Card is tokenized via Braintree GraphQL API (no browser)
 * 3. Donation submitted via GoFundMe API (direct HTTP)
 * 4. If API unknown, discovery mode logs all captured API calls for analysis
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

  const nameParts = koloCardName.trim().split(/\s+/);
  const firstName = nameParts[0] ?? koloCardName;
  const lastName = nameParts.slice(1).join(' ') || '';

  try {
    browser = await chromium.launch({
      headless: config.headlessBrowser,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 1200 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    // ── Token capture: intercept all network requests ──────────────────────
    let btAuthToken: string | null = null;
    const capturedGfmRequests: CapturedRequest[] = [];

    page.on('request', (req) => {
      const url = req.url();
      const method = req.method();
      const headers = req.headers();

      // Braintree: capture auth token
      if (url.includes('braintree-api.com') || url.includes('braintreegateway.com')) {
        console.log(`[donor] 🔵 Braintree request: ${method} ${url}`);
        console.log(`[donor]   headers: ${JSON.stringify(headers).slice(0, 600)}`);
        const auth = headers['authorization'];
        if (auth && !btAuthToken) {
          btAuthToken = auth;
          console.log(`[donor] ✅ Captured Braintree auth token (length ${auth.length}): ${auth.slice(0, 80)}...`);
        }
      }

      // GoFundMe: capture all POST requests for API discovery
      if (url.includes('gofundme.com') && method === 'POST') {
        const postData = req.postData() ?? undefined;
        console.log(`[donor] 🟡 GoFundMe POST intercepted: ${url}`);
        if (headers['content-type']) console.log(`[donor]   content-type: ${headers['content-type']}`);
        if (postData) console.log(`[donor]   body: ${postData.slice(0, 800)}`);
        capturedGfmRequests.push({ url, method, headers, postData });
      }

      // Log any other interesting API calls
      if (url.includes('gofundme.com') && !url.match(/\.(js|css|png|jpg|svg|woff|ico)(\?|$)/)) {
        if (method !== 'GET' || url.includes('/api/') || url.includes('/graphql') || url.includes('/web-gateway/')) {
          console.log(`[donor] 🔷 GFM API call: ${method} ${url}`);
        }
      }
    });

    // Capture GoFundMe API responses too
    page.on('response', (resp) => {
      const url = resp.url();
      const status = resp.status();
      if (url.includes('gofundme.com') && capturedGfmRequests.some((r) => r.url === url)) {
        resp.text().then((body) => {
          console.log(`[donor] 🟢 GFM response ${status} (${url}): ${body.slice(0, 600)}`);
        }).catch(() => {});
      }
    });

    const donateUrl = goFundMeUrl.replace(/\/$/, '') + '/donate?source=btn_donate';

    // ── Step 1: Solve reCAPTCHA Enterprise ────────────────────────────────
    console.log('[donor] solving reCAPTCHA Enterprise...');
    const captchaResult = await solveRecaptchaEnterprise(donateUrl, GOFUNDME_RECAPTCHA_SITEKEY, 'checkout');
    if (captchaResult.success) {
      console.log(`[donor] captcha solved (token length: ${captchaResult.token.length})`);
      // Serve fake reCAPTCHA so page thinks captcha is solved
      await page.route('**/recaptcha/enterprise.js**', (route) => {
        console.log('[donor] serving fake reCAPTCHA script');
        route.fulfill({
          status: 200, contentType: 'application/javascript',
          body: `
            window.grecaptcha = {
              enterprise: {
                ready: function(cb) { if (cb) cb(); },
                execute: function() { return Promise.resolve("${captchaResult.token.replace(/"/g, '\\"')}"); },
                render: function() { return 'fake-widget'; },
                getResponse: function() { return "${captchaResult.token.replace(/"/g, '\\"')}"; },
                reset: function() {},
              },
              ready: function(cb) { if (cb) cb(); },
            };
          `,
        });
      });
      await page.route('**/recaptcha/enterprise/anchor**', (route) => {
        route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body></body></html>' });
      });
      await page.route('**/recaptcha/enterprise/bframe**', (route) => {
        route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body></body></html>' });
      });
    } else {
      console.warn(`[donor] captcha solve failed: ${captchaResult.error} — continuing without token`);
    }

    // ── Step 2: Load donate page (browser used ONLY for token extraction) ──
    console.log(`[donor] loading donate page: ${donateUrl}`);
    await page.goto(donateUrl, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);
    screenshots.push(await screenshot(page, 'page-loaded'));
    console.log(`[donor] page loaded: ${page.url()}`);

    // ── Step 3: Extract __NEXT_DATA__ and page metadata ───────────────────
    const pageMetadata = await page.evaluate(() => {
      const g = globalThis as any;
      const doc = g.document;
      const nextData = g.__NEXT_DATA__;
      const props = nextData?.props?.pageProps ?? {};

      // Log all pageProps keys for discovery
      console.log('[donor-page] __NEXT_DATA__ keys:', JSON.stringify(Object.keys(props)));

      // Deep search for Braintree token
      let braintreeToken: string | null = null;
      const nextStr = JSON.stringify(nextData ?? {});
      const btMatch = nextStr.match(/"(?:braintreeToken|authorization|clientToken|braintreeAuthorization)"\s*:\s*"([^"]{20,})"/);
      if (btMatch) braintreeToken = btMatch[1];

      // Also check direct window properties
      const directToken = g.__BRAINTREE_AUTHORIZATION__ ?? g.braintreeAuthorization ?? null;
      if (directToken && !braintreeToken) braintreeToken = directToken;

      return {
        url: g.location.href,
        csrfMeta: doc.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? null,
        braintreeToken,
        campaignId: props.campaignId ?? props.campaign?.id ?? null,
        checkoutId: props.checkoutId ?? props.checkout?.id ?? null,
        checkoutSessionId: props.checkoutSessionId ?? null,
        fundraiserId: props.fundraiserId ?? props.campaign?.fundraiserId ?? null,
        slug: props.campaign?.slug ?? props.fundraiser?.slug ?? null,
        // Full pageProps for analysis (truncated)
        pagePropsPreview: JSON.stringify(props).slice(0, 3000),
        windowGfmKeys: Object.keys(g).filter((k: string) =>
          k.includes('gfm') || k.includes('GFM') || k.includes('fundme') || k.includes('checkout')
        ),
      };
    });

    console.log('[donor] page metadata extracted:');
    console.log(`[donor]   url: ${pageMetadata.url}`);
    console.log(`[donor]   csrfMeta: ${pageMetadata.csrfMeta ?? 'none'}`);
    console.log(`[donor]   braintreeToken (from page): ${pageMetadata.braintreeToken?.slice(0, 80) ?? 'not found'}`);
    console.log(`[donor]   campaignId: ${pageMetadata.campaignId ?? 'none'}`);
    console.log(`[donor]   checkoutId: ${pageMetadata.checkoutId ?? 'none'}`);
    console.log(`[donor]   checkoutSessionId: ${pageMetadata.checkoutSessionId ?? 'none'}`);
    console.log(`[donor]   fundraiserId: ${pageMetadata.fundraiserId ?? 'none'}`);
    console.log(`[donor]   slug: ${pageMetadata.slug ?? 'none'}`);
    console.log(`[donor]   windowGfmKeys: ${JSON.stringify(pageMetadata.windowGfmKeys)}`);
    console.log(`[donor]   pagePropsPreview: ${pageMetadata.pagePropsPreview}`);

    // ── Step 4: Trigger Braintree SDK init to capture auth token ──────────
    console.log('[donor] clicking Credit/Debit to trigger Braintree SDK initialization...');
    try {
      const cardLabel = page.locator('label:has-text("Credit or debit")');
      if (await cardLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cardLabel.click();
        console.log('[donor] clicked "Credit or debit" label — waiting for Braintree requests...');
        await page.waitForTimeout(4000);
      } else {
        console.log('[donor] "Credit or debit" label not found');
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('[donor] error triggering Braintree init:', e);
    }

    // ── Step 5: Resolve Braintree auth token ──────────────────────────────
    if (!btAuthToken && pageMetadata.braintreeToken) {
      const raw = pageMetadata.braintreeToken;
      btAuthToken = raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
      console.log(`[donor] using Braintree token from __NEXT_DATA__: ${btAuthToken.slice(0, 80)}...`);
    }

    if (!btAuthToken) {
      // Last attempt: look in local/session storage
      const storedToken = await page.evaluate(() => {
        const g = globalThis as any;
        try {
          for (let i = 0; i < g.localStorage.length; i++) {
            const key = g.localStorage.key(i);
            const val = g.localStorage.getItem(key) ?? '';
            if (val.includes('eyJ') && val.length > 100) return val;
          }
        } catch { /* storage may be blocked */ }
        return null;
      });
      if (storedToken) {
        const tok = storedToken.startsWith('Bearer ') ? storedToken : `Bearer ${storedToken}`;
        btAuthToken = tok;
        console.log(`[donor] found Braintree token in localStorage: ${tok.slice(0, 80)}...`);
      }
    }

    if (!btAuthToken) {
      console.error('[donor] ❌ Could not capture Braintree auth token from any source');
      console.log('[donor] requests captured so far:', capturedGfmRequests.map((r) => `${r.method} ${r.url}`));
      throw new Error('Could not capture Braintree authorization token — see logs above');
    }

    // ── Step 6: Capture cookies/session for GoFundMe API calls ────────────
    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    console.log(`[donor] captured ${cookies.length} cookies`);
    cookies
      .filter((c) =>
        c.name.toLowerCase().includes('session') ||
        c.name.toLowerCase().includes('csrf') ||
        c.name.toLowerCase().includes('token') ||
        c.name.toLowerCase().includes('auth') ||
        c.name.startsWith('_gfm') ||
        c.name.startsWith('gfm'),
      )
      .forEach((c) => console.log(`[donor]   cookie: ${c.name}=${c.value.slice(0, 60)}`));

    screenshots.push(await screenshot(page, 'tokens-captured'));

    // ── Step 7: Tokenize card via Braintree GraphQL (DIRECT API) ──────────
    const { token: paymentNonce } = await tokenizeCardViaBraintree(
      btAuthToken,
      koloCardNumber,
      koloCardExpiry,
      koloCardCvc,
    );
    console.log(`[donor] payment nonce ready: ${paymentNonce}`);

    // ── Step 8: Attempt GoFundMe donation via direct API ──────────────────
    const campaignSlug = goFundMeUrl
      .replace(/https?:\/\/[^/]+\/f\//, '')
      .replace(/[/?#].*$/, '');
    console.log(`[donor] campaign slug: ${campaignSlug}`);

    const gfmHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://www.gofundme.com',
      'Referer': donateUrl,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Cookie': cookieHeader,
    };
    if (pageMetadata.csrfMeta) {
      gfmHeaders['X-CSRF-Token'] = pageMetadata.csrfMeta;
    }

    const donationPayload: Record<string, unknown> = {
      amount: Math.round(amountUsd * 100),
      currency: 'USD',
      payment_method_nonce: paymentNonce,
      recaptcha_enterprise_token: captchaResult.token,
      email: koloCardEmail,
      first_name: firstName,
      last_name: lastName,
      is_anonymous: false,
      ...(pageMetadata.campaignId ? { campaign_id: pageMetadata.campaignId } : {}),
      ...(pageMetadata.checkoutId ? { checkout_id: pageMetadata.checkoutId } : {}),
      ...(pageMetadata.checkoutSessionId ? { checkout_session_id: pageMetadata.checkoutSessionId } : {}),
      ...(koloCardZip ? { postal_code: koloCardZip } : {}),
    };
    console.log('[donor] donation payload:', JSON.stringify(donationPayload, null, 2));

    // Candidate API endpoints (most likely first)
    const gfmBase = 'https://www.gofundme.com';
    const apiEndpoints = [
      `/web-gateway/v1/fundraisers/${campaignSlug}/donations`,
      `/web-gateway/v1/checkout`,
      `/web-gateway/v1/campaigns/${campaignSlug}/donations`,
      `/api/v1/fundraiser/${campaignSlug}/donation`,
      `/api/checkout`,
      `/api/v2/donations`,
    ];

    let donationSuccess = false;
    let confirmationText = '';

    for (const endpoint of apiEndpoints) {
      const url = `${gfmBase}${endpoint}`;
      console.log(`[donor] trying: POST ${url}`);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: gfmHeaders,
          body: JSON.stringify(donationPayload),
        });
        const body = await res.text();
        console.log(`[donor]   HTTP ${res.status}`);
        console.log(`[donor]   content-type: ${res.headers.get('content-type') ?? 'unknown'}`);
        console.log(`[donor]   body: ${body.slice(0, 800)}`);

        if (res.ok || res.status === 201) {
          donationSuccess = true;
          confirmationText = `Donation accepted by GoFundMe API (endpoint: ${endpoint})`;
          console.log(`[donor] ✅ GoFundMe API accepted donation via ${endpoint}`);
          break;
        }
      } catch (err) {
        console.log(`[donor]   request failed: ${err}`);
      }
    }

    // ── Step 9: Discovery mode — fill form + submit to capture real API call
    if (!donationSuccess) {
      console.log('[donor] ═══ ENTERING DISCOVERY MODE ═══');
      console.log('[donor] direct API attempts failed — filling browser form to capture real GoFundMe API calls');

      try {
        // Fill donation amount
        const amountInput = page.locator('input#checkout-donation');
        if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await amountInput.click({ clickCount: 3 });
          await amountInput.fill(String(amountUsd));
          await page.waitForTimeout(500);
          console.log('[donor] [discovery] filled donation amount');
        } else {
          console.log('[donor] [discovery] amount input not found');
        }

        // Set tip to $0
        try {
          const customTipBtn = page.locator('button:has-text("Enter custom tip")');
          if (await customTipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await customTipBtn.click();
            await page.waitForTimeout(500);
          }
          const tipInput = page.locator('input[id*="tip" i], input[name*="tip" i]').first();
          if (await tipInput.isVisible({ timeout: 1500 }).catch(() => false)) {
            await tipInput.fill('0');
            console.log('[donor] [discovery] tip set to $0');
          }
        } catch { /* no tip section */ }

        // Select credit/debit
        const cardLabel = page.locator('label:has-text("Credit or debit")');
        if (await cardLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
          await cardLabel.click();
          await page.waitForTimeout(2500);
          console.log('[donor] [discovery] selected credit/debit');
        }

        // Fill contact info
        await page.locator('input#email-address').fill(koloCardEmail).catch(() => {});
        await page.locator('input#first-name').fill(firstName).catch(() => {});
        await page.locator('input#last-name').fill(lastName).catch(() => {});
        console.log('[donor] [discovery] filled contact info');

        // Fill card details
        await page.locator('input#card-number').fill(koloCardNumber).catch(() => {});
        await page.locator('input#card-expiration').fill(koloCardExpiry).catch(() => {});
        await page.locator('input#card-cvv').fill(koloCardCvc).catch(() => {});
        if (koloCardZip) {
          await page.locator('input#location-postal-code').fill(koloCardZip).catch(() => {});
        }
        console.log('[donor] [discovery] filled card details');

        // Uncheck save-card
        const saveCard = page.locator('input#save-card');
        if (await saveCard.isVisible({ timeout: 500 }).catch(() => false) && await saveCard.isChecked()) {
          await saveCard.uncheck();
        }

        screenshots.push(await screenshot(page, 'discovery-pre-submit'));

        const urlBeforeSubmit = page.url();
        console.log('[donor] [discovery] submitting form to capture API calls...');

        await page.evaluate(() => {
          const overlay = (globalThis as any).document.getElementById('transcend-consent-manager');
          if (overlay) overlay.remove();
        });

        const submitBtn = page.locator('button[type="submit"]:visible').first();
        await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
        await submitBtn.click({ timeout: 10000 }).catch(async () => {
          console.log('[donor] [discovery] normal click failed, trying force click');
          await submitBtn.click({ force: true }).catch(() => {});
        });

        // Wait to capture API calls
        await page.waitForTimeout(12000);
        screenshots.push(await screenshot(page, 'discovery-post-submit'));

        // Check if URL changed (success)
        const currentUrl = page.url();
        if (currentUrl !== urlBeforeSubmit) {
          console.log(`[donor] [discovery] URL changed: ${urlBeforeSubmit} → ${currentUrl}`);
          if (
            currentUrl.includes('thank') ||
            currentUrl.includes('success') ||
            currentUrl.includes('confirm')
          ) {
            donationSuccess = true;
            confirmationText = `Donation completed via browser form (URL: ${currentUrl})`;
          }
        }

        // Log debug state from page
        const pageErrors = await page.evaluate(() => {
          const g = globalThis as any;
          const doc = g.document;
          return Array.from(
            doc.querySelectorAll('[class*="error" i], [role="alert"], .hrt-field-error') as any,
          )
            .filter((e: any) => e.offsetParent !== null && e.textContent?.trim())
            .map((e: any) => (e as any).textContent.trim().slice(0, 200));
        });
        if (pageErrors.length > 0) {
          console.log('[donor] [discovery] page errors visible:', pageErrors);
        }
      } catch (discoveryErr) {
        console.log('[donor] [discovery] error during discovery mode:', discoveryErr);
      }
    }

    screenshots.push(await screenshot(page, 'final'));

    // ── Step 10: Discovery summary ─────────────────────────────────────────
    console.log('[donor] ════════════════════════════════════════');
    console.log('[donor] DISCOVERY SUMMARY');
    console.log('[donor] ════════════════════════════════════════');
    console.log(`[donor] Braintree auth token (first 120): ${btAuthToken.slice(0, 120)}`);
    console.log(`[donor] Payment nonce: ${paymentNonce}`);
    console.log(`[donor] Campaign slug: ${campaignSlug}`);
    console.log(`[donor] Campaign ID: ${pageMetadata.campaignId ?? 'unknown'}`);
    console.log(`[donor] Checkout ID: ${pageMetadata.checkoutId ?? 'unknown'}`);
    console.log(`[donor] reCAPTCHA token obtained: ${captchaResult.success}`);
    console.log(`[donor] GoFundMe POST requests captured: ${capturedGfmRequests.length}`);
    for (const req of capturedGfmRequests) {
      console.log(`[donor]   ${req.method} ${req.url}`);
      if (req.headers['content-type']) console.log(`[donor]     content-type: ${req.headers['content-type']}`);
      if (req.postData) console.log(`[donor]     body: ${req.postData.slice(0, 1000)}`);
    }
    console.log('[donor] ════════════════════════════════════════');

    if (!donationSuccess) {
      throw new Error(
        `GoFundMe donation did not complete — ${capturedGfmRequests.length} API calls captured, check logs above for endpoint discovery`,
      );
    }

    console.log(`[donor] ✅ donation confirmed: ${confirmationText}`);
    return { success: true, donationAmountUsd: amountUsd, goFundMeUrl, screenshotPaths: screenshots, confirmationText };

  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[donor] ❌ donation failed: ${error}`);
    return { success: false, donationAmountUsd: amountUsd, goFundMeUrl, screenshotPaths: screenshots, error };
  } finally {
    if (browser) await browser.close();
  }
}
