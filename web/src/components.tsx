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
  onClick?: () => void;
  label?: string;
}) {
  const s = suitOf(props.card);
  const cls = ['card', props.size ?? 'md', isRed(s) ? 'red' : 'black'];
  if (props.dim) cls.push('dim');
  if (props.playable) cls.push('playable');
  return (
    <button
      type="button"
      className={cls.join(' ')}
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

export function SeatPanel(props: {
  player: PublicPlayer | null;
  position: 'top' | 'left' | 'right';
  isTurn: boolean;
  you?: boolean;
}) {
  const p = props.player;
  return (
    <div className={`seat ${props.position} ${props.isTurn ? 'turn' : ''}`}>
      <div className="avatar">{p ? p.name.trim().charAt(0) : '?'}</div>
      <div className="seat-meta">
        <span className="seat-name">
          {p ? p.name : 'خالی'}
          {props.you ? ' (شما)' : ''}
        </span>
        <span className="seat-badges">
          {p?.isHakem ? <span title="حاکم">👑</span> : null}
          {p?.isPartner ? <span title="یار حاکم">🤝</span> : null}
        </span>
      </div>
      <div className="seat-cards">{p ? `${p.cardCount} ورق` : ''}</div>
      {props.isTurn ? <span className="turn-dot" aria-hidden /> : null}
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
