import { HokmGame } from '../shared/src/game.ts';

function mk(seed: number) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const g = new HokmGame('t', { rnd, matchTarget: 3 });
  for (let i = 0; i < 4; i++) g.join({ id: `p${i}`, name: `P${i}` });
  g.start('p0');
  return g;
}
function drive(g: HokmGame) {
  let t = Date.now(), n = 0;
  while (g.phase !== 'matchEnd' && n < 20000) { t += 1_000_000; g.autoAdvance(t); n++; }
  return n;
}
for (const seed of [3, 7]) {
  const g = mk(seed);
  const n = drive(g);
  console.log(`seed ${seed}: iters=${n} phase=${g.phase} pts=${JSON.stringify(g.points)} winner=${g.matchWinner}`);
  if (seed === 7) {
    g.restart('p1');
    console.log('after restart: phase=' + g.phase, 'pts=' + JSON.stringify(g.points), 'winner=' + g.matchWinner, 'seat(p1)=' + g.seatOf('p1'));
  }
}
