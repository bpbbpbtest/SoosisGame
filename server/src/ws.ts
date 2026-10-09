import http from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { GameError, type Action, type ClientMsg, type ManagedGame, type ServerMsg } from 'shared';
import type { Config } from './config';
import { verifyInitData, type AuthedUser } from './auth';
import type { GameStore } from './store';

interface Conn {
  ws: WebSocket;
  user: AuthedUser;
  game: ManagedGame;
  // بازیکنی که خودش از لابی خارج شده دوباره به‌خودکار جوین نشود
  left: boolean;
}

export interface ServerHooks {
  onMatchEnd: (game: ManagedGame) => void;
}

export interface RunningServer {
  httpServer: http.Server;
  close: () => Promise<void>;
}

export function startGameServer(cfg: Config, store: GameStore, hooks: ServerHooks): RunningServer {
  const connsByGame = new Map<string, Set<Conn>>();
  // پیام‌های کلاینت باید کوچک باشند — جلوی payload سنگین از ابتدا گرفته می‌شود
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  function send(conn: Conn, msg: ServerMsg): void {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  function sendState(conn: Conn): void {
    // صندلی هر پیام دوباره محاسبه می‌شود — بعد از leave/restart نباید
    // کانکشن قدیمی همچنان صندلی قبلی را ببیند (ویرایش دست بازیکن دیگر!)
    const seat = conn.game.seatOf(conn.user.id);
    send(conn, { t: 'state', state: conn.game.view(seat) });
  }

  function broadcast(game: ManagedGame): void {
    if (game.phase === 'matchEnd' && !game.notifiedEnd) {
      game.notifiedEnd = true;
      hooks.onMatchEnd(game);
    }
    const set = connsByGame.get(game.id);
    if (!set || set.size === 0) return;
    for (const conn of set) sendState(conn);
  }

  function addConn(conn: Conn): void {
    let set = connsByGame.get(conn.game.id);
    if (!set) {
      set = new Set();
      connsByGame.set(conn.game.id, set);
    }
    set.add(conn);
    // وسطِ دست (قبل از حل) هم به همه فرستاده شود تا کارتِ حریف دیده شود
    const game = conn.game;
    game.onFlush = () => broadcast(game);
  }

  function removeConn(conn: Conn): void {
    const set = connsByGame.get(conn.game.id);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) connsByGame.delete(conn.game.id);
  }

  // بازگشت به صندلی در لابی هنگام sync (اتصالِ تازه یا جا باز شده) — نه بعد از خروجِ خودخواسته
  function refreshLobbySeat(conn: Conn): void {
    if (conn.left) return;
    if (conn.game.phase !== 'lobby') return;
    if (conn.game.seatOf(conn.user.id) !== null) return;
    try {
      conn.game.join(conn.user);
      broadcast(conn.game);
    } catch {
      /* لابی پر است — تماشاچی می‌ماند */
    }
  }

  function handleAction(conn: Conn, action: Action): void {
    const g = conn.game;
    const id = conn.user.id;
    try {
      switch (action.k) {
        case 'start':
          g.start(id);
          break;
        case 'cut':
          g.cut(id, action.index);
          break;
        case 'trump':
          g.chooseTrump(id, action.suit);
          break;
        case 'redeal':
          g.requestRedeal(id);
          break;
        case 'vote':
          g.voteRedeal(id);
          break;
        case 'play':
          g.play(id, action.card);
          break;
        case 'bam':
          if (typeof action.cont !== 'boolean') throw new GameError('درخواست نامعتبر');
          g.chooseBam(id, action.cont);
          break;
        case 'burn':
          g.burnCards(id, action.cards);
          break;
        case 'drawPick':
          if (typeof action.keep !== 'boolean') throw new GameError('درخواست نامعتبر');
          g.drawPick(id, action.keep);
          break;
        case 'next':
          g.nextRound(id);
          break;
        case 'restart':
          g.restart(id);
          break;
        case 'forfeit':
          g.forfeit(id);
          break;
        case 'leave':
          g.leave(id);
          conn.left = true;
          break;
      }
      broadcast(g);
    } catch (e) {
      if (e instanceof GameError) {
        send(conn, { t: 'error', message: e.message });
      } else {
        // خطای غیرمنتظره را لاگ کن تا در تولید قابل ردیابی باشد
        console.error('[ws] unexpected action error', e);
        send(conn, { t: 'error', message: 'خطای ناشناخته' });
      }
      sendState(conn);
    }
  }

  function parseConn(req: IncomingMessage): { user: AuthedUser; game: ManagedGame } | { error: string } {
    const url = new URL(req.url || '/', 'http://localhost');
    const initData = url.searchParams.get('initData') || '';
    const code = (url.searchParams.get('game') || '').toUpperCase();
    const user = verifyInitData(initData, cfg.botToken, cfg.allowDev);
    if (!user) return { error: 'احراز هویت ناموفق بود' };
    const game = store.get(code);
    if (!game) return { error: 'بازی یافت نشد' };
    return { user, game };
  }

  function seatFor(game: ManagedGame, user: AuthedUser): number | null {
    const existing = game.seatOf(user.id);
    if (existing !== null) return existing;
    if (game.phase === 'lobby') {
      try {
        return game.join(user);
      } catch {
        return null;
      }
    }
    return null;
  }

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const parsed = parseConn(req);
    if ('error' in parsed) {
      console.log(`[ws] rejected: ${parsed.error}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: 'error', message: parsed.error } satisfies ServerMsg));
      }
      ws.close(4001, parsed.error);
      return;
    }
    const { user, game } = parsed;
    // صندلی بگیر یا (در لابی) جوین شو — بعد از هر پیام sendState دوباره محاسبه می‌شود
    seatFor(game, user);
    const conn: Conn = { ws, user, game, left: false };
    addConn(conn);
    send(conn, { t: 'ready', user: { id: user.id, name: user.name } });
    broadcast(game); // وضعیت جدید (مثلاً جوین شدن) به همه برسد

    // سقف پیام در ثانیه — هر پیامِ اضافه بی‌صدا نادیده گرفته می‌شود (بدون kick)
    let msgCount = 0;
    let msgWindow = Date.now();

    ws.on('message', (raw) => {
      const t = Date.now();
      if (t - msgWindow >= 1000) {
        msgWindow = t;
        msgCount = 0;
      }
      if (++msgCount > 30) return;
      // هر پیام خام باید بی‌خطر باشد — JSON.parse می‌تواند null/عدد/رشته برگرداند
      // و دسترسی به property روی آن کل سرور را می‌اندازد
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;
      const msg = parsed as Partial<ClientMsg>;
      if (msg.t === 'act') {
        if (!msg.action || typeof msg.action !== 'object') return;
        handleAction(conn, msg.action as Action);
      } else if (msg.t === 'sync') {
        refreshLobbySeat(conn);
        sendState(conn);
      }
    });

    ws.on('close', () => removeConn(conn));
    ws.on('error', () => removeConn(conn));
  });

  // ---- HTTP routes ----
  const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');

    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, games: store.all().length }));
      return;
    }

    if (url.pathname === '/dev/games' && cfg.allowDev) {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (req.method === 'POST') {
        const game = store.create(null);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: game.id }));
        return;
      }
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    // احراز هویت در connection handler انجام می‌شود تا خطای واقعی با کد 4001 به کلاینت برسد
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  // ---- timer: زمان‌بند خودکار + GC ----
  let lastGc = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    if (now - lastGc >= 60_000) {
      lastGc = now;
      store.gc(now, (id) => (connsByGame.get(id)?.size ?? 0) > 0);
    }
    for (const game of store.all()) {
      try {
        if (game.autoAdvance(now)) broadcast(game);
      } catch {
        /* خطای زمان‌بند نباید سرور را بیندازد */
      }
    }
  }, 1000);

  httpServer.listen(cfg.port);

  return {
    httpServer,
    close: async () => {
      clearInterval(timer);
      for (const set of connsByGame.values()) for (const c of set) c.ws.close(1001, 'shutting down');
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
