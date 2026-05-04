import { db } from './db';
import { config } from './config';
import { donateToGoFundMe } from './gofundme-donor';
import { sleep } from './utils';

async function processSingleTransfer(transfer: {
  id: string;
  campaignId: string | null;
  tokenId: string | null;
  amountUsd: number | null;
}): Promise<void> {
  if (!transfer.campaignId) return;

  const campaign = await db.campaign.findUnique({
    where: { id: transfer.campaignId },
    select: { id: true, name: true, goFundMeUrl: true },
  });

  if (!campaign?.goFundMeUrl) {
    console.log(`[donation-pipeline] skipping transfer ${transfer.id} — campaign has no goFundMeUrl`);
    return;
  }

  const amountUsd = Number(transfer.amountUsd ?? 0);
  if (amountUsd < config.donationMinUsd) {
    console.log(`[donation-pipeline] skipping transfer ${transfer.id} — $${amountUsd} below minimum $${config.donationMinUsd}`);
    return;
  }

  console.log(`[donation-pipeline] donating $${amountUsd} to "${campaign.name}" (${campaign.goFundMeUrl})`);

  // Record a PENDING donation before attempting
  const donationTx = await db.transaction.create({
    data: {
      type: 'DONATION',
      campaignId: campaign.id,
      tokenId: transfer.tokenId,
      amountSol: 0,
      amountUsd,
      txSignature: null,
      status: 'PENDING',
      metadata: {
        goFundMeUrl: campaign.goFundMeUrl,
        sourceTxId: transfer.id,
        donatedAt: new Date().toISOString(),
      },
    },
  });

  try {
    const result = await donateToGoFundMe(campaign.goFundMeUrl, amountUsd);

    if (result.success) {
      await db.$transaction([
        db.transaction.update({
          where: { id: donationTx.id },
          data: {
            status: 'CONFIRMED',
            metadata: {
              goFundMeUrl: campaign.goFundMeUrl,
              screenshotPaths: result.screenshotPaths,
              confirmationText: result.confirmationText ?? '',
              cardLast4: config.koloCardNumber.slice(-4),
              donatedAt: new Date().toISOString(),
              sourceTxId: transfer.id,
            },
          },
        }),
        db.campaign.update({
          where: { id: campaign.id },
          data: { totalDonatedUsd: { increment: amountUsd } },
        }),
        db.event.create({
          data: {
            type: 'DONATION_CONFIRMED',
            campaignId: campaign.id,
            message: `Donated $${amountUsd.toFixed(2)} to "${campaign.name}" via GoFundMe`,
            data: {
              amountUsd,
              goFundMeUrl: campaign.goFundMeUrl,
              confirmationText: result.confirmationText,
              screenshotPaths: result.screenshotPaths,
              cardLast4: config.koloCardNumber.slice(-4),
            },
          },
        }),
      ]);
      console.log(`[donation-pipeline] ✅ donated $${amountUsd} to "${campaign.name}"`);
    } else {
      await db.transaction.update({
        where: { id: donationTx.id },
        data: {
          status: 'FAILED',
          metadata: {
            goFundMeUrl: campaign.goFundMeUrl,
            error: result.error,
            screenshotPaths: result.screenshotPaths,
            sourceTxId: transfer.id,
          },
        },
      });
      console.error(`[donation-pipeline] ❌ donation failed for "${campaign.name}": ${result.error}`);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.transaction.update({
      where: { id: donationTx.id },
      data: {
        status: 'FAILED',
        metadata: {
          goFundMeUrl: campaign.goFundMeUrl,
          error,
          sourceTxId: transfer.id,
        },
      },
    });
    console.error(`[donation-pipeline] ❌ exception during donation: ${error}`);
  }
}

export async function processPendingDonations(): Promise<void> {
  // Find confirmed USDT_TRANSFER transactions (filter for campaignId in JS)
  const allTransfers = await db.transaction.findMany({
    where: {
      type: 'USDT_TRANSFER',
      status: 'CONFIRMED',
    },
    orderBy: { createdAt: 'asc' },
  });
  const transfers = allTransfers.filter(t => t.campaignId !== null);

  if (transfers.length === 0) {
    console.log('[donation-pipeline] no confirmed USDT_TRANSFER transactions to process');
    return;
  }

  console.log(`[donation-pipeline] checking ${transfers.length} USDT_TRANSFER(s) for pending donations`);

  for (const transfer of transfers) {
    // Skip if a CONFIRMED or PENDING DONATION already references this transfer
    const existing = await db.transaction.findFirst({
      where: {
        type: 'DONATION',
        status: { in: ['CONFIRMED', 'PENDING'] },
        metadata: {
          path: ['sourceTxId'],
          equals: transfer.id,
        },
      },
    });

    if (existing) continue;

    await processSingleTransfer(transfer);
    await sleep(2000);
  }
}

export async function triggerDonationForCampaign(campaignId: string, amountUsd: number): Promise<{
  success: boolean;
  donationTxId?: string;
  error?: string;
}> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, goFundMeUrl: true },
  });

  if (!campaign) return { success: false, error: `Campaign ${campaignId} not found` };
  if (!campaign.goFundMeUrl) return { success: false, error: `Campaign has no goFundMeUrl` };

  if (amountUsd < config.donationMinUsd) {
    return { success: false, error: `Amount $${amountUsd} below minimum $${config.donationMinUsd}` };
  }

  const donationTx = await db.transaction.create({
    data: {
      type: 'DONATION',
      campaignId: campaign.id,
      tokenId: null,
      amountSol: 0,
      amountUsd,
      txSignature: null,
      status: 'PENDING',
      metadata: {
        goFundMeUrl: campaign.goFundMeUrl,
        triggeredManually: true,
        donatedAt: new Date().toISOString(),
      },
    },
  });

  try {
    const result = await donateToGoFundMe(campaign.goFundMeUrl, amountUsd);

    if (result.success) {
      await db.$transaction([
        db.transaction.update({
          where: { id: donationTx.id },
          data: {
            status: 'CONFIRMED',
            metadata: {
              goFundMeUrl: campaign.goFundMeUrl,
              screenshotPaths: result.screenshotPaths,
              confirmationText: result.confirmationText ?? '',
              cardLast4: config.koloCardNumber.slice(-4),
              donatedAt: new Date().toISOString(),
              triggeredManually: true,
            },
          },
        }),
        db.campaign.update({
          where: { id: campaign.id },
          data: { totalDonatedUsd: { increment: amountUsd } },
        }),
        db.event.create({
          data: {
            type: 'DONATION_CONFIRMED',
            campaignId: campaign.id,
            message: `[Manual] Donated $${amountUsd.toFixed(2)} to "${campaign.name}" via GoFundMe`,
            data: {
              amountUsd,
              goFundMeUrl: campaign.goFundMeUrl,
              confirmationText: result.confirmationText,
              screenshotPaths: result.screenshotPaths,
              cardLast4: config.koloCardNumber.slice(-4),
              triggeredManually: true,
            },
          },
        }),
      ]);
      return { success: true, donationTxId: donationTx.id };
    } else {
      await db.transaction.update({
        where: { id: donationTx.id },
        data: { status: 'FAILED', metadata: { goFundMeUrl: campaign.goFundMeUrl, error: result.error, screenshotPaths: result.screenshotPaths, triggeredManually: true } },
      });
      return { success: false, donationTxId: donationTx.id, error: result.error };
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.transaction.update({
      where: { id: donationTx.id },
      data: { status: 'FAILED', metadata: { goFundMeUrl: campaign.goFundMeUrl, error, triggeredManually: true } },
    });
    return { success: false, donationTxId: donationTx.id, error };
  }
}

export async function startDonationPipeline(): Promise<void> {
  if (!config.koloCardNumber) {
    console.log('[donation-pipeline] KOLO_CARD_NUMBER not set — donation pipeline disabled');
    return;
  }

  console.log(`[donation-pipeline] starting (interval: ${config.donationIntervalMs}ms)`);

  const run = async (): Promise<void> => {
    try {
      await processPendingDonations();
    } catch (err) {
      console.error('[donation-pipeline] cycle error:', err);
    }
  };

  await run();
  setInterval(run, config.donationIntervalMs);
}
