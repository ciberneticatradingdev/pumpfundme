import http from 'http';
import { db } from './db';
import { startMonitor } from './fee-monitor';
import { startClaimer, claimSingleToken, claimAllTokens, getVaultBalances } from './fee-claimer';
import { config } from './config';

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  if (method === 'GET' && url === '/health') {
    send(res, 200, { status: 'ok' });
    return;
  }

  if (method === 'GET' && url === '/api/fees/balances') {
    try {
      const balances = await getVaultBalances();
      send(res, 200, { balances });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
    return;
  }

  if (method === 'POST' && url === '/api/fees/claim') {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const { mintAddress } = body as { mintAddress?: string };

      if (!mintAddress) {
        send(res, 400, { error: 'Provide mintAddress' });
        return;
      }

      const result = await claimSingleToken(mintAddress);
      send(res, 200, {
        success: result.success,
        txSignature: result.txSignature,
        amountSol: result.amountSol,
        ...(result.error ? { error: result.error } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
    return;
  }

  if (method === 'POST' && url === '/api/fees/claim-all') {
    try {
      const results = await claimAllTokens();
      send(res, 200, { claims: results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
    return;
  }

  send(res, 404, { error: 'Not found' });
}

async function main(): Promise<void> {
  console.log('[index] PumpFundMe backend starting...');

  process.on('unhandledRejection', (reason) => {
    console.error('[index] unhandled rejection:', reason);
  });

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(err => {
      console.error('[http] unhandled error:', err);
      send(res, 500, { error: 'Internal server error' });
    });
  });

  server.listen(config.port, () => {
    console.log(`[http] listening on port ${config.port}`);
  });

  process.on('SIGINT', async () => {
    console.log('[index] received SIGINT, shutting down');
    server.close();
    await db.$disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[index] received SIGTERM, shutting down');
    server.close();
    await db.$disconnect();
    process.exit(0);
  });

  await Promise.all([
    startMonitor(),
    startClaimer(),
  ]);

  console.log('[index] all services running');
}

main().catch((err) => {
  console.error('[index] fatal error:', err);
  process.exit(1);
});
