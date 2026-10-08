import { useEffect, useState, type ReactNode } from 'react';
import {
  SUIT_FA,
  SUIT_SYMBOL,
  suitOf,
  type Action,
  type CardId,
  type PlayerView2,
} from 'shared';
import { CardView, SeatPanel, SuitButton } from './components';

interface Props {
  state: PlayerView2;
  act: (a: Action) => void;
}

export function GameTable2({ state, act }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [burnSel, setBurnSel] = useState<CardId[]>([]);
  const [copied, setCopied] = useState(false);

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
    <div className="table">
      <header className="hud">
        <div className="score">
          <span className="sc mine">{yourScore}</span>
          <span className="sep">—</span>
          <span className="sc opp">{oppScore}</span>
          <span className="trick-count">
            دست‌ها: {you !== null ? state.tricks[you] : state.tricks[0]} —{' '}
            {you !== null ? state.tricks[1 - you] : state.tricks[1]}
          </span>
        </div>
        <div className="hud-meta">
          {state.trump ? (
            <span className={`trump-badge t-${state.trump}`}>
              حکم: {SUIT_SYMBOL[state.trump]} {SUIT_FA[state.trump]}
            </span>
          ) : (
            <span className="trump-badge">حکم: —</span>
          )}
          <span>حاکم: {seatName(state.hakem)}</span>
          <span>دور تا {state.matchTarget}</span>
        </div>
      </header>

      {you === null ? <div className="banner spectate">تماشاچی — بازی را می‌بینید</div> : null}

      <div className="seats">
        <SeatPanel
          player={state.players[opp]}
          position="top"
          isTurn={state.turn === opp}
        />
        <div className={`seat bottom-me ${state.turn === anchor ? 'turn' : ''}`}>
          {state.players[anchor] ? (
            <>
              <span className="seat-name">
                {state.players[anchor]!.name}
                {state.players[anchor]!.isHakem ? ' 👑' : ''}
              </span>
              <span className="seat-cards">{state.players[anchor]!.cardCount} ورق</span>
            </>
          ) : null}
          {state.turn === anchor ? <span className="turn-dot" aria-hidden /> : null}
        </div>
      </div>

      <div className="trick-area">
        {state.aceLog.length > 0 && state.phase === 'trump' ? (
          <div className="ace-log">
            <span className="ace-caption">تعیین حاکم (اولین آس):</span>
            <div className="ace-cards">
              {state.aceLog.map((c, i) => (
                <CardView key={`${c}-${i}`} card={c} size="sm" />
              ))}
            </div>
          </div>
        ) : null}
        {state.trick.length > 0 ? (
          <div className="trick-row">
            {state.trick.map((tc) => (
              <div key={`${tc.seat}-${tc.card}`} className="trick-card">
                <CardView card={tc.card} size="md" label={seatName(tc.seat)} />
              </div>
            ))}
          </div>
        ) : null}
        {state.phase === 'draw' && state.draw ? (
          <div className="ace-log">
            <span className="ace-caption">
              زمین: {state.draw.pileLeft} ورق — برداشت زوجی (ورق دوم پنهان است)
            </span>
            {state.draw.card1 ? (
              <div className="ace-cards">
                <CardView card={state.draw.card1} size="md" />
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

      <div className={`hand ${state.can.play || inBurn ? 'my-turn' : ''}`}>
        {state.hand.length === 0 ? (
          <span className="hand-empty">—</span>
        ) : (
          state.hand.map((card, i) => {
            if (inBurn) {
              const selected = burnSel.includes(card);
              return (
                <CardView
                  key={`${card}-${i}`}
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
                key={`${card}-${i}`}
                card={card}
                size="lg"
                dim={dim}
                playable={state.can.play && isLegal}
                onClick={
                  state.can.play && isLegal ? () => act({ k: 'play', card }) : undefined
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
    switch (state.phase) {
      case 'trump': {
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
                  onClick={() => act({ k: 'burn', cards: burnSel })}
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
                <button type="button" className="primary" onClick={() => act({ k: 'drawPick', keep: true })}>
                  نگه دار — دومی بسوزد
                </button>
                <button type="button" className="ghost" onClick={() => act({ k: 'drawPick', keep: false })}>
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
