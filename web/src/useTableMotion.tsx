import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { CardId } from 'shared';
import { CardView } from './components';

export interface Rect {
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
  kind?: 'fly' | 'burn';
}

interface Gather {
  cards: { card: CardId; from: Rect }[];
  winner: number;
  target: Rect;
  felt: Rect;
}

interface Deal {
  id: number;
  count: number;
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

// کاربرِ «کاهش حرکت» (prefers-reduced-motion): پروازها تقریباً آنی می‌شوند
const REDUCED =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const D = (ms: number) => (REDUCED ? 1 : ms);

function feltCenter(root: HTMLElement): Rect | null {
  const felt = root.querySelector<HTMLElement>('.trick-area');
  if (!felt) return null;
  return centerRect(felt.getBoundingClientRect());
}

// مستطیل ورق (۴۶×۶۶) در مرکز یک عنصر
function centerRect(r: { left: number; top: number; width: number; height: number }): Rect {
  return {
    left: r.left + r.width / 2 - 23,
    top: r.top + r.height / 2 - 33,
    width: 46,
    height: 66,
  };
}

function arcOf(dx: number, dy: number): number {
  return Math.min(64, Math.hypot(dx, dy) * 0.3);
}

function tiltOf(dx: number, dy: number): number {
  const d = Math.hypot(dx, dy);
  if (d < 8) return 0;
  return Math.max(-9, Math.min(9, (dx / d) * 9));
}

// ورود کارت بازی‌شده به جایگاهش: انیمیشن روی خود المان، بدون مخفی‌کردن —
// اگر انیمیشن اجرا نشود کارت هم‌جا دیده می‌شود (هرگز ناپدید نمی‌شود)
function animateSlotIn(el: HTMLElement, from: Rect, flip: boolean): void {
  try {
    const cardEl = el.querySelector<HTMLElement>(':scope > .card') ?? el;
    // اول همهٔ انیمیشن‌های در حال اجرا (CSS/WAAPI) را لغو کن تا اندازه‌گیری
    // مقصد از روی حالت طبیعی المان انجام شود نه حالت ترانسفورم‌شده
    const nodes: HTMLElement[] = cardEl === el ? [el] : [el, cardEl];
    for (const node of nodes) {
      const holder = node as HTMLElement & {
        getAnimations?: () => Array<{ cancel: () => void }>;
      };
      for (const a of holder.getAnimations?.() ?? []) a.cancel();
    }
    const to = cardEl.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const tilt = flip ? 0 : tiltOf(dx, dy);
    if (flip) {
      cardEl.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px) rotateY(-90deg) scale(1.06)`,
            opacity: 0.5,
            offset: 0,
          },
          { transform: 'translate(0px, 0px) rotateY(0deg) scale(1)', opacity: 1, offset: 1 },
        ],
        { duration: D(850), easing: 'linear' },
      );
    } else {
      cardEl.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(1.05)`, offset: 0 },
          { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', offset: 1 },
        ],
        { duration: D(850), easing: 'linear' },
      );
    }
  } catch {
    /* انیمیشن در دسترس نیست — کارت سرِ جای خودش می‌ماند */
  }
}

// پرواز معمولی: مسیر کمانی با کمی انحراف و چرخش
function animateFly(el: HTMLElement, f: Flight, onDone: () => void): void {
  try {
    if (f.kind === 'burn') {
      animateBurn(el, f, onDone);
      return;
    }
    const dx = f.to.left - f.from.left;
    const dy = f.to.top - f.from.top;
    const s = f.to.width / Math.max(1, f.from.width);
    const arc = arcOf(dx, dy);
    const tilt = tiltOf(dx, dy);
    const mid = 1 + (s - 1) * 0.55;
    const inner = el.querySelector<HTMLElement>('.fly-inner');
    if (f.flip) {
      inner?.animate(
        [
          { transform: 'rotateY(180deg)', offset: 0 },
          { transform: 'rotateY(180deg)', offset: 0.06 },
          { transform: 'rotateY(360deg)', offset: 0.42 },
          { transform: 'rotateY(360deg)', offset: 1 },
        ],
        { duration: D(820), easing: 'ease-in-out', fill: 'forwards' },
      );
      el.animate(
        [
          { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', offset: 0 },
          { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', offset: 0.34 },
          {
            transform: `translate(${dx * 0.55}px, ${dy * 0.55 - arc}px) rotate(${tilt}deg) scale(${mid})`,
            offset: 0.72,
          },
          { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${s})`, offset: 1 },
        ],
        { duration: D(820), easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
      )
        .finished.then(onDone)
        .catch(onDone);
      return;
    }
    el.animate(
      [
        { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', offset: 0 },
        {
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - arc}px) rotate(${tilt}deg) scale(${mid})`,
          offset: 0.55,
        },
        { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${s})`, offset: 1 },
      ],
      { duration: D(460), easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
    )
      .finished.then(onDone)
      .catch(onDone);
  } catch {
    // WAAPI در دسترس نیست — پرواز تمام‌شده حساب شود تا کارت پنهان آزاد شود
    onDone();
  }
}

// سوزاندن دو ورق: پرواز و چرخش به سمت زمین و محو شدن
function animateBurn(el: HTMLElement, f: Flight, onDone: () => void): void {
  try {
    const dx = f.to.left - f.from.left;
    const dy = f.to.top - f.from.top;
    const s = f.to.width / Math.max(1, f.from.width);
    el.animate(
      [
        { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
        {
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) rotate(150deg) scale(${(1 + s) / 2})`,
          opacity: 1,
          offset: 0.55,
        },
        {
          transform: `translate(${dx}px, ${dy}px) rotate(330deg) scale(${s * 0.9})`,
          opacity: 0,
          offset: 1,
        },
      ],
      { duration: D(640), easing: 'cubic-bezier(0.3, 0.05, 0.4, 1)', fill: 'forwards' },
    )
      .finished.then(onDone)
      .catch(onDone);
  } catch {
    onDone();
  }
}

// جمع‌کردن دست: وسط → وارونه شدن → نشستن روی نشان برنده
function animateGather(
  el: HTMLElement,
  from: Rect,
  target: Rect,
  center: { x: number; y: number },
  idx: number,
  onDone: () => void,
): void {
  try {
    const cx1 = center.x - (from.left + from.width / 2);
    const cy1 = center.y - (from.top + from.height / 2);
    const s2 = target.width / Math.max(1, from.width);
    const tx2 = target.left - from.left;
    const ty2 = target.top - from.top;
    const tilt = idx % 2 === 0 ? -(5 + idx * 3) : 5 + idx * 3;
    const inner = el.querySelector<HTMLElement>('.fly-inner');
    inner?.animate(
      [
        { transform: 'rotateY(0deg)', offset: 0 },
        { transform: 'rotateY(0deg)', offset: 0.3 },
        { transform: 'rotateY(180deg)', offset: 0.48 },
        { transform: 'rotateY(180deg)', offset: 1 },
      ],
      { duration: D(1250), easing: 'ease-in-out', fill: 'forwards' },
    );
    el.animate(
      [
        { transform: 'translate(0px, 0px) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
        {
          transform: `translate(${cx1}px, ${cy1}px) rotate(${tilt}deg) scale(1)`,
          opacity: 1,
          offset: 0.3,
        },
        {
          transform: `translate(${cx1}px, ${cy1}px) rotate(${tilt}deg) scale(1)`,
          opacity: 1,
          offset: 0.48,
        },
        {
          transform: `translate(${tx2}px, ${ty2}px) rotate(0deg) scale(${s2})`,
          opacity: 1,
          offset: 0.85,
        },
        {
          transform: `translate(${tx2}px, ${ty2}px) rotate(0deg) scale(${s2})`,
          opacity: 0,
          offset: 1,
        },
      ],
      { duration: D(1250), easing: 'ease-in-out', fill: 'forwards' },
    )
      .finished.then(onDone)
      .catch(onDone);
  } catch {
    // بدون WAAPI کارتِ جمع‌شده هم تمام‌شده حساب می‌شود تا نشان برنده ظاهر شود
    onDone();
  }
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

function DealCard(props: { deck: Rect; to: Rect; delay: number }) {
  return (
    <div
      className="fly-clone deal-card"
      style={{
        left: props.deck.left,
        top: props.deck.top,
        width: props.deck.width,
        height: props.deck.height,
      }}
      ref={(el) => {
        if (!el || el.dataset.on === '1') return;
        el.dataset.on = '1';
        try {
          const dx = props.to.left - props.deck.left;
          const dy = props.to.top - props.deck.top;
          el.animate(
            [
              {
                transform: 'translate(0px, 0px) rotate(-12deg) scale(0.92)',
                opacity: 0,
                offset: 0,
              },
              {
                transform: 'translate(0px, 0px) rotate(-12deg) scale(0.92)',
                opacity: 1,
                offset: 0.08,
              },
              {
                transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 46}px) rotate(8deg) scale(0.96)`,
                opacity: 1,
                offset: 0.55,
              },
              {
                transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(0.85)`,
                opacity: 1,
                offset: 0.84,
              },
              {
                transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(0.85)`,
                opacity: 0,
                offset: 1,
              },
            ],
            {
              duration: D(460),
              delay: REDUCED ? 0 : props.delay,
              easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
              fill: 'both',
            },
          );
        } catch {
          /* بدون WAAPI کارت با انیمیشن CSS دست نمایش داده می‌شود */
        }
      }}
    >
      <div className="card-face-back" />
    </div>
  );
}

// پخش ورق: از وسط زمین به سمت هر بازیکن (رند-بای-رند، با تاخیر)
function DealBurst(props: { root: HTMLElement; count: number }) {
  const spec = useMemo(() => {
    const felt = props.root.querySelector<HTMLElement>('.trick-area');
    if (!felt) return null;
    const fr = felt.getBoundingClientRect();
    const deck = {
      left: fr.left + fr.width / 2 - 23,
      top: fr.top + fr.height / 2 - 33,
      width: 46,
      height: 66,
    };
    const cx = fr.left + fr.width / 2;
    const cy = fr.top + fr.height / 2;
    const targets: Rect[] = [];
    props.root.querySelectorAll<HTMLElement>('.seat[data-seat]').forEach((p) => {
      const pr = p.getBoundingClientRect();
      const pcx = pr.left + pr.width / 2;
      const pcy = pr.top + pr.height / 2;
      const vx = cx - pcx;
      const vy = cy - pcy;
      const d = Math.hypot(vx, vy) || 1;
      targets.push({
        left: pcx + (vx / d) * 34 - 23,
        top: pcy + (vy / d) * 34 - 33,
        width: 46,
        height: 66,
      });
    });
    if (targets.length === 0) return null;
    return { deck, targets };
  }, [props.root, props.count]);

  if (!spec) return null;
  const nodes: ReactNode[] = [];
  for (let s = 0; s < spec.targets.length; s++) {
    for (let i = 0; i < props.count; i++) {
      nodes.push(
        <DealCard
          key={`${s}-${i}`}
          deck={spec.deck}
          to={spec.targets[s]}
          delay={(i * spec.targets.length + s) * 48}
        />,
      );
    }
  }
  return <>{nodes}</>;
}

export function useTableMotion(args: Args): {
  notePlay: (card: CardId, from: Rect) => void;
  noteDraw: (card: CardId | null, from: Rect, flip: boolean, hand: CardId[]) => void;
  noteBurn: (items: { card: CardId; from: Rect }[]) => void;
  hidden: Set<CardId>;
  markerSeat: number | null;
  lingering: TrickEntry[] | null;
  stale: TrickEntry[] | null;
  held: number[];
  renderLayer: () => ReactNode;
} {
  const { rootRef, handRef, phase, trick, leader, hand, fullN } = args;
  // محل کلیک روی هر کارت دست (به‌جای یک جایگاه واحد، چون ثبت یکی می‌توانست
  // رکورد ورق دیگر را پاک کند و انیمیشن بازیکن دوم ساخته نشود)
  const pendingPlays = useRef(new Map<CardId, Rect>());
  const pendingDraw = useRef<{ card: CardId | null; from: Rect; flip: boolean; hand: CardId[] } | null>(
    null,
  );
  const pendingBurn = useRef<{ card: CardId; from: Rect }[] | null>(null);
  const pendingGather = useRef<{
    cards: { card: CardId; from: Rect }[];
    winner: number;
    readyAt: number;
  } | null>(null);
  const lastRects = useRef(new Map<CardId, Rect>());
  const prevTrick = useRef<TrickEntry[]>([]);
  const gatherDone = useRef(0);
  const prevPhaseRef = useRef(phase);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [hidden, setHidden] = useState<Set<CardId>>(() => new Set());
  const [gather, setGather] = useState<Gather | null>(null);
  const [markerSeat, setMarkerSeat] = useState<number | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [lingering, setLingering] = useState<TrickEntry[] | null>(null);
  const [gatherTick, setGatherTick] = useState(0);

  const finishFlight = useCallback((f: Flight) => {
    setFlights((xs) => xs.filter((x) => x.id !== f.id));
    setHidden((s) => {
      const n = new Set(s);
      n.delete(f.card);
      return n;
    });
  }, []);

  const startFlight = useCallback(
    (spec: Omit<Flight, 'id'>) => {
      const id = ++seq;
      const f: Flight = { id, ...spec };
      setHidden((s) => new Set(s).add(spec.card));
      setFlights((xs) => [...xs, f]);
      // ضامن ایمنی: اگر پرواز تمام نشد، ورق پنهان دوباره دیده شود
      window.setTimeout(() => finishFlight(f), 2500);
    },
    [finishFlight],
  );

  const notePlay = useCallback((card: CardId, from: Rect) => {
    pendingPlays.current.set(card, from);
    window.setTimeout(() => {
      if (pendingPlays.current.get(card) === from) pendingPlays.current.delete(card);
    }, 8000);
  }, []);

  const noteDraw = useCallback(
    (card: CardId | null, from: Rect, flip: boolean, handSnapshot: CardId[]) => {
      const p = { card, from, flip, hand: handSnapshot };
      pendingDraw.current = p;
      window.setTimeout(() => {
        if (pendingDraw.current === p) pendingDraw.current = null;
      }, 8000);
    },
    [],
  );

  const noteBurn = useCallback((items: { card: CardId; from: Rect }[]) => {
    const p = items;
    pendingBurn.current = p;
    window.setTimeout(() => {
      if (pendingBurn.current === p) pendingBurn.current = null;
    }, 8000);
  }, []);

  // پخش ورق در شروع دور: ورود به cut/trump از فاز قبلی (نه cut→trump)
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (phase !== 'cut' && phase !== 'trump') return;
    if (prev === 'cut' || prev === 'trump') return;
    const d = { id: ++seq, count: fullN === 4 ? 13 : 5 };
    setDeal(d);
    window.setTimeout(
      () => {
        setDeal((x) => (x && x.id === d.id ? null : x));
      },
      fullN === 4 ? 3100 : 1500,
    );
  }, [phase, fullN]);

  const startPendingGather = useCallback(() => {
    const pg = pendingGather.current;
    if (!pg) return;
    pendingGather.current = null;
    gatherDone.current = 0;
    // موقعیت زندهٔ کارت‌ها را همین حالا بخوان — انیمیشن‌های ورود تا این لحظه تمام شده‌اند
    let cards = pg.cards;
    let target: Rect | null = null;
    let felt: Rect | null = null;
    const root = rootRef.current;
    if (root) {
      const live: { card: CardId; from: Rect }[] = [];
      root.querySelectorAll<HTMLElement>('[data-fcc]').forEach((el) => {
        const c = el.getAttribute('data-fcc');
        if (c) live.push({ card: c as CardId, from: el.getBoundingClientRect() });
      });
      if (live.length === pg.cards.length) cards = live;
      // اندازه‌گیری مقصد هم‌زمان است: با یک کامیت واحد هم کارت‌های اصلی از DOM
      // حذف می‌شوند هم کلون‌ها نشسته‌اند — هیچ فریمی بدون کارت دیده نمی‌شود
      const mk = root.querySelector<HTMLElement>(`[data-fmk="w${pg.winner}"]`);
      const feltEl = root.querySelector<HTMLElement>('.trick-area');
      if (mk) target = mk.getBoundingClientRect();
      if (feltEl) felt = feltEl.getBoundingClientRect();
    }
    setMarkerSeat(pg.winner);
    setLingering(null);
    if (target && felt) setGather({ cards, winner: pg.winner, target, felt });
  }, [rootRef]);

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

  // کارت‌های دستِ تمام‌شده تا شروع پروازِ جمع‌کردن روی زمین می‌مانند
  useLayoutEffect(() => {
    if (trick.length === 0 && prevTrick.current.length === fullN) {
      setLingering((l) => (l === null ? prevTrick.current.slice() : l));
    } else if (trick.length > 0) {
      // دستِ بعدی زود شروع شد: جمعِ دستِ قبلی باید قبل از پخش‌شدن انجام شود
      // (در passive effect دیر است و یک فریم بدون کارت دیده می‌شود)
      if (prevTrick.current.length === 0 && pendingGather.current && flights.length === 0) {
        pendingGather.current.readyAt = 0;
        startPendingGather();
      }
      setLingering((l) => (l !== null ? null : l));
    }
  }, [trick, fullN, flights, startPendingGather]);

  // کارت تازه بازی‌شده: هر دو کارت با انیمیشن روی زمین می‌نشینند (بدون مخفی‌کردن)
  useEffect(() => {
    const prev = prevTrick.current;
    const cur = trick;
    if (cur.length > prev.length && rootRef.current) {
      if (prev.length === 0 && pendingGather.current) {
        // دست بعدی زود شروع شد — جمعِ دستِ قبلی را همین حالا انجام بده
        pendingGather.current.readyAt = 0;
        setGatherTick((x) => x + 1);
        if (flights.length === 0) startPendingGather();
      }
      for (const tc of cur) {
        if (prev.some((p) => p.seat === tc.seat && p.card === tc.card)) continue;
        const toEl = rootRef.current.querySelector<HTMLElement>(`[data-fcc="${tc.card}"]`);
        if (!toEl) continue;
        const from = pendingPlays.current.get(tc.card);
        if (from) {
          pendingPlays.current.delete(tc.card);
          animateSlotIn(toEl, from, false);
          continue;
        }
        const panel = rootRef.current.querySelector<HTMLElement>(`[data-seat="${tc.seat}"]`);
        if (panel) {
          animateSlotIn(toEl, centerRect(panel.getBoundingClientRect()), true);
          continue;
        }
        // خودِ شما در ۲نفره پنل ندارد — از مرکز دست حرکت را شروع کن تا
        // انیمیشن ورود هیچ‌وقت حذف نشود
        if (handRef?.current) {
          animateSlotIn(toEl, centerRect(handRef.current.getBoundingClientRect()), false);
        }
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
      // مکث ۲ ثانیه‌ای: هر دو کارت کنار هم بمانند، بعد با هم جمع شوند
      pendingGather.current = {
        cards,
        winner: leader,
        readyAt: Date.now() + (REDUCED ? 200 : 2000),
      };
      setGatherTick((x) => x + 1);
    } else if (prev.length === fullN && cur.length === 0) {
      setLingering(null);
    } else if (cur.length > 0 && markerSeat !== null) {
      setMarkerSeat(null);
    }
    prevTrick.current = cur;
  }, [trick, leader, fullN, markerSeat, rootRef, flights, startPendingGather]);

  // جمع‌کردن دست: بعد از مکث و وقتی پروازهای در جریان تمام شده‌اند
  useEffect(() => {
    const pg = pendingGather.current;
    if (!pg) return;
    const fire = () => {
      if (flights.length === 0 && pendingGather.current) startPendingGather();
    };
    const wait = Math.max(0, pg.readyAt - Date.now());
    if (wait === 0) {
      fire();
      return;
    }
    const t = window.setTimeout(fire, wait);
    return () => window.clearTimeout(t);
  }, [flights, gatherTick, startPendingGather]);

  // فازهای بین‌دور (کوپ/حکم/سوزاندن/برداشت) نشانِ دور قبل را پاک می‌کنند
  useEffect(() => {
    if (phase === 'play' || phase === 'bam' || phase === 'roundEnd') return;
    pendingGather.current = null;
    if (markerSeat !== null) {
      setMarkerSeat(null);
    }
    if (lingering !== null) setLingering(null);
  }, [phase, markerSeat, lingering]);

  // برداشت از زمین (نگه دار / دومی را بردار) → پرواز وارونه از زمین تا دست
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
    const el = handRef?.current?.querySelector<HTMLElement>(`[data-card="${card}"]`);
    if (!el) return;
    const to = el.getBoundingClientRect();
    startFlight({ card, from: p.from, to, size: 'md', flip: p.flip });
  }, [hand, handRef, startFlight]);

  // سوزاندن دو ورق: پرواز از دست تا وسط زمین و محو شدن
  useEffect(() => {
    const pb = pendingBurn.current;
    if (!pb) return;
    const removed = pb.filter((x) => !hand.includes(x.card));
    if (removed.length === 0) return;
    pendingBurn.current = null;
    const root = rootRef.current;
    if (!root) return;
    const to = feltCenter(root);
    if (!to) return;
    for (const r of removed) {
      startFlight({ card: r.card, from: r.from, to, size: 'lg', flip: false, kind: 'burn' });
    }
  }, [hand, rootRef, startFlight]);

  const doneOne = useCallback(() => {
    if (!gather) return;
    gatherDone.current += 1;
    if (gatherDone.current >= gather.cards.length) {
      setGather(null);
    }
  }, [gather]);

  const renderLayer = useCallback((): ReactNode => {
    const root = rootRef.current;
    const g = gather;
    let gatherNodes: ReactNode = null;
    if (g) {
      const target = g.target;
      const center = {
        x: g.felt.left + g.felt.width / 2,
        y: g.felt.top + g.felt.height / 2,
      };
      gatherNodes = g.cards.map((c, idx) => (
        <Clone
          key={`g-${c.card}`}
          card={c.card}
          from={c.from}
          size="md"
          animate={(el) => animateGather(el, c.from, target, center, idx, doneOne)}
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
        {deal && root ? <DealBurst key={`deal-${deal.id}`} root={root} count={deal.count} /> : null}
      </div>
    );
  }, [flights, gather, deal, finishFlight, doneOne, rootRef]);

  // دستِ تمام‌شده نباید حتی برای یک رندر هم ناپدید شود — وگرنه المان کارت دوم
  // از DOM حذف می‌شود و انیمیشن‌اش قطع و کارت ناگهانی ظاهر می‌شود
  const stale =
    trick.length === 0 && prevTrick.current.length === fullN ? prevTrick.current : null;

  // دستهٔ برنده تا وقتی کارت‌ها واقعاً جمع و جلوی بازیکن گذاشته نشده‌اند نمایش داده نمی‌شود
  const held = useMemo(() => {
    const h = [0, 0, 0, 0];
    if (gather !== null) h[gather.winner] += 1;
    if (lingering !== null && leader !== null) h[leader] += 1;
    return h;
  }, [gather, lingering, leader]);

  return {
    notePlay,
    noteDraw,
    noteBurn,
    hidden,
    markerSeat,
    lingering,
    stale,
    held,
    renderLayer,
  };
}
