import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, PlayerView, WebConfig } from 'shared';
import {
  GameClient,
  createDevGame,
  loadConfig,
  type ConnStatus,
} from './client';
import { devInitData, tg, tgDisplayName, tgInitData } from './tg';
import { GameTable } from './GameTable';

type FullConfig = WebConfig & { dev?: boolean };

function Boot({ text }: { text: string }) {
  return (
    <div className="boot">
      <div className="spinner" />
      <p>{text}</p>
    </div>
  );
}

function BrowserNotice() {
  return (
    <div className="boot">
      <p className="err">این بازی فقط داخل تلگرام کار می‌کند.</p>
      <p>
        در مرورگر معمولی ورود ممکن نیست. در تلگرام، ربات @SoosisGame_bot را باز
        کنید و دکمهٔ «🎲 ورود به بازی» را بزنید.
      </p>
      <button
        type="button"
        className="ghost"
        onClick={() => {
          window.location.href = 'https://t.me/SoosisGame_bot';
        }}
      >
        باز کردن ربات در تلگرام
      </button>
    </div>
  );
}

function Entry({
  cfg,
  onPick,
}: {
  cfg: FullConfig | null;
  onPick: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const name = tgDisplayName();

  return (
    <div className="entry">
      <h1>🃏 حکم</h1>
      <p className="sub">بازی گروهی در تلگرام</p>
      {name ? <p className="hi">سلام {name}!</p> : null}
      <p>کد بازی را از پیام ربات در گروه وارد کنید:</p>
      <div className="code-row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
          placeholder="کد ۶ رقمی"
          maxLength={6}
          autoCapitalize="characters"
        />
        <button
          type="button"
          className="primary"
          disabled={code.length < 4}
          onClick={() => onPick(code)}
        >
          ورود
        </button>
      </div>
      {cfg?.dev ? (
        <div className="dev-box">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void createDevGame()
                .then(onPick)
                .catch((e: Error) => setErr(e.message));
            }}
          >
            ساخت بازی جدید (لوکال)
          </button>
        </div>
      ) : null}
      {err ? <p className="err">{err}</p> : null}
      <p className="hint-sm">
        یا در گروه دستور <code>/newgame</code> را برای ربات بفرستید و روی دکمه بازی بزنید.
      </p>
    </div>
  );
}

export default function App() {
  const [cfg, setCfg] = useState<FullConfig | null>(null);
  const [code, setCode] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get('g')
  );
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [state, setState] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<GameClient | null>(null);

  useEffect(() => {
    try {
      tg?.ready();
      tg?.expand();
    } catch {
      /* خارج از تلگرام */
    }
    void loadConfig().then(setCfg);
  }, []);

  useEffect(() => {
    if (!error || status === 'fatal') return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(t);
  }, [error, status]);

  useEffect(() => {
    if (!cfg || !code) return;
    const initData = tgInitData() || devInitData();
    const client = new GameClient(cfg, {
      onReady: () => undefined,
      onState: (s) => {
        setState(s);
        setStatus('open');
      },
      onError: setError,
      onStatus: setStatus,
    });
    clientRef.current = client;
    client.connect(code, initData);
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, [cfg, code]);

  const act = useCallback((a: Action) => {
    clientRef.current?.act(a);
  }, []);

  const pick = useCallback((c: string) => {
    const base = import.meta.env.BASE_URL;
    window.history.replaceState(
      {},
      '',
      c ? `${base}?g=${encodeURIComponent(c)}` : base
    );
    setCode(c || null);
  }, []);

  if (!cfg) return <Boot text="در حال اتصال…" />;

  if (cfg && !cfg.dev && !tgInitData()) return <BrowserNotice />;

  if (!code) return <Entry cfg={cfg} onPick={pick} />;

  if (status === 'fatal') {
    return (
      <div className="boot">
        <p className="err">اتصال برقرار نشد.</p>
        <p>{error ?? 'کد بازی یا ورود شما معتبر نیست.'}</p>
        <button type="button" className="ghost" onClick={() => pick('')}>
          بازگشت
        </button>
      </div>
    );
  }

  if (!state) return <Boot text={status === 'open' ? 'دریافت وضعیت…' : 'در حال اتصال…'} />;

  return (
    <div className="app">
      {status !== 'open' ? (
        <div className="banner reconnect">اتصال قطع است — تلاش مجدد…</div>
      ) : null}
      {error ? (
        <div className="toast" onClick={() => setError(null)} role="alert">
          {error}
        </div>
      ) : null}
      <GameTable state={state} act={act} />
    </div>
  );
}
