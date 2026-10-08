export type Suit = 'H' | 'D' | 'C' | 'S';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type CardId = string;

export const SUITS: Suit[] = ['H', 'D', 'C', 'S'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export const SUIT_FA: Record<Suit, string> = {
  H: 'دل',
  D: 'خشت',
  C: 'گشنیز',
  S: 'پیک',
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  H: '♥',
  D: '♦',
  C: '♣',
  S: '♠',
};

export const RANK_FA: Record<Rank, string> = {
  '2': 'دو',
  '3': 'سه',
  '4': 'چهار',
  '5': 'پنج',
  '6': 'شش',
  '7': 'هفت',
  '8': 'هشت',
  '9': 'نه',
  T: 'ده',
  J: 'سرباز',
  Q: 'بی‌بی',
  K: 'شاه',
  A: 'تک',
};

export const RANK_DISPLAY: Record<Rank, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
};

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D';
}

export function suitOf(card: CardId): Suit {
  return card[0] as Suit;
}

export function rankOf(card: CardId): Rank {
  return card.slice(1) as Rank;
}

/** 2..14 — ترتیب ارزش ورق‌ها: 2 کمینه، A بیشینه */
export function rankValue(rank: Rank): number {
  return RANKS.indexOf(rank) + 2;
}

export function cardValue(card: CardId): number {
  return rankValue(rankOf(card));
}

export function isPicture(card: CardId): boolean {
  const r = rankOf(card);
  return r === 'J' || r === 'Q' || r === 'K' || r === 'A';
}

export function cardName(card: CardId): string {
  return `${RANK_FA[rankOf(card)]} ${SUIT_FA[suitOf(card)]}`;
}

export function fullDeck(): CardId[] {
  const deck: CardId[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(s + r);
  return deck;
}

export function shuffle<T>(arr: readonly T[], rnd: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** مرتب‌سازی دست برای نمایش: ابتدا خال‌ها با اولویت حکم، سپس ارزش زیاد به کم (آس تا ۲) */
export function sortHand(cards: readonly CardId[], trump?: Suit | null): CardId[] {
  const suitOrder = (s: Suit): number => (s === trump ? -1 : SUITS.indexOf(s));
  return cards.slice().sort((x, y) => {
    const sx = suitOrder(suitOf(x));
    const sy = suitOrder(suitOf(y));
    if (sx !== sy) return sx - sy;
    return cardValue(y) - cardValue(x);
  });
}
