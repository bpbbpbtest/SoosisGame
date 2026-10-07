import { Hokm2Game, HokmGame, type GameMode, type ManagedGame } from 'shared';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOBBY_IDLE_MS = 24 * 60 * 60 * 1000;

export class GameStore {
  private games = new Map<string, ManagedGame>();

  constructor(private readonly matchTarget: number) {}

  create(chatId: number | null = null, mode: GameMode = '4'): ManagedGame {
    let id = '';
    do {
      id = '';
      for (let i = 0; i < 6; i++) {
        id += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
    } while (this.games.has(id));
    const opts = { matchTarget: this.matchTarget, chatId };
    const g = mode === '2' ? new Hokm2Game(id, opts) : new HokmGame(id, opts);
    this.games.set(id, g);
    return g;
  }

  get(id: string): ManagedGame | undefined {
    return this.games.get(id.toUpperCase());
  }

  all(): ManagedGame[] {
    return [...this.games.values()];
  }

  lobbyGames(): ManagedGame[] {
    return this.all().filter((g) => g.phase === 'lobby');
  }

  delete(id: string): void {
    this.games.delete(id);
  }

  gc(now: number): void {
    for (const g of this.games.values()) {
      if (g.phase === 'lobby' && now - g.getActivity() > LOBBY_IDLE_MS) {
        this.games.delete(g.id);
      }
    }
  }
}
