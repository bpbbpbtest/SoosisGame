import { useEffect, useState } from 'react';
import type { CardId } from 'shared';

export interface RevealCard {
  seat: number;
  card: CardId;
  ace: boolean;
}

export interface AceReveal {
  total: number;
  revealed: number;
  running: boolean;
  done: boolean;
  active: boolean;
  cards: RevealCard[];
}

const STEP_MS = 850;
const TICK_MS = 150;
const KEY_PREFIX = 'hokm-reveal|';

const memAnchors = new Map<string, number>();

function readAnchor(key: string): number {
  const mem = memAnchors.get(key);
  if (mem !== undefined) return mem;
  let v = NaN;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw) v = Number(raw);
  } catch {
    /* ذخیره‌سازی در دسترس نیست */
  }
  if (!Number.isFinite(v)) v = Date.now();
  memAnchors.set(key, v);
  try {
    window.sessionStorage.setItem(key, String(v));
  } catch {
    /* ذخیره‌سازی در دسترس نیست */
  }
  return v;
}

function claimAnchor(key: string): number {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX) && k !== key) stale.push(k);
    }
    for (const k of stale) window.sessionStorage.removeItem(k);
  } catch {
    /* ذخیره‌سازی در دسترس نیست */
  }
  for (const k of [...memAnchors.keys()]) {
    if (k.startsWith(KEY_PREFIX) && k !== key) memAnchors.delete(k);
  }
  return readAnchor(key);
}

/** تعیین حاکم: کارت‌ها را یکی‌یکی (به نوبت هر نشست) تا آمدن آس نمایش می‌دهد */
export function useAceReveal(
  aceLog: CardId[],
  hakem: number | null,
  seats: 2 | 4,
): AceReveal {
  const total = aceLog.length;
  const sig = total > 0 && hakem !== null ? `${hakem}|${aceLog.join('')}` : '';
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!sig) return;
    const key = KEY_PREFIX + sig;
    const anchor = claimAnchor(key);
    const t = window.setInterval(() => {
      if (Date.now() - anchor >= (total - 1) * STEP_MS + 160) {
        setTick((x) => x + 1);
        window.clearInterval(t);
        return;
      }
      setTick((x) => x + 1);
    }, TICK_MS);
    return () => window.clearInterval(t);
  }, [sig, total]);

  let shown = 0;
  if (sig) {
    const anchor = readAnchor(KEY_PREFIX + sig);
    shown = Math.min(total, Math.floor((Date.now() - anchor) / STEP_MS) + 1);
  }

  const active = sig !== '';
  const done = active && shown >= total;
  const running = active && shown < total;
  const startSeat =
    hakem !== null && total > 0 ? (((hakem - (total - 1)) % seats) + seats) % seats : 0;
  const cards: RevealCard[] = [];
  if (active) {
    for (let i = 0; i < shown; i++) {
      cards.push({
        seat: (startSeat + i) % seats,
        card: aceLog[i] as CardId,
        ace: i === total - 1,
      });
    }
  }
  return { total, revealed: shown, running, done, active, cards };
}
