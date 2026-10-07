import { Hokm2Game } from '../shared/src/game2.ts';

let s = Number(process.argv[2] ?? 7);
const rnd = () => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return s / 2147483648;
};

function mk(seed: number): Hokm2Game {
  let x = seed;
  const r = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
  const g = new Hokm2Game('t2', { rnd: r, matchTarget: 3 });
  g.join({ id: 'a', name: 'Ali' });
  g.join({ id: 'b', name: 'Sara' });
  g.start('a');
  return g;
}

function drive(g: Hokm2Game): number {
  let t = Date.now();
  let n = 0;
  const phases = new Set<string>();
  while (g.phase !== 'matchEnd' && n < 20000) {
    t += 1_000_000;
    g.autoAdvance(t);
    phases.add(g.phase);
    n++;
  }
  return n;
}

const g = mk(s);
const v0 = g.view(0);
console.log('after start: phase=', g.phase, 'hakem=', g.hakem, 'hand0=', v0.hand.length, 'pile=', g.round!.pile.length);

const n = drive(g);
console.log('iters=', n, 'phase=', g.phase, 'points=', JSON.stringify(g.points), 'winner=', g.matchWinner);
const phasesSeen = new Set<string>();
console.log('last log:');
for (const l of g.log.slice(-8)) console.log('  ', l);

// بررسی بازیکن در میانهٔ راه: بازیِ دستی کوتاه
const g2 = mk(11);
const id = (seat: number) => (seat === 0 ? 'a' : 'b');
const hakem2 = g2.hakem!;
// trump
g2.chooseTrump(id(hakem2), 'H');
console.log('g2 after trump:', g2.phase, 'turn=', g2.currentTurn());
const h0 = g2.view(0).hand;
const h1 = g2.view(1).hand;
const burnSeat = g2.currentTurn()!;
g2.burnCards(id(burnSeat), g2.view(burnSeat).hand.slice(0, 2));
console.log('g2 after 1st burns:', g2.phase, 'turn=', g2.currentTurn());
g2.burnCards(id(1 - burnSeat), g2.view(1 - burnSeat).hand.slice(0, 2));
console.log('g2 after b burns:', g2.phase, 'turn=', g2.currentTurn(), 'hands=', g2.round!.hands.map((h) => h.length), 'pile=', g2.round!.pile.length);
// draw pairs manual
let guard = 0;
while (g2.phase === 'draw' && guard++ < 50) {
  const t = g2.currentTurn()!;
  const card1 = g2.round!.currentDraw;
  if (card1 === null) throw new Error('no card1');
  g2.drawPick(String(t === 0 ? 'a' : 'b'), card1 !== null && card1.endsWith('H'));
}
console.log('g2 after draws:', g2.phase, 'hands=', g2.round!.hands.map((h) => h.length), 'pile=', g2.round!.pile.length, 'turn=', g2.currentTurn());
if (g2.phase !== 'play') throw new Error('expected play');
// play one trick manually
const turnA = g2.currentTurn()!;
const idA = turnA === 0 ? 'a' : 'b';
const legal = g2.legalFor(turnA);
g2.play(idA, legal[0]);
const turnB = g2.currentTurn()!;
const legalB = g2.legalFor(turnB);
g2.play(turnB === 0 ? 'a' : 'b', legalB[0]);
console.log('g2 after trick: tricks=', JSON.stringify(g2.view(0).tricks), 'leader=', g2.round!.leader, 'phase=', g2.phase);
void phasesSeen;
