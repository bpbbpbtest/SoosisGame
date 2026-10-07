import http from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { GameError, type Action, type ClientMsg, type HokmGame, type ServerMsg } from 'shared';
import type { Config } from './config';
import { verifyInitData, type AuthedUser } from './auth';
import type { GameStore } from './store';

interface Conn {
  ws: WebSocket;
  user: AuthedUser;
  game: HokmGame;
  seat: number | null;
}

export interface ServerHooks {
  onMatchEnd: (game: HokmGame) => void;
}

export interface RunningServer {
  httpServer: http.Server;
  close: () => Promise<void>;
}

export function startGameServer(cfg: Config, store: GameStore, hooks: ServerHooks): RunningServer {
  const connsByGame = new Map<string, Set<Conn>>();
  const wss = new WebSocketServer({ noServer: true });

  function send(conn: Conn, msg: ServerMsg): void {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(JSON.stringify(msg));
  }

  function sendState(conn: Conn): void {
    send(conn, { t: 'state', state: conn.game.view(conn.seat) });
  }

  function broadcast(game: HokmGame): void {
    const set = connsByGame.get(game.id);
    if (!set || set.size === 0) return;
    for (const conn of set) sendState(conn);
    if (game.phase === 'matchEnd' && !game.notifiedEnd) {
      game.notifiedEnd = true;
      hooks.onMatchEnd(game);
    }
  }

  function addConn(conn: Conn): void {
    let set = connsByGame.get(conn.game.id);
    if (!set) {
      set = new Set();
      connsByGame.set(conn.game.id, set);
    }
    set.add(conn);
  }

  function removeConn(conn: Conn): void {
    connsByGame.get(conn.game.id)?.delete(conn);
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
          g.chooseBam(id, action.cont);
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
          break;
      }
      broadcast(g);
    } catch (e) {
      const message = e instanceof GameError ? e.message : 'خطای ناشناخته';
      send(conn, { t: 'error', message });
      sendState(conn);
    }
  }

  function parseConn(req: IncomingMessage): { user: AuthedUser; game: HokmGame } | { error: string } {
    const url = new URL(req.url || '/', 'http://localhost');
    const initData = url.searchParams.get('initData') || '';
    const code = (url.searchParams.get('game') || '').toUpperCase();
    const user = verifyInitData(initData, cfg.botToken, cfg.allowDev);
    if (!user) return { error: 'احراز هویت ناموفق بود' };
    const game = store.get(code);
    if (!game) return { error: 'بازی یافت نشد' };
    return { user, game };
  }

  function seatFor(game: HokmGame, user: AuthedUser): number | null {
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: 'error', message: parsed.error } satisfies ServerMsg));
      }
      ws.close(4001, parsed.error);
      return;
    }
    const { user, game } = parsed;
    const conn: Conn = { ws, user, game, seat: seatFor(game, user) };
    addConn(conn);
    send(conn, { t: 'ready', user: { id: user.id, name: user.name } });
    broadcast(game); // وضعیت جدید (مثلاً جوین شدن) به همه برسد

    ws.on('message', (raw) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw)) as ClientMsg;
      } catch {
        return;
      }
      if (msg.t === 'act') handleAction(conn, msg.action);
      else if (msg.t === 'sync') sendState(conn);
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
    const parsed = parseConn(req);
    if ('error' in parsed) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  // ---- timer: زمان‌بند خودکار + GC ----
  let tick = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const game of store.all()) {
      try {
        if (game.autoAdvance(now)) broadcast(game);
      } catch {
        /* خطای زمان‌بند نباید سرور را بیندازد */
      }
      if (++tick % 60 === 0) store.gc(now);
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
