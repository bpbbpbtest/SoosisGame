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
  // آخرین اکشنِ ارسال‌نشده (اتصال قطع بود) — بلافاصله بعد از باز شدن فرستاده می‌شود
  private pendingAction: Action | null = null;
  private lastIn = 0;
  private keepalive: number | null = null;
  private code = '';
  private initData = '';
  private reconnectTimer: number | null = null;
  private fatalAuth = false;

  constructor(
    private readonly cfg: WebConfig,
    private readonly handlers: ClientHandlers
  ) {
    // برگشت شبکه (مثلاً خروج از حالت هواپیما): بلافاصله تلاش مجدد، بدون انتظار backoff
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }
  }

  private handleOnline = (): void => {
    if (this.disposed || this.fatalAuth || !this.code) return;
    const ws = this.ws;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.failCount = 0;
    this.retryMs = 1000;
    this.connect(this.code, this.initData);
  };

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

  // نگه‌بان سلامت اتصال: هر ۳۰ ثانیه sync می‌فرستد؛ اگر ۹۰ ثانیه هیچ پیامی
  // نرسیده باشد (اتصال نیمه‌باز — موبایل در پس‌زمینه، قطعی NAT) اتصال را
  // می‌بندد تا مسیر reconnect معمولی اجرا شود
  private startKeepalive(): void {
    this.stopKeepalive();
    this.lastIn = Date.now();
    this.keepalive = window.setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastIn > 90_000) {
        try {
          ws.close();
        } catch {
          /* مسیر onclose اجرا می‌شود */
        }
        return;
      }
      try {
        ws.send(JSON.stringify({ t: 'sync' } satisfies ClientMsg));
      } catch {
        /* ارسال نشد — در تلاش بعدی دوباره */
      }
    }, 30_000);
  }

  private stopKeepalive(): void {
    if (this.keepalive !== null) {
      window.clearInterval(this.keepalive);
      this.keepalive = null;
    }
  }

  connect(gameCode: string, initData: string): void {
    if (this.disposed) return;
    this.code = gameCode;
    this.initData = initData;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const url = `${toWsBase(this.cfg.ws)}/ws?game=${encodeURIComponent(
      gameCode
    )}&initData=${encodeURIComponent(initData)}`;
    this.handlers.onStatus('connecting');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retryMs = 1000;
      this.failCount = 0;
      this.lastError = null;
      this.handlers.onStatus('open');
      this.startKeepalive();
      ws.send(JSON.stringify({ t: 'sync' } satisfies ClientMsg));
      // اکشنی که حین قطعی زده شده بود حالا ارسال می‌شود (سرور صحت آن را می‌سنجد)
      if (this.pendingAction) {
        const a = this.pendingAction;
        this.pendingAction = null;
        ws.send(JSON.stringify({ t: 'act', action: a } satisfies ClientMsg));
      }
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.lastIn = Date.now();
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
      // رویدادِ سوکتِ قدیمی — اتصال تازه‌ای جانشین شده و مال خودش را مدیریت می‌کند
      if (this.ws !== ws) return;
      this.stopKeepalive();
      if (this.disposed) return;
      if (ev.code === 4001) {
        this.pendingAction = null;
        this.fatalAuth = true;
        this.handlers.onStatus('fatal');
        this.handlers.onError(
          this.lastError ?? 'اتصال رد شد؛ کد بازی یا ورود شما معتبر نیست'
        );
        return;
      }
      this.failCount++;
      if (this.failCount >= 8) {
        this.pendingAction = null;
        this.handlers.onStatus('fatal');
        this.handlers.onError(
          this.lastError ?? 'اتصال برقرار نشد؛ بعداً دوباره تلاش کنید'
        );
        return;
      }
      this.handlers.onStatus('closed');
      const wait = this.retryMs;
      this.retryMs = Math.min(this.retryMs * 2, 10000);
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect(gameCode, initData);
      }, wait);
    };

    ws.onerror = () => {
      /* رویداد close در پی می‌آید */
    };
  }

  act(action: Action): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ t: 'act', action } satisfies ClientMsg));
        return;
      } catch {
        /* ارسال نشد — مثل حالت قطعی، زیر بار می‌رود */
      }
    }
    // اتصال سالم نیست: آخرین اکشن نگه داشته می‌شود تا با اولین اتصال برود
    this.pendingAction = action;
  }

  dispose(): void {
    this.disposed = true;
    this.stateQ = [];
    this.pendingAction = null;
    this.stopKeepalive();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
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
