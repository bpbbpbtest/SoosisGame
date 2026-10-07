import { HokmGame } from 'shared';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOBBY_IDLE_MS = 24 * 60 * 60 * 1000;

export class GameStore {
  private games = new Map<string, HokmGame>();

  constructor(private readonly matchTarget: number) {}

  create(chatId: string | null = null): HokmGame {
    let id = '';
    do {
      id = '';
      for (let i = 0; i < 6; i++) {
        id += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
    } while (this.games.has(id));
    const g = new HokmGame(id, { matchTarget: this.matchTarget, chatId });
    this.games.set(id, g);
    return g;
  }

  get(id: string): HokmGame | undefined {
    return this.games.get(id.toUpperCase());
  }

  all(): HokmGame[] {
    return [...this.games.values()];
  }

  lobbyGames(): HokmGame[] {
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
