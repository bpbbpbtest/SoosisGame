import { HokmGame } from '../shared/src/game.ts';

let s = 7;
const rnd = () => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return s / 2147483648;
};
const g = new HokmGame('dbg', { rnd, matchTarget: 3 });
for (let i = 0; i < 4; i++) g.join({ id: `p${i}`, name: `P${i}` });
g.start('p0');

let t = Date.now();
let guard = 0;
let lastPhase = '';
let lastVersion = -1;
let stuckAt = 0;
while (g.phase !== 'matchEnd' && guard < 20000) {
  t += 1_000_000;
  g.autoAdvance(t);
  guard++;
  if (g.phase === lastPhase && g.version === lastVersion) {
    stuckAt++;
    if (stuckAt > 50) break;
  } else {
    stuckAt = 0;
    lastPhase = g.phase;
    lastVersion = g.version;
  }
}

console.log('iterations:', guard, 'phase:', g.phase, 'points:', g.points);
console.log('deadline:', g.deadline, 't:', t, 'turn:', g.currentTurn());
if (g.round) {
  console.log(
    'hands sizes:',
    g.round.hands.map((h) => h.length).join(','),
    'tricks stored:',
    g.round.tricks.length,
    'trump:',
    g.round.trump
  );
}
console.log('--- last log ---');
for (const l of g.log.slice(-25)) console.log(' ', l);
