import { useEffect, useState, type ReactNode } from 'react';
import {
  SUIT_FA,
  SUIT_SYMBOL,
  partnerOf,
  suitOf,
  teamOf,
  type Action,
  type CardId,
  type PlayerView,
} from 'shared';
import { CardView, SeatPanel, SuitButton } from './components';

interface Props {
  state: PlayerView;
  act: (a: Action) => void;
}

function teamLabel(team: number): string {
  return team === 0 ? 'تیم اول' : 'تیم دوم';
}

export function GameTable({ state, act }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [cutIdx, setCutIdx] = useState(26);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.deadline === null) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [state.deadline]);

  const you = state.you;
  const anchor = you ?? 0;
  const yourTeam = you !== null ? teamOf(you) : null;
  const seatName = (s: number | null) =>
    s !== null && state.players[s] ? state.players[s]!.name : '—';
  const playedFor = (s: number): CardId | null =>
    state.trick.find((tc) => tc.seat === s)?.card ?? null;

  const remaining =
    state.deadline !== null ? Math.max(0, Math.ceil((state.deadline - now) / 1000)) : null;

  const yourScore = yourTeam !== null ? state.points[yourTeam] : state.points[0];
  const oppScore = yourTeam !== null ? state.points[1 - yourTeam] : state.points[1];
  const partner = state.hakem !== null ? partnerOf(state.hakem) : null;

  const trickLeadSuit = state.trick.length > 0 ? suitOf(state.trick[0].card) : null;

  // ---------- لابی ----------
  if (state.phase === 'lobby') {
    const joined = state.players.filter(Boolean).length;
    const shareUrl = `${window.location.origin}${import.meta.env.BASE_URL}?g=${state.gameId}`;
    return (
      <div className="lobby">
        <h2>🃏 لابی حکم</h2>
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
          {joined < 4
            ? `منتظر ${4 - joined} بازیکن دیگر… لینک را در گروه بفرستید.`
            : 'همه آماده‌اند!'}
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
              disabled={joined < 4}
            >
              شروع بازی ({joined}/4)
            </button>
          ) : null}
          {state.can.leave ? (
            <button type="button" className="ghost" onClick={() => act({ k: 'leave' })}>
              خروج
            </button>
          ) : null}
        </div>
        <p className="rules-mini">
          حکم ۴ نفره: دو تیم دو نفره، اولین آس حاکم می‌شود، حاکم خال حکم را انتخاب می‌کند، هر تیم
          ۷ دست بگیرد دور را برده است. کت = ۳ یا ۲ امتیاز، بام = برد نهایی.
        </p>
      </div>
    );
  }

  // ---------- پایان مسابقه ----------
  if (state.phase === 'matchEnd') {
    return (
      <div className="overlay">
        <div className="panel end-panel">
          <div className="trophy">🏆</div>
          <h2>پایان مسابقه</h2>
          <p className="big-score">
            {state.points[0]} — {state.points[1]}
          </p>
          <p>
            برنده:{' '}
            <strong>{state.matchWinner !== null ? teamLabel(state.matchWinner) : '—'}</strong>
          </p>
          {state.lastRound?.bam ? <p className="bam-note">بام! 🎉</p> : null}
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
                  {p.name} — {teamLabel(teamOf(i))}
                </li>
              ) : null
            )}
          </ul>
        </div>
      </div>
    );
  }

  // ---------- میز ----------
  const positionOf = (d: number): 'right' | 'top' | 'left' =>
    d === 1 ? 'right' : d === 2 ? 'top' : 'left';
  const others = [1, 2, 3].map((d) => ({ seat: (anchor + d) % 4, pos: positionOf(d) }));

  return (
    <div className="table">
      <header className="hud">
        <div className="score">
          <span className={`sc mine ${yourTeam !== null ? '' : ''}`}>{yourScore}</span>
          <span className="sep">—</span>
          <span className="sc opp">{oppScore}</span>
          <span className="trick-count">
            دست‌ها: {yourTeam !== null ? state.tricks[yourTeam] : state.tricks[0]} —{' '}
            {yourTeam !== null ? state.tricks[1 - yourTeam] : state.tricks[1]}
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
        {others.map(({ seat, pos }) => (
          <SeatPanel
            key={seat}
            player={state.players[seat]}
            position={pos}
            isTurn={state.turn === seat}
            played={playedFor(seat)}
          />
        ))}
        <div className={`seat bottom-me ${state.turn === anchor ? 'turn' : ''}`}>
          {state.players[anchor] ? (
            <>
              <span className="seat-name">
                {state.players[anchor]!.name}
                {state.players[anchor]!.isHakem ? ' 👑' : ''}
                {state.players[anchor]!.isPartner ? ' 🤝' : ''}
              </span>
              <span className="seat-cards">{state.players[anchor]!.cardCount} ورق</span>
            </>
          ) : null}
          {playedFor(anchor) ? (
            <div className="played-card">
              <CardView card={playedFor(anchor)!} size="md" />
            </div>
          ) : null}
          {state.turn === anchor ? <span className="turn-dot" aria-hidden /> : null}
        </div>
      </div>

      <div className="trick-area">
        {state.aceLog.length > 0 && (state.phase === 'cut' || state.phase === 'trump') ? (
          <div className="ace-log">
            <span className="ace-caption">تعیین حاکم (اولین آس):</span>
            <div className="ace-cards">
              {state.aceLog.map((c, i) => (
                <CardView key={`${c}-${i}`} card={c} size="sm" />
              ))}
            </div>
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

      <div className={`hand ${state.can.play ? 'my-turn' : ''}`}>
        {state.hand.length === 0 ? (
          <span className="hand-empty">—</span>
        ) : (
          state.hand.map((card, i) => {
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

  function renderActions(): ReactNode {
    switch (state.phase) {
      case 'cut': {
        if (state.can.cut) {
          return (
            <div className="action-group">
              <span className="action-title">شما یار حاکم هستید — دسته را کوپ کنید</span>
              <input
                type="range"
                min={1}
                max={51}
                value={cutIdx}
                onChange={(e) => setCutIdx(Number(e.target.value))}
              />
              <div className="btn-row">
                <button type="button" className="primary" onClick={() => act({ k: 'cut', index: cutIdx })}>
                  کوپ ({cutIdx})
                </button>
                <button type="button" className="ghost" onClick={() => act({ k: 'cut', index: null })}>
                  کوپ نکن
                </button>
              </div>
            </div>
          );
        }
        return (
          <span className="waiting">
            منتظر کوپ {seatName(partner)}… {remaining !== null ? `(${remaining}ث)` : ''}
          </span>
        );
      }

      case 'trump': {
        return (
          <div className="action-group">
            {state.can.trump ? (
              <>
                <span className="action-title">حاکم هستید — خال حکم را انتخاب کنید</span>
                <div className="suits">
                  {(['H', 'D', 'C', 'S'] as const).map((s) => (
                    <SuitButton key={s} suit={s} onClick={() => act({ k: 'trump', suit: s })} />
                  ))}
                </div>
                {state.can.redeal ? (
                  <button type="button" className="ghost" onClick={() => act({ k: 'redeal' })}>
                    تقاضای توزیع مجدد (دست زیر ۱۰ و بدون تصویری)
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <span className="waiting">
                  منتظر تعیین حکم توسط {seatName(state.hakem)}…{' '}
                  {remaining !== null ? `(${remaining}ث)` : ''}
                </span>
                {state.can.vote ? (
                  <button type="button" className="ghost" onClick={() => act({ k: 'vote' })}>
                    رأی به توزیع مجدد ({state.can.votes}/2)
                  </button>
                ) : null}
              </>
            )}
            {state.can.vote && state.can.trump ? (
              <button type="button" className="ghost" onClick={() => act({ k: 'vote' })}>
                رأی به توزیع مجدد ({state.can.votes}/2)
              </button>
            ) : null}
          </div>
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

      case 'bam': {
        const t = state.bamTeam;
        if (state.can.bam) {
          return (
            <div className="action-group">
              <span className="action-title">
                تیم شما ۷ دست گرفت و حریف کت است! ادامه برای «بام» (۱۳ دست)؟
              </span>
              <div className="btn-row">
                <button type="button" className="primary" onClick={() => act({ k: 'bam', cont: true })}>
                  ادامه — بام!
                </button>
                <button type="button" className="ghost" onClick={() => act({ k: 'bam', cont: false })}>
                  پایان دور
                </button>
              </div>
              {remaining !== null ? <span className="waiting">({remaining}ث)</span> : null}
            </div>
          );
        }
        return <span className="waiting">تیم {t !== null ? teamLabel(t) : ''} تصمیم می‌گیرد…</span>;
      }

      case 'roundEnd': {
        const lr = state.lastRound;
        return (
          <div className="action-group">
            <span className="action-title">
              پایان دور — {lr ? teamLabel(lr.winner) : ''} {lr?.points ?? 0} امتیاز گرفت
              {lr && lr.tricks[1 - lr.winner] === 0 ? ' (کت!)' : ''} — نتیجه: {state.points[0]}-
              {state.points[1]}
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
