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

const STEP_MS = 400;

/** تعیین حاکم: کارت‌ها را یکی‌یکی (به نوبت هر نشست) تا آمدن آس نمایش می‌دهد */
export function useAceReveal(
  aceLog: CardId[],
  hakem: number | null,
  seats: 2 | 4,
): AceReveal {
  const total = aceLog.length;
  const sig = total > 0 && hakem !== null ? `${hakem}|${aceLog.join('')}` : '';
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (!sig) {
      setRevealed(0);
      return;
    }
    if (total <= 1) {
      setRevealed(total);
      return;
    }
    setRevealed(1);
    let i = 1;
    const t = setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= total) clearInterval(t);
    }, STEP_MS);
    return () => clearInterval(t);
  }, [sig, total]);

  const active = sig !== '';
  const shown = Math.min(revealed, total);
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
