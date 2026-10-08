import type { Action, AnyView, ClientMsg, ServerMsg, WebConfig } from 'shared';

export type ConnStatus = 'connecting' | 'open' | 'closed' | 'fatal';

export interface ClientHandlers {
  onReady: (user: { id: string; name: string }) => void;
  onState: (state: AnyView) => void;
  onError: (message: string) => void;
  onStatus: (status: ConnStatus) => void;
}

export async function loadConfig(): Promise<WebConfig & { dev?: boolean }> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as WebConfig & { dev?: boolean };
      if (data && typeof data.ws === 'string' && data.ws) return data;
    }
  } catch {
    /* fallback زیر */
  }
  return { ws: 'http://127.0.0.1:8787', dev: true };
}

function toWsBase(httpBase: string): string {
  return httpBase.replace(/^http/, 'ws').replace(/\/+$/, '');
}

export class GameClient {
  private ws: WebSocket | null = null;
  private retryMs = 1000;
  private disposed = false;
  private failCount = 0;
  private lastError: string | null = null;
  private stateQ: AnyView[] = [];
  private flushScheduled = false;

  constructor(
    private readonly cfg: WebConfig,
    private readonly handlers: ClientHandlers
  ) {}

  private queueState(s: AnyView): void {
    this.stateQ.push(s);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushScheduled || this.disposed) return;
    this.flushScheduled = true;
    const run = () => {
      this.flushScheduled = false;
      if (this.disposed) {
        this.stateQ = [];
        return;
      }
      const next = this.stateQ.shift();
      if (next !== undefined) this.handlers.onState(next);
      if (this.stateQ.length > 0) this.scheduleFlush();
    };
    if (typeof document !== 'undefined' && document.hidden) {
      window.setTimeout(run, 16);
    } else {
      window.requestAnimationFrame(run);
    }
  }

  connect(gameCode: string, initData: string): void {
    if (this.disposed) return;
    const url = `${toWsBase(this.cfg.ws)}/ws?game=${encodeURIComponent(
      gameCode
    )}&initData=${encodeURIComponent(initData)}`;
    this.handlers.onStatus('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retryMs = 1000;
      this.failCount = 0;
      this.lastError = null;
      this.handlers.onStatus('open');
      ws.send(JSON.stringify({ t: 'sync' } satisfies ClientMsg));
    };

    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      if (msg.t === 'ready') this.handlers.onReady(msg.user);
      else if (msg.t === 'state') this.queueState(msg.state);
      else if (msg.t === 'error') {
        this.lastError = msg.message;
        this.handlers.onError(msg.message);
      }
    };

    ws.onclose = (ev) => {
      if (this.disposed) return;
      if (ev.code === 4001) {
        this.handlers.onStatus('fatal');
        this.handlers.onError(
          this.lastError ?? 'اتصال رد شد؛ کد بازی یا ورود شما معتبر نیست'
        );
        return;
      }
      this.failCount++;
      if (this.failCount >= 8) {
        this.handlers.onStatus('fatal');
        this.handlers.onError(
          this.lastError ?? 'اتصال برقرار نشد؛ بعداً دوباره تلاش کنید'
        );
        return;
      }
      this.handlers.onStatus('closed');
      const wait = this.retryMs;
      this.retryMs = Math.min(this.retryMs * 2, 10000);
      window.setTimeout(() => this.connect(gameCode, initData), wait);
    };

    ws.onerror = () => {
      /* رویداد close در پی می‌آید */
    };
  }

  act(action: Action): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: 'act', action } satisfies ClientMsg));
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stateQ = [];
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

export async function createDevGame(): Promise<string> {
  const cfg = await loadConfig();
  const base = cfg.ws.replace(/\/+$/, '');
  const res = await fetch(`${base}/dev/games`, { method: 'POST' });
  if (!res.ok) throw new Error('ساخت بازی ممکن نشد (ALLOW_DEV روی سرور نیست؟)');
  const data = (await res.json()) as { id: string };
  return data.id;
}
