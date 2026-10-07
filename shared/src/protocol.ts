import type { CardId, Suit } from './cards';
import type { PlayerView } from './game';
import type { PlayerView2 } from './game2';

export type Action =
  | { k: 'start' }
  | { k: 'cut'; index: number | null }
  | { k: 'trump'; suit: Suit }
  | { k: 'redeal' }
  | { k: 'vote' }
  | { k: 'play'; card: CardId }
  | { k: 'bam'; cont: boolean }
  | { k: 'burn'; cards: CardId[] }
  | { k: 'drawPick'; keep: boolean }
  | { k: 'next' }
  | { k: 'restart' }
  | { k: 'forfeit' }
  | { k: 'leave' };

export type ClientMsg =
  | { t: 'act'; action: Action }
  | { t: 'sync' };

export type ServerMsg =
  | { t: 'ready'; user: { id: string; name: string } }
  | { t: 'state'; state: PlayerView | PlayerView2 }
  | { t: 'error'; message: string };

export interface WebConfig {
  ws: string;
}
