import { config } from './config';

export interface CaptchaSolution {
  success: boolean;
  token: string;
  taskId?: number;
  error?: string;
}

const API_BASE = 'https://api.2captcha.com';
const POLL_INTERVAL_MS = 5000;
const MAX_WAIT_MS = 120000;

export async function solveRecaptchaEnterprise(pageUrl: string, siteKey: string): Promise<CaptchaSolution> {
  const apiKey = config.twoCaptchaApiKey;

  if (!apiKey) {
    console.warn('[captcha] TWOCAPTCHA_API_KEY not set — skipping captcha solve');
    return { success: false, token: '', error: 'TWOCAPTCHA_API_KEY not configured' };
  }

  console.log(`[captcha] creating task for ${pageUrl}`);

  let taskId: number;
  try {
    const createRes = await fetch(`${API_BASE}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: apiKey,
        task: {
          type: 'RecaptchaV2EnterpriseTaskProxyless',
          websiteURL: pageUrl,
          websiteKey: siteKey,
          isInvisible: true,
        },
      }),
    });

    const createData = await createRes.json() as { errorId: number; taskId?: number; errorDescription?: string };

    if (createData.errorId !== 0 || !createData.taskId) {
      const err = createData.errorDescription ?? `errorId=${createData.errorId}`;
      console.error(`[captcha] createTask failed: ${err}`);
      return { success: false, token: '', error: err };
    }

    taskId = createData.taskId;
    console.log(`[captcha] task created: ${taskId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[captcha] createTask request failed: ${msg}`);
    return { success: false, token: '', error: msg };
  }

  // Poll for result
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise<void>(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    try {
      const resultRes = await fetch(`${API_BASE}/getTaskResult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      });

      const resultData = await resultRes.json() as {
        errorId: number;
        status?: string;
        solution?: { gRecaptchaResponse: string };
        errorDescription?: string;
      };

      if (resultData.errorId !== 0) {
        const err = resultData.errorDescription ?? `errorId=${resultData.errorId}`;
        console.error(`[captcha] getTaskResult error: ${err}`);
        return { success: false, token: '', taskId, error: err };
      }

      if (resultData.status === 'processing') {
        console.log(`[captcha] task ${taskId} still processing...`);
        continue;
      }

      if (resultData.status === 'ready' && resultData.solution?.gRecaptchaResponse) {
        const token = resultData.solution.gRecaptchaResponse;
        console.log(`[captcha] task ${taskId} solved, token length: ${token.length}`);
        return { success: true, token, taskId };
      }

      console.warn(`[captcha] unexpected status: ${resultData.status}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[captcha] poll request failed: ${msg}`);
    }
  }

  console.error(`[captcha] task ${taskId} timed out after ${MAX_WAIT_MS / 1000}s`);
  return { success: false, token: '', taskId, error: 'Captcha solve timed out' };
}
