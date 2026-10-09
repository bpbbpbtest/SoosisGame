import { Bot, InlineKeyboard, type Context } from 'grammy';
import type { BotCommand, ReplyKeyboardMarkup } from 'grammy/types';
import type { GameMode, ManagedGame } from 'shared';
import type { Config } from './config';
import type { GameStore } from './store';

export interface BotHandle {
  notifyMatchEnd: (game: ManagedGame) => Promise<void>;
  sendOwner: (text: string) => Promise<void>;
  stop: () => void;
}

const HELP = `🃏 ربات بازی‌های گروهی — حکم

دکمه‌های زیر را بزنید — نیازی به تایپ دستور نیست:
🎲 بازی ۴ نفره — ساخت بازی تیمی
🎲 بازی ۲ نفره — ساخت بازی دونفره
🎮 بازی‌های در انتظار — پیوستن به بازی موجود
❓ راهنما — همین پیام

دستورات همچنان کار می‌کنند: /newgame — /newgame2 — /games — /help

۴ نفر: یارکشی با اولین آس، کوپ، تعیین حکم، بازی ۷ دستی، کت و بام.
۲ نفر: اولین آس حاکم، حکم را خودش انتخاب می‌کند، ۵ ورق پخش + سوزاندن ۲ ورق، برداشت زوجی از زمین تا ۱۳ ورق، بازی ۷ دستی.`;

// کیبورد دائمی زیر نوشتن — جایگزین دستورات
const MENU: ReplyKeyboardMarkup = {
  keyboard: [
    [{ text: '🎲 بازی ۴ نفره' }, { text: '🎲 بازی ۲ نفره' }],
    [{ text: '🎮 بازی‌های در انتظار' }, { text: '❓ راهنما' }],
    [{ text: '❌ بستن کیبورد' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const COMMANDS: BotCommand[] = [
  { command: 'newgame', description: '🎲 ساخت بازی حکم ۴ نفره' },
  { command: 'newgame2', description: '🎲 ساخت بازی حکم ۲ نفره' },
  { command: 'games', description: '🎮 بازی‌های در انتظار' },
  { command: 'help', description: '❓ راهنما' },
];

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
    'دکمه‌های زیر را بزنید تا بازی جدیدی ساخته شود.',
  ].join('\n');
}

export function createBot(cfg: Config, store: GameStore): BotHandle | null {
  if (!cfg.botToken) {
    console.warn('[bot] BOT_TOKEN تنظیم نشده — ربات تلگرام غیرفعال است');
    return null;
  }

  const bot = new Bot(cfg.botToken);

  const sendHelp = async (ctx: Context): Promise<void> => {
    await ctx.reply(HELP, { reply_markup: MENU });
  };

  const startGame = async (ctx: Context, mode: GameMode): Promise<void> => {
    const chatId = ctx.chat?.type === 'private' ? null : ctx.chat?.id ?? null;
    const game = store.create(chatId, mode);
    const url = `${cfg.webappUrl}?g=${game.id}`;
    const kb = new InlineKeyboard().webApp('🎲 ورود به بازی', url);
    const cap = mode === '2' ? 2 : 4;
    const label = mode === '2' ? 'حکم دو نفره' : 'حکم ۴ نفره';
    await ctx.reply(
      `🃏 بازی ${label} — کد: ${game.id}\n${cap} بازیکن دکمه را بزنند تا جوین شوند و بازی شروع شود.`,
      { reply_markup: kb }
    );
  };

  const listGames = async (ctx: Context): Promise<void> => {
    const games = store.lobbyGames().slice(0, 10);
    if (games.length === 0) {
      await ctx.reply('بازی‌ای وجود ندارد؛ با دکمهٔ «🎲 بازی ۴ نفره» یا «🎲 بازی ۲ نفره» یکی بسازید.');
      return;
    }
    const kb = new InlineKeyboard();
    for (const g of games) {
      const cap = g.mode === '2' ? 2 : 4;
      const kind = g.mode === '2' ? '۲نفره' : '۴نفره';
      kb.webApp(
        `بازی ${g.id} — ${kind} (${g.players.filter(Boolean).length}/${cap})`,
        `${cfg.webappUrl}?g=${g.id}`
      );
    }
    await ctx.reply('🎮 بازی‌های در انتظار:', { reply_markup: kb });
  };

  // ---- دستورات (همچنان کار می‌کنند) ----
  bot.command('start', sendHelp);
  bot.command('help', sendHelp);
  bot.command('newgame', (ctx) => startGame(ctx, '4'));
  bot.command('newgame2', (ctx) => startGame(ctx, '2'));
  bot.command('games', listGames);

  // ---- دکمه‌های کیبورد ----
  bot.on('message:text', async (ctx) => {
    const t = ctx.message.text.trim();
    if (t === '🎲 بازی ۴ نفره') return startGame(ctx, '4');
    if (t === '🎲 بازی ۲ نفره') return startGame(ctx, '2');
    if (t === '🎮 بازی‌های در انتظار') return listGames(ctx);
    if (t === '❓ راهنما') return sendHelp(ctx);
    if (t === '❌ بستن کیبورد') {
      await ctx.reply('کیبورد بسته شد — برای بازگشت /start بزنید.', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }
    // متن آزاد فقط در چت خصوصی پاسخ بگیرد تا گروه شلوغ نشود
    if (ctx.chat?.type === 'private') {
      await ctx.reply('از دکمه‌های زیر استفاده کنید یا /help بزنید.', { reply_markup: MENU });
    }
  });

  // منوی / در تلگرام (فهرست دستورات با توضیح فارسی)
  bot.api.setMyCommands(COMMANDS).catch((e) => {
    console.warn('[bot] setMyCommands failed:', (e as Error)?.message);
  });
  bot.api.setMyCommands(COMMANDS, { scope: { type: 'all_group_chats' } }).catch((e) => {
    console.warn('[bot] setMyCommands (groups) failed:', (e as Error)?.message);
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
        await bot.api.sendMessage(game.chatId, matchText(game), { reply_markup: MENU });
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
