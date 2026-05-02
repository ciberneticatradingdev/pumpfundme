import { db } from './db';
import { startMonitor } from './fee-monitor';
import { startClaimer } from './fee-claimer';

async function main(): Promise<void> {
  console.log('[index] PumpFundMe backend starting...');

  process.on('unhandledRejection', (reason) => {
    console.error('[index] unhandled rejection:', reason);
  });

  process.on('SIGINT', async () => {
    console.log('[index] received SIGINT, shutting down');
    await db.$disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[index] received SIGTERM, shutting down');
    await db.$disconnect();
    process.exit(0);
  });

  // Start both services in parallel
  await Promise.all([
    startMonitor(),
    startClaimer(),
  ]);

  // Keep process alive
  console.log('[index] all services running');
}

main().catch((err) => {
  console.error('[index] fatal error:', err);
  process.exit(1);
});
