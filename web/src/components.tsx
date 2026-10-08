import type { CSSProperties, MouseEvent } from 'react';
import {
  RANK_DISPLAY,
  SUIT_FA,
  SUIT_SYMBOL,
  isRed,
  rankOf,
  suitOf,
  type CardId,
  type PublicPlayer,
  type Suit,
} from 'shared';

export function CardView(props: {
  card: CardId;
  size?: 'sm' | 'md' | 'lg';
  dim?: boolean;
  playable?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  label?: string;
  style?: CSSProperties;
}) {
  const s = suitOf(props.card);
  const cls = ['card', props.size ?? 'md', isRed(s) ? 'red' : 'black'];
  if (props.dim) cls.push('dim');
  if (props.playable) cls.push('playable');
  return (
    <button
      type="button"
      className={cls.join(' ')}
      style={props.style}
      onClick={props.onClick}
      disabled={!props.onClick}
      aria-label={props.card}
    >
      <span className="rank">{RANK_DISPLAY[rankOf(props.card)]}</span>
      <span className="suit">{SUIT_SYMBOL[s]}</span>
      {props.label ? <span className="card-label">{props.label}</span> : null}
    </button>
  );
}

export function TrickStack(props: {
  seat: number;
  count: number;
  self?: boolean;
  perGroup?: number;
}) {
  const n = Math.min(Math.max(props.count, 0), 13);
  if (n === 0) return null;
  const perGroup = Math.max(1, Math.min(props.perGroup ?? 4, 4));
  const small = perGroup >= 4;
  const w = small ? 14 : 22;
  const h = small ? 19 : 30;
  const off = small ? 4 : 6;
  const gw = w + (perGroup - 1) * off;
  return (
    <div className={`trick-stack${props.self ? ' self' : ''}`} aria-hidden>
      {Array.from({ length: n }, (_, g) => (
        <div
          key={g}
          className="ts-group"
          style={{ width: gw, height: h }}
          data-fmk={g === n - 1 ? `w${props.seat}` : undefined}
        >
          {Array.from({ length: perGroup }, (_, i) => (
            <div
              key={i}
              className="st-card"
              style={{ left: i * off, width: w, height: h, zIndex: i + 1 }}
            >
              <div className="card-face-back" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SeatPanel(props: {
  player: PublicPlayer | null;
  position: 'top' | 'left' | 'right';
  isTurn: boolean;
  you?: boolean;
  hideRoles?: boolean;
  played?: { card: CardId; ace?: boolean; reveal?: boolean } | null;
  stack?: number;
  perGroup?: number;
}) {
  const p = props.player;
  const played = props.played;
  return (
    <div className={`seat ${props.position} ${props.isTurn ? 'turn' : ''}`} data-seat={p?.seat}>
      <div className="avatar">{p ? p.name.trim().charAt(0) : '?'}</div>
      <div className="seat-meta">
        <span className="seat-name">
          {p ? p.name : 'خالی'}
          {props.you ? ' (شما)' : ''}
        </span>
        <span className="seat-badges">
          {p?.isHakem && !props.hideRoles ? <span title="حاکم">👑</span> : null}
          {p?.isPartner && !props.hideRoles ? <span title="یار حاکم">🤝</span> : null}
        </span>
      </div>
      <div className="seat-cards">{p ? `${p.cardCount} ورق` : ''}</div>
      {props.isTurn ? <span className="turn-dot" aria-hidden /> : null}
      {played ? (
        <div
          className={`played-slot${played.reveal ? ' reveal' : ''}${played.ace ? ' is-ace' : ''}`}
          data-fcc={played.card}
        >
          <CardView card={played.card} size="md" />
        </div>
      ) : null}
      {p ? (
        <TrickStack seat={p.seat} count={props.stack ?? 0} perGroup={props.perGroup} />
      ) : null}
    </div>
  );
}

export function SuitButton(props: { suit: Suit; onClick: () => void }) {
  const red = props.suit === 'H' || props.suit === 'D';
  return (
    <button
      type="button"
      className={`suit-btn ${red ? 'red' : 'black'}`}
      onClick={props.onClick}
    >
      <span className="sym">{SUIT_SYMBOL[props.suit]}</span>
      <span className="nm">{SUIT_FA[props.suit]}</span>
    </button>
  );
}

export function CardBack({ count }: { count: number }) {
  return (
    <span className="card-back" aria-hidden>
      {count}
    </span>
  );
}
