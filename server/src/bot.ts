import { Bot, InlineKeyboard } from 'grammy';
import type { ManagedGame } from 'shared';
import type { Config } from './config';
import type { GameStore } from './store';

export interface BotHandle {
  notifyMatchEnd: (game: ManagedGame) => Promise<void>;
  sendOwner: (text: string) => Promise<void>;
  stop: () => void;
}

const HELP = `🃏 ربات بازی‌های گروهی — حکم

/newgame — ساخت بازی حکم ۴ نفره (در گروه)
/newgame2 — ساخت بازی حکم ۲ نفره
/games — فهرست بازی‌های در انتظار
/help — راهنما

۴ نفر: یارکشی با اولین آس، کوپ، تعیین حکم، بازی ۷ دستی، کت و بام.
۲ نفر: اولین آس حاکم، حکم را خودش انتخاب می‌کند، ۵ ورق پخش + سوزاندن ۲ ورق، برداشت زوجی از زمین تا ۱۳ ورق، بازی ۷ دستی.`;

function matchText(game: ManagedGame): string {
  const isTwo = game.mode === '2';
  const names = game.players
    .map((p, i) => {
      if (!p) return null;
      return isTwo ? p.name : `${p.name}${i % 2 === 0 ? ' 🅰' : ' 🅱'}`;
    })
    .filter(Boolean)
    .join('، ');
  const winner = game.matchWinner === null
    ? '—'
    : isTwo
      ? (game.players[game.matchWinner]?.name ?? '—')
      : game.matchWinner === 0
        ? 'تیم اول'
        : 'تیم دوم';
  return [
    `🏆 پایان مسابقهٔ ${isTwo ? 'حکم دو نفره' : 'حکم'} (${game.id})`,
    `نتیجهٔ نهایی: ${game.points[0]} - ${game.points[1]}`,
    `برنده: ${winner}`,
    `بازیکنان: ${names}`,
  ].join('\n');
}

export function createBot(cfg: Config, store: GameStore): BotHandle | null {
  if (!cfg.botToken) {
    console.warn('[bot] BOT_TOKEN تنظیم نشده — ربات تلگرام غیرفعال است');
    return null;
  }

  const bot = new Bot(cfg.botToken);

  bot.command('start', (ctx) => ctx.reply(HELP));
  bot.command('help', (ctx) => ctx.reply(HELP));

  bot.command('newgame', async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? null : ctx.chat.id;
    const game = store.create(chatId, '4');
    const url = `${cfg.webappUrl}?g=${game.id}`;
    const kb = new InlineKeyboard().webApp('🎲 ورود به بازی', url);
    await ctx.reply(
      `🃏 بازی حکم ۴ نفره — کد: ${game.id}\n۴ بازیکن دکمه را بزنند تا جوین شوند و بازی شروع شود.`,
      { reply_markup: kb }
    );
  });

  bot.command('newgame2', async (ctx) => {
    const chatId = ctx.chat.type === 'private' ? null : ctx.chat.id;
    const game = store.create(chatId, '2');
    const url = `${cfg.webappUrl}?g=${game.id}`;
    const kb = new InlineKeyboard().webApp('🎲 ورود به بازی', url);
    await ctx.reply(
      `🃏 بازی حکم دو نفره — کد: ${game.id}\n۲ بازیکن دکمه را بزنند تا جوین شوند و بازی شروع شود.`,
      { reply_markup: kb }
    );
  });

  bot.command('games', async (ctx) => {
    const games = store.lobbyGames().slice(0, 10);
    if (games.length === 0) {
      await ctx.reply('بازی‌ای وجود ندارد. با /newgame یا /newgame2 یکی بسازید.');
      return;
    }
    const kb = new InlineKeyboard();
    for (const g of games) {
      const cap = g.mode === '2' ? 2 : 4;
      const kind = g.mode === '2' ? '۲نفره' : '۴نفره';
      kb.webApp(`بازی ${g.id} — ${kind} (${g.players.filter(Boolean).length}/${cap})`, `${cfg.webappUrl}?g=${g.id}`);
    }
    await ctx.reply('🎮 بازی‌های در انتظار:', { reply_markup: kb });
  });

  bot.catch((err) => {
    const e = err.error;
    console.error('[bot] error:', e instanceof Error ? e.message : String(e));
  });

  bot.start({
    onStart: (info) => console.log(`[bot] polling as @${info.username}`),
  }).catch((e) => {
    console.error('[bot] polling failed:', e?.message ?? e);
  });

  return {
    notifyMatchEnd: async (game) => {
      if (game.chatId === null) return;
      try {
        await bot.api.sendMessage(game.chatId, matchText(game));
      } catch (e) {
        console.warn('[bot] notify failed:', (e as Error)?.message);
      }
    },
    sendOwner: async (text) => {
      if (!cfg.ownerId) return;
      try {
        await bot.api.sendMessage(cfg.ownerId, text);
      } catch (e) {
        console.warn('[bot] owner notify failed:', (e as Error)?.message);
      }
    },
    stop: () => {
      try {
        bot.stop();
      } catch {
        /* ignore */
      }
    },
  };
}
