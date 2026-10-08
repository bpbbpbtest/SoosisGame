import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CardId } from 'shared';
import { CardView } from './components';

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TrickEntry {
  seat: number;
  card: CardId;
}

interface Flight {
  id: number;
  card: CardId;
  from: Rect;
  to: Rect;
  size: 'md' | 'lg';
  flip: boolean;
}

interface Gather {
  cards: { card: CardId; from: Rect }[];
  winner: number;
  target: Rect | null;
  felt: Rect | null;
  stage: 'measure' | 'run';
}

interface Args {
  rootRef: { current: HTMLDivElement | null };
  handRef?: { current: HTMLDivElement | null };
  phase: string;
  trick: TrickEntry[];
  leader: number | null;
  hand: CardId[];
  fullN: number;
}

let seq = 0;

function animateFly(el: HTMLElement, f: Flight, onDone: () => void): void {
  const dx = f.to.left - f.from.left;
  const dy = f.to.top - f.from.top;
  const s = f.to.width / Math.max(1, f.from.width);
  const inner = el.querySelector<HTMLElement>('.fly-inner');
  if (f.flip) {
    inner?.animate(
      [
        { transform: 'rotateY(180deg)', offset: 0 },
        { transform: 'rotateY(180deg)', offset: 0.06 },
        { transform: 'rotateY(360deg)', offset: 0.4 },
        { transform: 'rotateY(360deg)', offset: 1 },
      ],
      { duration: 780, easing: 'ease-in-out', fill: 'forwards' },
    );
    el.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', offset: 0 },
        { transform: 'translate(0px, 0px) scale(1)', offset: 0.44 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, offset: 1 },
      ],
      { duration: 780, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
    ).finished.then(onDone).catch(onDone);
    return;
  }
  el.animate(
    [
      { transform: 'translate(0px, 0px) scale(1)' },
      { transform: `translate(${dx}px, ${dy}px) scale(${s})` },
    ],
    { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
  ).finished.then(onDone).catch(onDone);
}

function animateGather(
  el: HTMLElement,
  from: Rect,
  target: Rect,
  center: { x: number; y: number },
  onDone: () => void,
): void {
  const cx1 = center.x - (from.left + from.width / 2);
  const cy1 = center.y - (from.top + from.height / 2);
  const s2 = target.width / Math.max(1, from.width);
  const tx2 = target.left - from.left;
  const ty2 = target.top - from.top;
  const inner = el.querySelector<HTMLElement>('.fly-inner');
  inner?.animate(
    [
      { transform: 'rotateY(0deg)', offset: 0 },
      { transform: 'rotateY(0deg)', offset: 0.3 },
      { transform: 'rotateY(180deg)', offset: 0.48 },
      { transform: 'rotateY(180deg)', offset: 1 },
    ],
    { duration: 1250, easing: 'ease-in-out', fill: 'forwards' },
  );
  el.animate(
    [
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1, offset: 0 },
      { transform: `translate(${cx1}px, ${cy1}px) scale(1)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${cx1}px, ${cy1}px) scale(1)`, opacity: 1, offset: 0.48 },
      { transform: `translate(${tx2}px, ${ty2}px) scale(${s2})`, opacity: 1, offset: 0.85 },
      { transform: `translate(${tx2}px, ${ty2}px) scale(${s2})`, opacity: 0, offset: 1 },
    ],
    { duration: 1250, easing: 'ease-in-out', fill: 'forwards' },
  ).finished.then(onDone).catch(onDone);
}

function Clone(props: {
  card: CardId;
  from: Rect;
  size: 'md' | 'lg';
  animate: (el: HTMLElement) => void;
}) {
  return (
    <div
      className="fly-clone"
      style={{
        left: props.from.left,
        top: props.from.top,
        width: props.from.width,
        height: props.from.height,
      }}
      ref={(el) => {
        if (!el || el.dataset.on === '1') return;
        el.dataset.on = '1';
        props.animate(el);
      }}
    >
      <div className="fly-inner">
        <div className="ff front">
          <CardView card={props.card} size={props.size} />
        </div>
        <div className="ff back">
          <div className="card-face-back" />
        </div>
      </div>
    </div>
  );
}

export function useTableMotion(args: Args): {
  notePlay: (card: CardId, from: Rect) => void;
  noteDraw: (card: CardId | null, from: Rect, flip: boolean, hand: CardId[]) => void;
  hidden: Set<CardId>;
  markerSeat: number | null;
  markerVisible: boolean;
  renderLayer: () => ReactNode;
} {
  const { rootRef, handRef, phase, trick, leader, hand, fullN } = args;
  const pendingPlay = useRef<{ card: CardId; from: Rect } | null>(null);
  const pendingDraw = useRef<{ card: CardId | null; from: Rect; flip: boolean; hand: CardId[] } | null>(
    null,
  );
  const lastRects = useRef(new Map<CardId, Rect>());
  const prevTrick = useRef<TrickEntry[]>([]);
  const gatherDone = useRef(0);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [hidden, setHidden] = useState<Set<CardId>>(() => new Set());
  const [gather, setGather] = useState<Gather | null>(null);
  const [markerSeat, setMarkerSeat] = useState<number | null>(null);
  const [markerVisible, setMarkerVisible] = useState(false);

  const startFlight = useCallback((spec: Omit<Flight, 'id'>) => {
    const id = ++seq;
    setHidden((s) => new Set(s).add(spec.card));
    setFlights((xs) => [...xs, { id, ...spec }]);
  }, []);

  const finishFlight = useCallback((f: Flight) => {
    setFlights((xs) => xs.filter((x) => x.id !== f.id));
    setHidden((s) => {
      const n = new Set(s);
      n.delete(f.card);
      return n;
    });
  }, []);

  const notePlay = useCallback((card: CardId, from: Rect) => {
    const p = { card, from };
    pendingPlay.current = p;
    window.setTimeout(() => {
      if (pendingPlay.current === p) pendingPlay.current = null;
    }, 3000);
  }, []);

  const noteDraw = useCallback(
    (card: CardId | null, from: Rect, flip: boolean, handSnapshot: CardId[]) => {
      const p = { card, from, flip, hand: handSnapshot };
      pendingDraw.current = p;
      window.setTimeout(() => {
        if (pendingDraw.current === p) pendingDraw.current = null;
      }, 3000);
    },
    [],
  );

  // مستطیل کارت‌های بازی‌شده (فقط وقتی دست در جریان است — نه کارت‌های reveal)
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || trick.length === 0) return;
    const map = new Map<CardId, Rect>();
    root.querySelectorAll<HTMLElement>('[data-fcc]').forEach((el) => {
      const c = el.getAttribute('data-fcc');
      if (c) map.set(c as CardId, el.getBoundingClientRect());
    });
    if (map.size > 0) lastRects.current = map;
  });

  // کارت تازه بازی‌شده: فقط برای ورق‌های خودت از دست پرواز می‌کند؛
  // کارت حریف سرِ جایش (جلوی پنل اسمش) با انیمیشن pop ظاهر می‌شود
  useEffect(() => {
    const prev = prevTrick.current;
    const cur = trick;
    if (cur.length > prev.length && rootRef.current) {
      for (const tc of cur) {
        if (prev.some((p) => p.seat === tc.seat && p.card === tc.card)) continue;
        const pp = pendingPlay.current;
        if (!pp || pp.card !== tc.card) continue;
        pendingPlay.current = null;
        const toEl = rootRef.current.querySelector<HTMLElement>(`[data-fcc="${tc.card}"]`);
        if (!toEl) continue;
        startFlight({
          card: tc.card,
          from: pp.from,
          to: toEl.getBoundingClientRect(),
          size: 'lg',
          flip: false,
        });
      }
    }
    if (
      prev.length === fullN &&
      cur.length === 0 &&
      lastRects.current.size === fullN &&
      leader !== null
    ) {
      const cards = [...lastRects.current.entries()].map(([card, from]) => ({ card, from }));
      lastRects.current = new Map();
      gatherDone.current = 0;
      setMarkerSeat(leader);
      setMarkerVisible(false);
      setGather({ cards, winner: leader, target: null, felt: null, stage: 'measure' });
    } else if (cur.length > 0 && markerSeat !== null) {
      setMarkerSeat(null);
      setMarkerVisible(false);
    }
    prevTrick.current = cur;
  }, [trick, leader, fullN, markerSeat, rootRef, startFlight]);

  // فازهای بین‌دور (کوپ/حکم/سوزاندن/برداشت) نشانِ دور قبل را پاک می‌کنند
  useEffect(() => {
    if (phase === 'play' || phase === 'bam' || phase === 'roundEnd') return;
    if (markerSeat === null) return;
    setMarkerSeat(null);
    setMarkerVisible(false);
  }, [phase, markerSeat]);

  // برداشت از زمین (نگه دار / دومی را بردار) → پرواز از جای کارت تا دست
  useEffect(() => {
    const p = pendingDraw.current;
    if (!p) return;
    let card: CardId | undefined;
    if (p.card !== null) {
      card = hand.includes(p.card) ? p.card : undefined;
    } else {
      card = hand.find((c) => !p.hand.includes(c));
    }
    if (card === undefined) return;
    pendingDraw.current = null;
    const el = handRef?.current?.querySelector<HTMLElement>(`[aria-label="${card}"]`);
    if (!el) return;
    const to = el.getBoundingClientRect();
    startFlight({ card, from: p.from, to, size: 'md', flip: p.flip });
  }, [hand, handRef, startFlight]);

  // اندازه‌گیری جایگاه نشانِ برندۀ دست (وقتی مارکر هنوز مخفی است)
  useLayoutEffect(() => {
    if (!gather || gather.stage !== 'measure') return;
    const root = rootRef.current;
    const mk = root?.querySelector<HTMLElement>('[data-fmk]');
    const felt = root?.querySelector<HTMLElement>('.trick-area');
    if (!root || !mk || !felt) {
      setGather(null);
      return;
    }
    setGather({
      ...gather,
      target: mk.getBoundingClientRect(),
      felt: felt.getBoundingClientRect(),
      stage: 'run',
    });
  }, [gather, rootRef]);

  const doneOne = useCallback(() => {
    if (!gather) return;
    gatherDone.current += 1;
    if (gatherDone.current >= gather.cards.length) {
      setGather(null);
      setMarkerVisible(true);
    }
  }, [gather]);

  const renderLayer = useCallback((): ReactNode => {
    const g = gather;
    let gatherNodes: ReactNode = null;
    if (g && g.stage === 'run' && g.target && g.felt) {
      const target = g.target;
      const center = {
        x: g.felt.left + g.felt.width / 2,
        y: g.felt.top + g.felt.height / 2,
      };
      gatherNodes = g.cards.map((c) => (
        <Clone
          key={`g-${c.card}`}
          card={c.card}
          from={c.from}
          size="md"
          animate={(el) => animateGather(el, c.from, target, center, doneOne)}
        />
      ));
    }
    return (
      <div className="fly-layer" aria-hidden>
        {flights.map((f) => (
          <Clone
            key={f.id}
            card={f.card}
            from={f.from}
            size={f.size}
            animate={(el) => animateFly(el, f, () => finishFlight(f))}
          />
        ))}
        {gatherNodes}
      </div>
    );
  }, [flights, gather, finishFlight, doneOne]);

  return { notePlay, noteDraw, hidden, markerSeat, markerVisible, renderLayer };
}
