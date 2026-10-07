import {
  type CardId,
  cardValue,
  suitOf,
  SUITS,
  type Suit,
  isPicture,
  rankValue,
  rankOf,
} from './cards';
import type { TrickCard } from './types';

export function teamOf(seat: number): number {
  return seat % 2;
}

export function partnerOf(seat: number): number {
  return (seat + 2) % 4;
}

/** ورق‌های مجاز بازی‌شدن در نوبت فعلی */
export function legalCards(hand: readonly CardId[], trick: readonly TrickCard[]): CardId[] {
  if (trick.length === 0) return hand.slice();
  const lead = suitOf(trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === lead);
  return follow.length > 0 ? follow.slice() : hand.slice();
}

function beats(card: CardId, best: CardId, lead: Suit, trump: Suit): boolean {
  const cs = suitOf(card);
  const bs = suitOf(best);
  const cTrump = cs === trump;
  const bTrump = bs === trump;
  if (cTrump && !bTrump) return true;
  if (!cTrump && bTrump) return false;
  if (cTrump && bTrump) return cardValue(card) > cardValue(best);
  const cLead = cs === lead;
  const bLead = bs === lead;
  if (cLead && !bLead) return true;
  if (!cLead && bLead) return false;
  if (cLead && bLead) return cardValue(card) > cardValue(best);
  return false;
}

/** برندهٔ دست چهارنفری با توجه به خال زمینه و خال حکم */
export function trickWinner(trick: readonly TrickCard[], trump: Suit): number {
  const lead = suitOf(trick[0].card);
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i].card, trick[best].card, lead, trump)) best = i;
  }
  return trick[best].seat;
}

/** شرط درخواست توزیع مجدد توسط حاکم: همهٔ ۵ ورق اول زیر ۱۰ و بدون تصویری */
export function canRequestRedeal(hand: readonly CardId[]): boolean {
  return hand.length === 5 && hand.every((c) => rankValue(rankOf(c)) < 10 && !isPicture(c));
}

/** بهترین خال پیشنهادی خودکار (بیشترین کارت در دست) */
export function autoTrumpSuit(hand: readonly CardId[]): Suit {
  const counts = new Map<Suit, number>();
  for (const s of SUITS) counts.set(s, 0);
  for (const c of hand) counts.set(suitOf(c), (counts.get(suitOf(c)) ?? 0) + 1);
  let bestSuit: Suit = SUITS[0];
  let bestCount = -1;
  for (const s of SUITS) {
    const n = counts.get(s) ?? 0;
    if (n > bestCount) {
      bestCount = n;
      bestSuit = s;
    }
  }
  return bestSuit;
}
