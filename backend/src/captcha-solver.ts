import { config } from './config';

export interface CaptchaSolution {
  success: boolean;
  token: string;
  taskId?: number;
  error?: string;
  attempt?: number;
}

const API_BASE = 'https://api.2captcha.com';
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 120000;
const MAX_RETRIES = 3;

async function solveSingle(
  apiKey: string,
  pageUrl: string,
  siteKey: string,
  action?: string,
  attempt = 1,
): Promise<CaptchaSolution> {
  console.log(`[captcha] attempt ${attempt}/${MAX_RETRIES} — creating task for ${pageUrl}`);

  const taskPayload: Record<string, unknown> = {
    type: 'RecaptchaV2EnterpriseTaskProxyless',
    websiteURL: pageUrl,
    websiteKey: siteKey,
    isInvisible: true,
  };

  // Only pass action in enterprisePayload (NOT 's' — that's a different parameter)
  if (action) {
    taskPayload.enterprisePayload = { action };
  }

  console.log(`[captcha] task payload: ${JSON.stringify(taskPayload)}`);

  let taskId: number;
  try {
    const createRes = await fetch(`${API_BASE}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: apiKey, task: taskPayload }),
    });

    const createData = (await createRes.json()) as {
      errorId: number;
      taskId?: number;
      errorDescription?: string;
    };

    if (createData.errorId !== 0 || !createData.taskId) {
      const err = createData.errorDescription ?? `errorId=${createData.errorId}`;
      console.error(`[captcha] createTask failed: ${err}`);
      return { success: false, token: '', error: err, attempt };
    }

    taskId = createData.taskId;
    console.log(`[captcha] task created: ${taskId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[captcha] createTask request failed: ${msg}`);
    return { success: false, token: '', error: msg, attempt };
  }

  // Poll for result
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    try {
      const resultRes = await fetch(`${API_BASE}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      });

      const resultData = (await resultRes.json()) as {
        errorId: number;
        status?: string;
        solution?: { gRecaptchaResponse: string };
        errorDescription?: string;
      };

      if (resultData.errorId !== 0) {
        const err = resultData.errorDescription ?? `errorId=${resultData.errorId}`;
        console.error(`[captcha] getTaskResult error: ${err}`);
        return { success: false, token: '', taskId, error: err, attempt };
      }

      if (resultData.status === 'processing') {
        const elapsed = Math.round((Date.now() - (deadline - MAX_WAIT_MS)) / 1000);
        console.log(`[captcha] task ${taskId} processing... (${elapsed}s)`);
        continue;
      }

      if (resultData.status === 'ready' && resultData.solution?.gRecaptchaResponse) {
        const token = resultData.solution.gRecaptchaResponse;
        console.log(`[captcha] ✅ task ${taskId} solved on attempt ${attempt}, token length: ${token.length}`);
        return { success: true, token, taskId, attempt };
      }

      console.warn(`[captcha] unexpected result: ${JSON.stringify(resultData).slice(0, 200)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[captcha] poll error: ${msg}`);
    }
  }

  console.error(`[captcha] task ${taskId} timed out after ${MAX_WAIT_MS / 1000}s`);
  return { success: false, token: '', taskId, error: 'Captcha solve timed out', attempt };
}

/**
 * Solve reCAPTCHA Enterprise with retries.
 * Retries up to MAX_RETRIES times if workers fail.
 */
export async function solveRecaptchaEnterprise(
  pageUrl: string,
  siteKey: string,
  action?: string,
): Promise<CaptchaSolution> {
  const apiKey = config.twoCaptchaApiKey;

  if (!apiKey) {
    console.warn('[captcha] TWOCAPTCHA_API_KEY not set — skipping');
    return { success: false, token: '', error: 'TWOCAPTCHA_API_KEY not configured' };
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await solveSingle(apiKey, pageUrl, siteKey, action, attempt);

    if (result.success) {
      return result;
    }

    // Don't retry on config errors, only on worker failures
    if (
      result.error?.includes('could not solve') ||
      result.error?.includes('timed out')
    ) {
      console.log(`[captcha] retrying (${attempt}/${MAX_RETRIES})...`);
      continue;
    }

    // Non-retryable error
    return result;
  }

  console.error(`[captcha] all ${MAX_RETRIES} attempts failed`);
  return { success: false, token: '', error: `Failed after ${MAX_RETRIES} attempts` };
}
