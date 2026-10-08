import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  SUIT_FA,
  SUIT_SYMBOL,
  suitOf,
  type Action,
  type CardId,
  type PlayerView2,
} from 'shared';
import { CardView, SeatPanel, SuitButton } from './components';
import { useAceReveal } from './useAceReveal';
import { useTableMotion, type Rect } from './useTableMotion';

interface Props {
  state: PlayerView2;
  act: (a: Action) => void;
}

export function GameTable2({ state, act }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [burnSel, setBurnSel] = useState<CardId[]>([]);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const drawCard1Ref = useRef<HTMLDivElement | null>(null);
  const drawBackRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (state.deadline === null) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [state.deadline]);

  useEffect(() => {
    setBurnSel([]);
  }, [state.phase, state.turn]);

  const you = state.you;
  const anchor = you ?? 0;
  const opp = 1 - anchor;
  const seatName = (s: number | null) =>
    s !== null && state.players[s] ? state.players[s]!.name : '—';
  const reveal = useAceReveal(state.aceLog, state.hakem, 2);
  const dealing = state.phase === 'trump';
  const motion = useTableMotion({
    rootRef,
    handRef,
    phase: state.phase,
    trick: state.trick,
    leader: state.leader,
    hand: state.hand,
    fullN: 2,
  });
  const showMarker =
    motion.markerSeat !== null &&
    state.trick.length === 0 &&
    (state.phase === 'play' || state.phase === 'roundEnd');
  const fieldCards: { seat: number; card: CardId; ace: boolean }[] =
    state.phase === 'play'
      ? state.trick.map((tc) => ({ seat: tc.seat, card: tc.card, ace: false }))
      : showMarker
        ? []
        : reveal.cards;
  const selfField = fieldCards.filter((c) => c.seat === anchor);
  const theirField = fieldCards.find((c) => c.seat !== anchor) ?? null;

  const remaining =
    state.deadline !== null ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : null;

  const yourScore = you !== null ? state.points[you] : state.points[0];
  const oppScore = you !== null ? state.points[1 - you] : state.points[1];

  const trickLeadSuit = state.trick.length > 0 ? suitOf(state.trick[0].card) : null;

  // ---------- لابی ----------
  if (state.phase === 'lobby') {
    const joined = state.players.filter(Boolean).length;
    const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}?g=${state.gameId}`;
    return (
      <div className="lobby">
        <h2>🃏 لابی حکم دو نفره</h2>
        <div className="lobby-code">
          کد بازی: <strong>{state.gameId}</strong>
        </div>
        <ul className="seat-list">
          {state.players.map((p, i) => (
            <li key={i} className={p && you === i ? 'me' : ''}>
              <span className="idx">{i + 1}.</span>
              <span className="nm">{p ? p.name : '— خالی —'}</span>
              {p && you === i ? <span className="tag">شما</span> : null}
            </li>
          ))}
        </ul>
        <p className="hint">
          {joined < 2
            ? `منتظر ${2 - joined} بازیکن دیگر… لینک را در گروه بفرستید.`
            : 'هر دو آماده‌اند!'}
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(shareUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? 'کپی شد ✓' : 'کپی لینک دعوت'}
          </button>
          {state.can.start ? (
            <button
              type="button"
              className="primary"
              onClick={() => act({ k: 'start' })}
              disabled={joined < 2}
            >
              شروع بازی ({joined}/2)
            </button>
          ) : null}
          {state.can.leave ? (
            <button type="button" className="ghost" onClick={() => act({ k: 'leave' })}>
              خروج
            </button>
          ) : null}
        </div>
        <p className="rules-mini">
          حکم ۲ نفره: اولین آس حاکم می‌شود و خال حکم را خودش انتخاب می‌کند. ۵ ورق پخش، هر بازیکن ۲
          ورق می‌سوزاند، سپس زوجی از زمین برمی‌دارد تا دست‌ها ۱۳ ورقی شود. هر کس ۷ دست بگیرد دور را
          برده است؛ کت (۷-۰): حاکم ۲ و حریف ۳ امتیاز.
        </p>
      </div>
    );
  }

  // ---------- پایان مسابقه ----------
  if (state.phase === 'matchEnd') {
    const winner = state.matchWinner !== null ? state.players[state.matchWinner]?.name : null;
    return (
      <div className="overlay">
        <div className="panel end-panel">
          <div className="trophy">🏆</div>
          <h2>پایان مسابقه</h2>
          <p className="big-score">
            {state.points[0]} — {state.points[1]}
          </p>
          <p>
            برنده: <strong>{winner ?? '—'}</strong>
          </p>
          <div className="btn-row">
            {state.can.restart ? (
              <button type="button" className="primary" onClick={() => act({ k: 'restart' })}>
                بازی جدید
              </button>
            ) : null}
          </div>
          <ul className="end-players">
            {state.players.map((p, i) =>
              p ? (
                <li key={i}>
                  {p.name}
                  {state.matchWinner === i ? ' — برنده 🏆' : ''}
                </li>
              ) : null
            )}
          </ul>
        </div>
      </div>
    );
  }

  // ---------- میز ----------
  const inBurn = state.phase === 'burn' && state.can.burn;

  return (
    <div className="table" ref={rootRef}>
      <header className="hud">
        <div className="score">
          <span key={`m-${yourScore}`} className="sc mine">
            {yourScore}
          </span>
          <span className="sep">—</span>
          <span key={`o-${oppScore}`} className="sc opp">
            {oppScore}
          </span>
          <span
            key={`t-${you !== null ? state.tricks[you] : state.tricks[0]}-${
              you !== null ? state.tricks[1 - you] : state.tricks[1]
            }`}
            className="trick-count"
          >
            دست‌ها: {you !== null ? state.tricks[you] : state.tricks[0]} —{' '}
            {you !== null ? state.tricks[1 - you] : state.tricks[1]}
          </span>
        </div>
        <div className="hud-meta">
          <span
            key={state.trump ?? 'no-trump'}
            className={`trump-badge${state.trump ? ` t-${state.trump}` : ''}`}
          >
            {state.trump ? (
              <>
                حکم: {SUIT_SYMBOL[state.trump]} {SUIT_FA[state.trump]}
              </>
            ) : (
              <>حکم: —</>
            )}
          </span>
          <span>حاکم: {reveal.running ? '…تعیین' : seatName(state.hakem)}</span>
          <span>دور تا {state.matchTarget}</span>
        </div>
      </header>

      {you === null ? <div className="banner spectate">تماشاچی — بازی را می‌بینید</div> : null}

      <div className="seats">
        <SeatPanel
          player={state.players[opp]}
          position="top"
          isTurn={state.turn === opp}
          hideRoles={reveal.running}
          played={
            theirField
              ? {
                  card: theirField.card,
                  ace: theirField.ace,
                  hidden: motion.hidden.has(theirField.card),
                  reveal: reveal.active,
                }
              : null
          }
          marker={showMarker && motion.markerSeat === opp}
          markerVisible={motion.markerVisible}
        />
      </div>

      <div className="trick-area">
        {selfField.map(({ card, ace }) => (
          <div
            key={card}
            data-fcc={card}
            className={`trick-card pos-0${ace ? ' is-ace' : ''}${reveal.active ? ' reveal' : ''}`}
            style={motion.hidden.has(card) ? { visibility: 'hidden' } : undefined}
          >
            <CardView card={card} size="md" />
          </div>
        ))}
        {showMarker && motion.markerSeat === anchor ? (
          <div className="trick-card pos-0">
            <div
              className={`trick-marker${motion.markerVisible ? ' show' : ' m-hidden'}`}
              data-fmk=""
            />
          </div>
        ) : null}
        {reveal.active ? (
          <div className={`hakem-reveal${reveal.done ? ' done' : ''}`}>
            {reveal.done
              ? `تک (آس) آمد — حاکم: ${seatName(state.hakem)}`
              : `تعیین حاکم — کارت ${reveal.revealed} از ${reveal.total}`}
          </div>
        ) : null}
        {state.phase === 'draw' && state.draw ? (
          <div className="ace-log">
            <span className="ace-caption">
              زمین: {state.draw.pileLeft} ورق — برداشت زوجی (ورق دوم پنهان است)
            </span>
            {state.draw.card1 ? (
              <div className="ace-cards draw-row">
                <div ref={drawCard1Ref}>
                  <CardView card={state.draw.card1} size="md" />
                </div>
                <div ref={drawBackRef} className="draw-back">
                  <div className="card-face-back" />
                </div>
              </div>
            ) : (
              <span className="waiting">{`${seatName(state.draw.turn)} در حال برداشت…`}</span>
            )}
          </div>
        ) : null}
        {state.trick.length === 0 && state.phase === 'play' ? (
          <div className="table-hint">
            {state.turn !== null ? `نوبت: ${seatName(state.turn)}` : ''}
            {remaining !== null ? ` — ${remaining}ث` : ''}
          </div>
        ) : null}
        {trickLeadSuit && state.phase === 'play' ? (
          <div className="lead-badge">خال زمینه: {SUIT_FA[trickLeadSuit]}</div>
        ) : null}
      </div>

      <div className="actionbar">{renderActions()}</div>

      <div className={`hand ${state.can.play || inBurn ? 'my-turn' : ''}`} ref={handRef}>
        {state.hand.length === 0 ? (
          <span className="hand-empty">—</span>
        ) : (
          state.hand.map((card, i) => {
            const style: CSSProperties = {
              animationDelay: `${Math.min(i * (dealing ? 55 : 45), dealing ? 680 : 260)}ms`,
            };
            if (motion.hidden.has(card)) style.visibility = 'hidden';
            if (inBurn) {
              const selected = burnSel.includes(card);
              return (
                <CardView
                  key={card}
                  style={style}
                  card={card}
                  size="lg"
                  playable={selected}
                  onClick={() => toggleBurn(card)}
                />
              );
            }
            const isLegal = state.legal.includes(card);
            const dim = state.can.play && !isLegal;
            return (
              <CardView
                key={card}
                style={style}
                card={card}
                size="lg"
                dim={dim}
                playable={state.can.play && isLegal}
                onClick={
                  state.can.play && isLegal
                    ? (e) => {
                        motion.notePlay(card, e.currentTarget.getBoundingClientRect());
                        act({ k: 'play', card });
                      }
                    : undefined
                }
              />
            );
          })
        )}
      </div>

      <details className="log">
        <summary>گزارش بازی ({state.log.length})</summary>
        <ul>
          {state.log
            .slice(-15)
            .reverse()
            .map((l, i) => (
              <li key={i}>{l}</li>
            ))}
        </ul>
      </details>

      {motion.renderLayer()}
    </div>
  );

  function toggleBurn(card: CardId): void {
    setBurnSel((sel) => {
      if (sel.includes(card)) return sel.filter((c) => c !== card);
      if (sel.length < 2) return [...sel, card];
      return [sel[1], card];
    });
  }

  function renderActions(): ReactNode {
    const revealHint = reveal.running
      ? `تعیین حاکم — کارت ${reveal.revealed} از ${reveal.total}…`
      : null;
    switch (state.phase) {
      case 'trump': {
        if (revealHint) {
          return <span className="waiting">{revealHint}</span>;
        }
        if (state.can.trump) {
          return (
            <div className="action-group">
              <span className="action-title">حاکم هستید — خال حکم را انتخاب کنید</span>
              <div className="suits">
                {(['H', 'D', 'C', 'S'] as const).map((s) => (
                  <SuitButton key={s} suit={s} onClick={() => act({ k: 'trump', suit: s })} />
                ))}
              </div>
              {state.can.redeal ? (
                <button type="button" className="ghost" onClick={() => act({ k: 'redeal' })}>
                  ده‌لو — تقاضای توزیع مجدد (۵ ورق زیر ۱۰)
                </button>
              ) : null}
            </div>
          );
        }
        return (
          <span className="waiting">
            منتظر تعیین حکم توسط {seatName(state.hakem)}…{' '}
            {remaining !== null ? `(${remaining}ث)` : ''}
          </span>
        );
      }

      case 'burn': {
        if (inBurn) {
          return (
            <div className="action-group">
              <span className="action-title">
                دقیقاً ۲ ورق بسوزانید ({burnSel.length}/2 انتخاب شده)
              </span>
              <div className="btn-row">
                <button
                  type="button"
                  className="primary"
                  disabled={burnSel.length !== 2}
                  onClick={() => {
                    const items: { card: CardId; from: Rect }[] = [];
                    for (const card of burnSel) {
                      const el = handRef.current?.querySelector<HTMLElement>(
                        `[aria-label="${card}"]`,
                      );
                      if (el) items.push({ card, from: el.getBoundingClientRect() });
                    }
                    motion.noteBurn(items);
                    act({ k: 'burn', cards: burnSel });
                  }}
                >
                  بسوزان
                </button>
                {burnSel.length > 0 ? (
                  <button type="button" className="ghost" onClick={() => setBurnSel([])}>
                    پاک کردن
                  </button>
                ) : null}
              </div>
            </div>
          );
        }
        return (
          <span className="waiting">
            انتخاب ۲ ورق برای سوزاندن توسط {seatName(state.turn)}…{' '}
            {remaining !== null ? `(${remaining}ث)` : ''}
          </span>
        );
      }

      case 'draw': {
        if (state.can.drawPick && state.draw) {
          return (
            <div className="action-group">
              <span className="action-title">
                ورق اول را نگه می‌دارید یا می‌سوزانید؟ (ورق دوم برعکس می‌شود)
              </span>
              <div className="btn-row">
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    const c1 = state.draw?.card1;
                    if (!c1 || !drawCard1Ref.current) return;
                    motion.noteDraw(
                      c1,
                      drawCard1Ref.current.getBoundingClientRect(),
                      false,
                      state.hand,
                    );
                    act({ k: 'drawPick', keep: true });
                  }}
                >
                  نگه دار — دومی بسوزد
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (!drawBackRef.current) return;
                    motion.noteDraw(
                      null,
                      drawBackRef.current.getBoundingClientRect(),
                      true,
                      state.hand,
                    );
                    act({ k: 'drawPick', keep: false });
                  }}
                >
                  بسوزان — دومی را بردار
                </button>
              </div>
              {remaining !== null ? <span className="waiting">({remaining}ث)</span> : null}
            </div>
          );
        }
        return (
          <span className="waiting">
            برداشت زوجی توسط {seatName(state.draw?.turn ?? null)}…{' '}
            {remaining !== null ? `(${remaining}ث)` : ''}
          </span>
        );
      }

      case 'play': {
        if (state.can.play) {
          return (
            <span className="turn-now">
              نوبت شماست — ورق روشن را بزنید {remaining !== null ? `(${remaining}ث)` : ''}
            </span>
          );
        }
        return (
          <span className="waiting">
            نوبت: {seatName(state.turn)} {remaining !== null ? `(${remaining}ث)` : ''}
          </span>
        );
      }

      case 'roundEnd': {
        const lr = state.lastRound;
        const winnerName = lr ? seatName(lr.winner) : '';
        return (
          <div className="action-group">
            <span className="action-title">
              پایان دور — {winnerName} {lr?.points ?? 0} امتیاز گرفت
              {lr?.kti ? ' (کت!)' : ''} — نتیجه: {state.points[0]}-{state.points[1]}
            </span>
            <div className="btn-row">
              {state.can.next ? (
                <button type="button" className="primary" onClick={() => act({ k: 'next' })}>
                  دست بعد
                </button>
              ) : null}
              {state.can.forfeit ? (
                <button type="button" className="ghost" onClick={() => act({ k: 'forfeit' })}>
                  ترک بازی
                </button>
              ) : null}
            </div>
            {remaining !== null ? (
              <span className="waiting">شروع خودکار تا {remaining}ث دیگر</span>
            ) : null}
          </div>
        );
      }

      default:
        return null;
    }
  }
}
