import { loadConfig } from './config';
import { GameStore } from './store';
import { startGameServer } from './ws';
import { createBot, type BotHandle } from './bot';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const store = new GameStore(cfg.matchTarget);

  let bot: BotHandle | null = null;

  const server = startGameServer(cfg, store, {
    onMatchEnd: (game) => {
      void bot?.notifyMatchEnd(game);
    },
  });

  bot = createBot(cfg, store);

  console.log(
    `[server] listening on :${cfg.port} | dev=${cfg.allowDev} | bot=${cfg.botToken ? 'on' : 'off'} | matchTarget=${cfg.matchTarget}`
  );
  if (!cfg.allowDev && !cfg.botToken) {
    console.warn('[server] بدون BOT_TOKEN و بدون ALLOW_DEV هیچ کلاینتی نمی‌تواند وصل شود');
  }

  await bot?.sendOwner(`🟢 ربات حکم آنلاین شد (webapp: ${cfg.webappUrl})`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down...`);
    await bot?.sendOwner('🔴 ربات حکم آفلاین شد');
    bot?.stop();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error('[server] uncaughtException:', err);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[server] unhandledRejection:', reason);
    process.exit(1);
  });
}

main().catch((e) => {
  console.error('[server] fatal:', e);
  process.exit(1);
});
