import http from 'http';
import { db } from './db';
import { startMonitor } from './fee-monitor';
import { startClaimer, claimSingleToken, claimAllTokens, getVaultBalances } from './fee-claimer';
import { startPipeline, getPipelineStatus } from './pipeline';
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

  // --- Transaction transparency endpoints ---

  if (method === 'GET' && url.startsWith('/api/transactions/summary')) {
    try {
      const [claimed, transferred, donated] = await Promise.all([
        db.transaction.aggregate({ where: { type: 'FEE_RECEIVED', status: 'CONFIRMED' }, _sum: { amountSol: true }, _count: true }),
        db.transaction.aggregate({ where: { type: 'USDT_TRANSFER', status: 'CONFIRMED' }, _sum: { amountSol: true, amountUsd: true }, _count: true }),
        db.transaction.aggregate({ where: { type: 'DONATION', status: 'CONFIRMED' }, _sum: { amountUsd: true }, _count: true }),
      ]);
      send(res, 200, {
        totalSolClaimed: claimed._sum.amountSol ?? 0,
        totalClaimCount: claimed._count,
        totalSolTransferred: transferred._sum.amountSol ?? 0,
        totalUsdTransferred: transferred._sum.amountUsd ?? 0,
        totalTransferCount: transferred._count,
        totalUsdDonated: donated._sum.amountUsd ?? 0,
        totalDonationCount: donated._count,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
    return;
  }

  if (method === 'GET' && url.startsWith('/api/transactions')) {
    try {
      const parsed = new URL(url, `http://localhost:${config.port}`);
      const typeFilter = parsed.searchParams.get('type');
      const limit = Math.min(parseInt(parsed.searchParams.get('limit') ?? '50', 10), 200);
      const offset = parseInt(parsed.searchParams.get('offset') ?? '0', 10);

      const where = typeFilter ? { type: typeFilter as any } : {};
      const [transactions, total] = await Promise.all([
        db.transaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: { campaign: { select: { id: true, name: true } }, token: { select: { id: true, mintAddress: true, symbol: true } } },
        }),
        db.transaction.count({ where }),
      ]);

      send(res, 200, {
        transactions: transactions.map(tx => ({
          ...tx,
          solscanUrl: tx.txSignature ? `https://solscan.io/tx/${tx.txSignature}` : null,
        })),
        total,
        limit,
        offset,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
    return;
  }

  if (method === 'GET' && url === '/api/pipeline/status') {
    try {
      const status = await getPipelineStatus();
      send(res, 200, status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
    return;
  }

  // --- Donation endpoints ---

  if (method === 'GET' && url === '/api/donations/pending') {
    try {
      const pending = await db.transaction.findMany({
        where: { type: 'DONATION', status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: { campaign: { select: { id: true, name: true, goFundMeUrl: true } } },
      });
      send(res, 200, { donations: pending });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
    return;
  }

  if (method === 'POST' && url === '/api/donations/record') {
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const { campaignId, amountUsd, receiptUrl, notes } = body as {
        campaignId?: string;
        amountUsd?: number;
        receiptUrl?: string;
        notes?: string;
      };

      if (!campaignId || !amountUsd) {
        send(res, 400, { error: 'Provide campaignId and amountUsd' });
        return;
      }

      const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) {
        send(res, 404, { error: 'Campaign not found' });
        return;
      }

      const [transaction] = await db.$transaction([
        db.transaction.create({
          data: {
            type: 'DONATION',
            campaignId,
            amountSol: 0,
            amountUsd: Number(amountUsd),
            status: 'CONFIRMED',
            metadata: {
              ...(receiptUrl ? { receiptUrl } : {}),
              ...(notes ? { notes } : {}),
              recordedManually: true,
            },
          },
        }),
        db.campaign.update({
          where: { id: campaignId },
          data: { totalDonatedUsd: { increment: Number(amountUsd) } },
        }),
      ]);

      send(res, 200, { transaction });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
    return;
  }

  if (method === 'GET' && url === '/api/notifications/ready') {
    try {
      // Find campaigns with confirmed USDT_TRANSFER but no corresponding DONATION yet
      const campaigns = await db.campaign.findMany({
        where: {
          transactions: {
            some: { type: 'USDT_TRANSFER', status: 'CONFIRMED' },
          },
        },
        include: {
          transactions: {
            where: { type: { in: ['USDT_TRANSFER', 'DONATION'] }, status: 'CONFIRMED' },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      const ready = campaigns
        .map(campaign => {
          const transferred = campaign.transactions
            .filter(tx => tx.type === 'USDT_TRANSFER')
            .reduce((sum, tx) => sum + (tx.amountUsd ?? 0), 0);
          const donated = campaign.transactions
            .filter(tx => tx.type === 'DONATION')
            .reduce((sum, tx) => sum + (tx.amountUsd ?? 0), 0);
          const available = transferred - donated;
          return { campaignId: campaign.id, campaignName: campaign.name, goFundMeUrl: campaign.goFundMeUrl, totalTransferred: transferred, totalDonated: donated, availableToDonate: available };
        })
        .filter(c => c.availableToDonate > 0.01);

      send(res, 200, { ready });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send(res, 500, { error: message });
    }
    return;
  }

  if (method === 'GET' && url.startsWith('/api/donations/history')) {
    try {
      const parsed = new URL(url, `http://localhost:${config.port}`);
      const limit = Math.min(parseInt(parsed.searchParams.get('limit') ?? '50', 10), 200);
      const offset = parseInt(parsed.searchParams.get('offset') ?? '0', 10);

      const [donations, total] = await Promise.all([
        db.transaction.findMany({
          where: { type: 'DONATION', status: 'CONFIRMED' },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: { campaign: { select: { id: true, name: true, goFundMeUrl: true } } },
        }),
        db.transaction.count({ where: { type: 'DONATION', status: 'CONFIRMED' } }),
      ]);

      send(res, 200, { donations, total, limit, offset });
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

  await startPipeline();

  console.log('[index] all services running (monitor + claimer + pipeline)');
}

main().catch((err) => {
  console.error('[index] fatal error:', err);
  process.exit(1);
});
