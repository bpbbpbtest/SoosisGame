import { describe, expect, it } from 'vitest';
import { GameError } from '../src/game';
import { Hokm2Game, type Phase2 } from '../src/game2';
import { canRequestRedeal, trickWinner } from '../src/rules';

function mkGame(seed: number, matchTarget = 3): Hokm2Game {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return new Hokm2Game('t2', { rnd, matchTarget });
}

function joinTwo(g: Hokm2Game): void {
  g.join({ id: 'a', name: 'Ali' });
  g.join({ id: 'b', name: 'Sara' });
}

function idOf(seat: number): string {
  return seat === 0 ? 'a' : 'b';
}

function driveUntil(g: Hokm2Game, phases: Phase2[], max = 20000): void {
  let t = Date.now();
  let n = 0;
  while (!phases.includes(g.phase) && n < max) {
    t += 1_000_000;
    g.autoAdvance(t);
    n++;
  }
}

describe('hokm2', () => {
  it('lobby: join, capacity, start requires 2', () => {
    const g = mkGame(4);
    expect(g.join({ id: 'a', name: 'Ali' })).toBe(0);
    expect(g.join({ id: 'a', name: 'Ali' })).toBe(0);
    expect(g.join({ id: 'b', name: 'Sara' })).toBe(1);
    expect(() => g.join({ id: 'c', name: 'C' })).toThrow(GameError);
    expect(() => g.start('a')).not.toThrow();
    const g1 = mkGame(4);
    g1.join({ id: 'a', name: 'Ali' });
    expect(() => g1.start('a')).toThrow(GameError);
  });

  it('deal: 5 cards each, pile 42, phase trump, mode 2', () => {
    const g = mkGame(7);
    joinTwo(g);
    g.start('a');
    expect(g.mode).toBe('2');
    expect(g.phase).toBe('trump');
    expect(g.hakem === 0 || g.hakem === 1).toBe(true);
    expect(g.view(0).hand).toHaveLength(5);
    expect(g.view(1).hand).toHaveLength(5);
    expect(g.round!.pile).toHaveLength(42);
    expect(g.view(0).mode).toBe('2');
  });

  it('trump: only hakem chooses; then burn phase in hakem order', () => {
    const g = mkGame(7);
    joinTwo(g);
    g.start('a');
    const other = 1 - g.hakem!;
    expect(() => g.chooseTrump(idOf(other), 'H')).toThrow(GameError);
    g.chooseTrump(idOf(g.hakem!), 'S');
    expect(g.phase).toBe('burn');
    expect(g.currentTurn()).toBe(g.hakem);
  });

  it('burn: wrong turn or wrong cards rejected; then draw starts', () => {
    const g = mkGame(9);
    joinTwo(g);
    g.start('a');
    g.chooseTrump(idOf(g.hakem!), 'H');
    const h = g.hakem!;
    expect(() => g.burnCards(idOf(1 - h), g.view(1 - h).hand.slice(0, 2))).toThrow(GameError);
    const cards = g.view(h).hand.slice(0, 2);
    expect(() => g.burnCards(idOf(h), [cards[0]])).toThrow(GameError);
    g.burnCards(idOf(h), cards);
    expect(g.currentTurn()).toBe(1 - h);
    g.burnCards(idOf(1 - h), g.view(1 - h).hand.slice(0, 2));
    expect(g.phase).toBe('draw');
    expect(g.round!.hands[0]).toHaveLength(3);
    expect(g.round!.hands[1]).toHaveLength(3);
    expect(g.round!.pile).toHaveLength(41); // یکی برای اولین currentDraw برداشته شد
  });

  it('draw: card1 only visible to active drawer; ends with 13+13 and pile 2', () => {
    const g = mkGame(13);
    joinTwo(g);
    g.start('a');
    g.chooseTrump(idOf(g.hakem!), 'D');
    g.burnCards(idOf(g.hakem!), g.view(g.hakem!).hand.slice(0, 2));
    g.burnCards(idOf(1 - g.hakem!), g.view(1 - g.hakem!).hand.slice(0, 2));
    expect(g.phase).toBe('draw');
    const active = g.currentTurn()!;
    expect(g.view(active).draw?.card1).not.toBeNull();
    expect(g.view(1 - active).draw?.card1).toBeNull();
    let guard = 0;
    while (g.phase === 'draw' && guard++ < 50) {
      const seat = g.currentTurn()!;
      const c1 = g.round!.currentDraw!;
      g.drawPick(idOf(seat), c1.endsWith('H'));
    }
    expect(g.phase).toBe('play');
    expect(g.round!.hands[0]).toHaveLength(13);
    expect(g.round!.hands[1]).toHaveLength(13);
    expect(g.round!.pile).toHaveLength(2);
  });

  it('play: must follow lead suit', () => {
    const g = mkGame(21);
    joinTwo(g);
    g.start('a');
    driveUntil(g, ['play']);
    const leader = g.currentTurn()!;
    const first = g.legalFor(leader)[0];
    g.play(idOf(leader), first);
    const second = 1 - leader;
    const hand = g.view(second).hand;
    const leadSuit = first[0];
    const canFollow = hand.some((c) => c[0] === leadSuit);
    if (canFollow) {
      const wrong = hand.find((c) => c[0] !== leadSuit)!;
      expect(() => g.play(idOf(second), wrong)).toThrow(GameError);
    }
    const legal = g.legalFor(second);
    g.play(idOf(second), legal[0]);
    expect(g.round!.tricks).toHaveLength(1);
    expect(g.round!.leader).toBe(trickWinner(g.round!.tricks[0], g.round!.trump!));
  });

  it('scoring and rotation across full match (autoAdvance)', () => {
    const g = mkGame(3, 5);
    joinTwo(g);
    g.start('a');
    for (let rounds = 0; rounds < 30; rounds++) {
      const hakemBefore = g.hakem!;
      driveUntil(g, ['roundEnd', 'matchEnd']);
      const lr = g.lastRound;
      expect(lr).not.toBeNull();
      const expected = lr!.kti ? (lr!.winner === hakemBefore ? 2 : 3) : 1;
      expect(lr!.points).toBe(expected);
      expect(lr!.tricks[lr!.winner]).toBe(g.roundTarget);
      expect(lr!.tricks[1 - lr!.winner]).toBeGreaterThanOrEqual(0);
      if (g.phase === 'matchEnd') break;
      const winner = lr!.winner;
      g.nextRound('a');
      const expectedHakem = winner === hakemBefore ? hakemBefore : 1 - hakemBefore;
      expect(g.hakem).toBe(expectedHakem);
    }
    expect(g.phase).toBe('matchEnd');
    expect(g.matchWinner).not.toBeNull();
    expect(Math.max(g.points[0], g.points[1])).toBeGreaterThanOrEqual(g.matchTarget);
    for (const p of g.points) expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).toContain(p);
  });

  it('autoAdvance drives whole match alone', () => {
    const g = mkGame(7, 3);
    joinTwo(g);
    g.start('a');
    driveUntil(g, ['matchEnd']);
    expect(g.phase).toBe('matchEnd');
    expect(g.matchWinner).not.toBeNull();
  });

  it('redeal: ده‌لو condition', () => {
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const g = mkGame(seed);
      joinTwo(g);
      g.start('a');
      const hand = g.round!.hands[g.hakem!];
      if (!canRequestRedeal(hand)) continue;
      found = true;
      expect(() => g.requestRedeal(idOf(g.hakem!))).not.toThrow();
      expect(g.phase).toBe('trump');
      expect(g.round!.hands[0]).toHaveLength(5);
      // بعد از توزیع مجدد، تقاضای دوباره ممنوع نیست (پرچم ریست شده)
      expect(g.round!.redealRequested).toBe(false);
      expect(() => g.requestRedeal(idOf(1 - g.hakem!))).toThrow(GameError);
    }
    expect(found).toBe(true);
    const g = mkGame(7);
    joinTwo(g);
    g.start('a');
    if (!canRequestRedeal(g.round!.hands[g.hakem!])) {
      expect(() => g.requestRedeal(idOf(g.hakem!))).toThrow(GameError);
    }
  });

  it('4p-only actions rejected', () => {
    const g = mkGame(4);
    joinTwo(g);
    g.start('a');
    expect(() => g.cut('a', 10)).toThrow(GameError);
    expect(() => g.voteRedeal()).toThrow(GameError);
    expect(() => g.chooseBam('a', true)).toThrow(GameError);
  });

  it('restart after match end returns to lobby', () => {
    const g = mkGame(7, 3);
    joinTwo(g);
    g.start('a');
    driveUntil(g, ['matchEnd']);
    expect(g.matchWinner).not.toBeNull();
    g.restart('a');
    expect(g.phase).toBe('lobby');
    expect(g.points).toEqual([0, 0]);
    expect(g.matchWinner).toBeNull();
    expect(g.seatOf('a')).toBe(0);
  });

  it('forfeit ends match for opponent', () => {
    const g = mkGame(5);
    joinTwo(g);
    g.start('a');
    driveUntil(g, ['play']);
    g.forfeit('a');
    expect(g.phase).toBe('matchEnd');
    expect(g.matchWinner).toBe(1);
  });

  it('spectator view hides hands', () => {
    const g = mkGame(7);
    joinTwo(g);
    g.start('a');
    const v = g.view(null);
    expect(v.you).toBeNull();
    expect(v.hand).toHaveLength(0);
    expect(v.can.start).toBe(false);
    expect(v.can.play).toBe(false);
  });
});


describe('view flags', () => {
  it('can.start requires both seats filled', () => {
    const g = mkGame(3);
    g.join({ id: 'a', name: 'Ali' });
    expect(g.view(0).can.start).toBe(false);
    g.join({ id: 'b', name: 'Sara' });
    expect(g.view(0).can.start).toBe(true);
    expect(g.view(null).can.start).toBe(false);
  });

  it('srvNow reflects the injected server clock', () => {
    const t = 1700000000000;
    const g = new Hokm2Game('t2', { now: () => t });
    g.join({ id: 'a', name: 'Ali' });
    expect(g.view(0).srvNow).toBe(t);
  });
});
