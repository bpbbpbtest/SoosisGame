import type { CardId, Suit } from './cards';

export type Phase = 'lobby' | 'cut' | 'trump' | 'play' | 'bam' | 'roundEnd' | 'matchEnd';

export interface PlayerInfo {
  id: string;
  name: string;
  photo?: string;
}

export interface TrickCard {
  seat: number;
  card: CardId;
}

export interface RoundState {
  /** حاکم این دور */
  hakem: number;
  /** ورق‌دهنده (سمتِ قبل از حاکم در ترتیب پخش) */
  dealer: number;
  hands: CardId[][];
  trump: Suit | null;
  /** ترتیب کارت‌های باقی‌ماندهٔ دسته بعد از کوپ */
  deck: CardId[];
  trick: TrickCard[];
  /** نشستنی که ورق اولِ دست جاری را آورده */
  leader: number;
  /** تاریخچهٔ کارت‌های آشکار‌شده هنگام تعیین حاکم با آس */
  aceLog: CardId[];
  cutIndex: number | null;
  /** رأی‌دهندگان به توزیع مجدد (شناسهٔ بازیکن) */
  redealVotes: string[];
  /** آیا حاکم تقاضای توزیع مجدد کرده */
  hakemRequestedRedeal: boolean;
  tricks: TrickCard[][];
}

export interface RoundResult {
  winner: number;
  points: number;
  tricks: [number, number];
  bam: boolean;
}

export interface GameState {
  id: string;
  chatId: number | null;
  phase: Phase;
  players: (PlayerInfo | null)[];
  points: [number, number];
  round: RoundState | null;
  hakem: number | null;
  dealer: number | null;
  bamTeam: number | null;
  matchWinner: number | null;
  lastRound: RoundResult | null;
  deadline: number | null;
  log: string[];
  createdAt: number;
  matchTarget: number;
  roundTarget: number;
  notifiedEnd: boolean;
}
