import type { CardId, Suit } from './cards';
import type { PlayerView } from './game';
import type { PlayerView2 } from './game2';
import type { PlayerInfo } from './types';

export type GameMode = '4' | '2';

export type AnyView = PlayerView | PlayerView2;

/**
 * قرارداد مشترک سرور برای هر دو بازی (چهارنفره و دو نفره).
 * اکشن‌هایی که به حالت بازی تعلق ندارند باید GameError پرتاب کنند.
 */
export interface ManagedGame {
  readonly id: string;
  readonly mode: GameMode;
  phase: string;
  deadline: number | null;
  notifiedEnd: boolean;
  matchWinner: number | null;
  points: [number, number];
  chatId: number | null;
  players: (PlayerInfo | null)[];

  getActivity(): number;
  seatOf(playerId: string): number | null;
  join(player: PlayerInfo): number;
  leave(playerId: string): void;
  start(playerId: string): void;

  cut(playerId: string, index: number | null): void;
  chooseTrump(playerId: string, suit: Suit): void;
  requestRedeal(playerId: string): void;
  voteRedeal(playerId: string): void;
  play(playerId: string, card: CardId): void;
  chooseBam(playerId: string, cont: boolean): void;
  burnCards(playerId: string, cards: CardId[]): void;
  drawPick(playerId: string, keep: boolean): void;
  nextRound(playerId: string): void;
  restart(playerId: string): void;
  forfeit(playerId: string): void;

  view(seat: number | null): AnyView;
  autoAdvance(now: number): boolean;

  /**
   * وسطِ دست (کارتِ آخر زمین گذاشته شده هنوز حل نشده) — سرور این لحظه را
   * برای کلاینت‌ها می‌فرستد تا کارت‌های روی زمین دیده شوند، بعد حل و جمع می‌شود.
   */
  onFlush?: (() => void) | null;
}
