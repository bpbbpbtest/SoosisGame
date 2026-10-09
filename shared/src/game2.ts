import {
  type CardId,
  SUITS,
  type Suit,
  cardName,
  cardValue,
  fullDeck,
  rankOf,
  shuffle,
  sortHand,
  suitOf,
} from './cards';
import { autoTrumpSuit, canRequestRedeal, legalCards, trickWinner } from './rules';
import { GameError, LOG_LIMIT, ROUND_END_MS, TRUMP_MS, TURN_MS } from './game';
import type { PlayerInfo, TrickCard } from './types';

export type Phase2 = 'lobby' | 'trump' | 'burn' | 'draw' | 'play' | 'roundEnd' | 'matchEnd';

export interface PublicPlayer2 {
  seat: number;
  name: string;
  photo?: string;
  cardCount: number;
  isHakem: boolean;
  isPartner: boolean;
}

export interface RoundResult2 {
  winner: number;
  points: number;
  tricks: [number, number];
  kti: boolean;
}

interface RoundState2 {
  hakem: number;
  hands: [CardId[], CardId[]];
  trump: Suit | null;
  /** کارت‌های باقی‌ماندهٔ زمین بعد از پخش ۵+۵ (۴۲ تا) */
  pile: CardId[];
  burned: CardId[];
  trick: TrickCard[];
  leader: number;
  tricks: TrickCard[][];
  aceLog: CardId[];
  redealRequested: boolean;
  /** نوبتِ زوجِ برداشت از زمین */
  drawTurn: number;
  /** ورق اولِ زوجِ جاری (فقط برای خودِ بازیکن فاش می‌شود) */
  currentDraw: CardId | null;
}

export interface PlayerView2 {
  mode: '2';
  gameId: string;
  chatId: number | null;
  phase: Phase2;
  you: number | null;
  players: (PublicPlayer2 | null)[];
  hand: CardId[];
  legal: CardId[];
  trump: Suit | null;
  trick: TrickCard[];
  leader: number | null;
  turn: number | null;
  deadline: number | null;
  // ساعت سرور هنگام ساخت وضعیت — کلاینت اختلاف ساعت را برای شمارش معکوس جبران می‌کند
  srvNow: number;
  tricks: [number, number];
  points: [number, number];
  roundTarget: number;
  matchTarget: number;
  hakem: number | null;
  matchWinner: number | null;
  lastRound: RoundResult2 | null;
  draw: { turn: number; card1: CardId | null; pileLeft: number } | null;
  can: {
    leave: boolean;
    start: boolean;
    trump: boolean;
    redeal: boolean;
    burn: boolean;
    drawPick: boolean;
    play: boolean;
    next: boolean;
    restart: boolean;
    forfeit: boolean;
  };
  aceLog: CardId[];
  log: string[];
  version: number;
}

export interface GameOptions2 {
  matchTarget?: number;
  roundTarget?: number;
  now?: () => number;
  rnd?: () => number;
  chatId?: number | null;
}

/**
 * حکم دو نفره:
 * - پخش ۵+۵، حاکم (اولین آس) خال حکم را انتخاب می‌کند (قانون ده‌لو: درخواست توزیع مجدد).
 * - هر بازیکن ۲ ورق می‌سوزاند؛ سپس زوجی از زمین برداشته می‌شود:
 *   ورق اول را خودِ بازیکن نگه می‌دارد یا می‌سوزاند و ورق دوم اجباری برعکس است — تا ۱۳ ورق.
 * - بازی دقیقاً مثل ۴ نفره تا ۷ دست؛ کوت (۷-۰): حاکم ۲ امتیاز، حریف ۳ امتیاز.
 */
export class Hokm2Game {
  readonly id: string;
  readonly mode = '2' as const;
  chatId: number | null;
  phase: Phase2 = 'lobby';
  players: (PlayerInfo | null)[] = [null, null];
  points: [number, number] = [0, 0];
  round: RoundState2 | null = null;
  hakem: number | null = null;
  matchWinner: number | null = null;
  lastRound: RoundResult2 | null = null;
  deadline: number | null = null;
  log: string[] = [];
  createdAt: number;
  matchTarget: number;
  roundTarget: number;
  notifiedEnd = false;
  onFlush: (() => void) | null = null;

  private burnSeat = 0;
  private readonly now: () => number;
  private readonly rnd: () => number;
  private versionCounter = 0;
  private lastActivity = 0;

  constructor(id: string, opts: GameOptions2 = {}) {
    this.id = id;
    this.chatId = opts.chatId ?? null;
    this.matchTarget = opts.matchTarget ?? 7;
    this.roundTarget = opts.roundTarget ?? 7;
    this.now = opts.now ?? Date.now;
    this.rnd = opts.rnd ?? Math.random;
    this.createdAt = this.now();
    this.lastActivity = this.now();
  }

  get version(): number {
    return this.versionCounter;
  }

  getActivity(): number {
    return this.lastActivity;
  }

  private bump(): void {
    this.versionCounter++;
    this.lastActivity = this.now();
  }

  private pushLog(text: string): void {
    this.log.push(text);
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
  }

  private setDeadline(ms: number): void {
    this.deadline = this.now() + ms;
  }

  private clearDeadline(): void {
    this.deadline = null;
  }

  seatOf(playerId: string): number | null {
    for (let i = 0; i < 2; i++) if (this.players[i]?.id === playerId) return i;
    return null;
  }

  private requireSeat(playerId: string): number {
    const s = this.seatOf(playerId);
    if (s === null) throw new GameError('شما در این بازی نیستید');
    return s;
  }

  private playerCount(): number {
    return this.players.filter(Boolean).length;
  }

  // ---------- لابی ----------

  join(player: PlayerInfo): number {
    if (this.phase !== 'lobby') throw new GameError('بازی قبلاً شروع شده است');
    const existing = this.seatOf(player.id);
    if (existing !== null) return existing;
    const free = this.players.indexOf(null);
    if (free === -1) throw new GameError('بازی پُر است (۲ نفر)');
    this.players[free] = { id: player.id, name: player.name, photo: player.photo };
    this.pushLog(`${player.name} به بازی پیوست (${free + 1}/2)`);
    this.bump();
    return free;
  }

  leave(playerId: string): void {
    if (this.phase !== 'lobby')
      throw new GameError('در میان بازی نمی‌توانید خارج شوید؛ از «ترک بازی» استفاده کنید');
    const seat = this.requireSeat(playerId);
    const name = this.players[seat]!.name;
    this.players[seat] = null;
    this.pushLog(`${name} از بازی خارج شد`);
    this.bump();
  }

  start(playerId: string): void {
    if (this.phase !== 'lobby') throw new GameError('بازی از قبل شروع شده');
    this.requireSeat(playerId);
    if (this.playerCount() !== 2) throw new GameError('برای شروع ۲ بازیکن لازم است');
    this.points = [0, 0];
    this.matchWinner = null;
    this.lastRound = null;
    this.notifiedEnd = false;
    // حاکم دور اول: اولین ورق آس‌خور در دستهٔ برخورده‌شده
    const deck = shuffle(fullDeck(), this.rnd);
    const aceLog: CardId[] = [];
    let hakem = 0;
    const startSeat = Math.floor(this.rnd() * 2);
    for (let i = 0; i < deck.length; i++) {
      aceLog.push(deck[i]);
      if (rankOf(deck[i]) === 'A') {
        hakem = (startSeat + i) % 2;
        break;
      }
    }
    this.hakem = hakem;
    this.pushLog(`حاکم شد: ${this.players[hakem]!.name} (اولین آس)`);
    this.beginRound(hakem, aceLog);
  }

  // ---------- چرخهٔ دور ----------

  private beginRound(hakem: number, aceLog: CardId[] = []): void {
    this.hakem = hakem;
    this.round = {
      hakem,
      hands: [[], []],
      trump: null,
      pile: [],
      burned: [],
      trick: [],
      leader: hakem,
      tricks: [],
      aceLog,
      redealRequested: false,
      drawTurn: hakem,
      currentDraw: null,
    };
    const deck = shuffle(fullDeck(), this.rnd);
    let di = 0;
    for (let k = 0; k < 5; k++) {
      for (let i = 0; i < 2; i++) this.round.hands[(hakem + i) % 2].push(deck[di++]);
    }
    this.round.pile = deck.slice(di);
    this.phase = 'trump';
    this.setDeadline(TRUMP_MS);
    this.pushLog(
      `دور جدید — حاکم: ${this.players[hakem]!.name} — ۵ ورق پخش شد؛ انتخاب حکم و سوزاندن ۲ ورق`
    );
    this.bump();
  }

  chooseTrump(playerId: string, suit: Suit): void {
    if (this.phase !== 'trump') throw new GameError('الان مرحلهٔ تعیین حکم نیست');
    const seat = this.requireSeat(playerId);
    if (seat !== this.hakem) throw new GameError('فقط حاکم خال حکم را انتخاب می‌کند');
    if (!SUITS.includes(suit)) throw new GameError('خال نامعتبر');
    this.applyTrump(suit);
  }

  private applyTrump(suit: Suit): void {
    const r = this.round!;
    r.trump = suit;
    this.pushLog(`حکم: ${suitLabel(suit)} — توسط ${this.players[this.hakem!]!.name}`);
    this.phase = 'burn';
    this.burnSeat = this.hakem!;
    this.setDeadline(TURN_MS);
    this.bump();
  }

  requestRedeal(playerId: string): void {
    if (this.phase !== 'trump') throw new GameError('الان فقط در مرحلهٔ تعیین حکم می‌توان توزیع مجدد خواست');
    const seat = this.requireSeat(playerId);
    const r = this.round!;
    if (seat !== this.hakem) throw new GameError('فقط حاکم می‌تواند تقاضای توزیع مجدد کند');
    if (r.redealRequested) throw new GameError('قبلاً تقاضا شده');
    if (!canRequestRedeal(r.hands[seat]))
      throw new GameError('دست شما شرایط «ده‌لو» (۵ ورق زیر ۱۰) را ندارد');
    r.redealRequested = true;
    this.pushLog(`${this.players[seat]!.name} تقاضای توزیع مجدد کرد (ده‌لو) — پذیرفته شد`);
    this.beginRound(this.hakem!, r.aceLog);
  }

  voteRedeal(): void {
    throw new GameError('رأی توزیع مجدد فقط در بازی چهارنفره وجود دارد');
  }

  // ---------- سوزاندن ۲ ورق ----------

  burnCards(playerId: string, cards: CardId[]): void {
    if (this.phase !== 'burn') throw new GameError('الان مرحلهٔ سوزاندن ورق نیست');
    const seat = this.requireSeat(playerId);
    if (seat !== this.burnSeat) throw new GameError('نوبت شما نیست');
    this.applyBurn(seat, cards);
  }

  private applyBurn(seat: number, cards: CardId[]): void {
    const r = this.round!;
    if (!Array.isArray(cards) || cards.length !== 2 || cards[0] === cards[1])
      throw new GameError('باید دقیقاً ۲ ورق متفاوت انتخاب کنید');
    const hand = r.hands[seat];
    for (const c of cards) {
      if (!hand.includes(c)) throw new GameError('این ورق در دست شما نیست');
    }
    r.hands[seat] = hand.filter((c) => !cards.includes(c));
    r.burned.push(...cards);
    this.pushLog(`${this.players[seat]!.name}: ۲ ورق سوزاند`);
    if (r.hands[1 - seat].length === 5) {
      this.burnSeat = 1 - seat;
      this.setDeadline(TURN_MS);
      this.bump();
      return;
    }
    // هر دو سوزاندند — شروع برداشت از زمین
    this.phase = 'draw';
    r.drawTurn = r.hakem;
    r.currentDraw = r.pile.shift() ?? null;
    this.pushLog('زمین آماده است — برداشت زوجی ورق (نگه دار / بسوزان)');
    this.setDeadline(TURN_MS);
    this.bump();
  }

  // ---------- برداشت از زمین ----------

  drawPick(playerId: string, keep: boolean): void {
    if (this.phase !== 'draw') throw new GameError('الان مرحلهٔ برداشت ورق نیست');
    const seat = this.requireSeat(playerId);
    if (seat !== this.round!.drawTurn) throw new GameError('نوبت شما نیست');
    this.applyDrawPick(seat, keep);
  }

  private applyDrawPick(seat: number, keep: boolean): void {
    const r = this.round!;
    const c1 = r.currentDraw;
    if (c1 === null) throw new GameError('کارتی روی زمین نیست');
    const name = this.players[seat]!.name;
    if (keep) {
      r.hands[seat].push(c1);
      const c2 = r.pile.shift();
      if (c2 !== undefined) r.burned.push(c2);
      this.pushLog(`${name}: ورق اول را نگه داشت، ورق دوم سوزاند`);
    } else {
      r.burned.push(c1);
      const c2 = r.pile.shift();
      if (c2 !== undefined) r.hands[seat].push(c2);
      this.pushLog(`${name}: ورق اول را سوزاند، ورق دوم را برداشت`);
    }
    r.currentDraw = null;
    if (r.hands[0].length === 13 && r.hands[1].length === 13) {
      this.beginPlay();
      return;
    }
    r.drawTurn = 1 - r.drawTurn;
    r.currentDraw = r.pile.shift() ?? null;
    if (r.currentDraw === null) {
      // زودتر از موعد تمام شد (نباید رخ دهد) — مستقیم وارد بازی شو
      this.pushLog('زمین تمام شد — بازی آغاز می‌شود');
      this.beginPlay();
      return;
    }
    this.setDeadline(TURN_MS);
    this.bump();
  }

  private beginPlay(): void {
    const r = this.round!;
    this.phase = 'play';
    r.leader = r.hakem;
    this.setDeadline(TURN_MS);
    this.pushLog('توزیع کامل شد (۱۳ ورق) — بازی آغاز شد؛ حاکم اول بازی می‌کند');
    this.bump();
  }

  // ---------- بازی ----------

  currentTurn(): number | null {
    if (this.phase === 'burn') return this.burnSeat;
    if (this.phase === 'draw') return this.round?.drawTurn ?? null;
    if (this.phase !== 'play' || !this.round) return null;
    const r = this.round;
    return (r.leader + r.trick.length) % 2;
  }

  legalFor(seat: number): CardId[] {
    if (!this.round || this.phase !== 'play') return [];
    return legalCards(this.round.hands[seat], this.round.trick);
  }

  play(playerId: string, card: CardId): void {
    const seat = this.requireSeat(playerId);
    this.applyPlay(seat, card);
  }

  private applyPlay(seat: number, card: CardId): void {
    if (this.phase !== 'play') throw new GameError('الان نمی‌توان بازی کرد');
    const turn = this.currentTurn();
    if (turn !== seat) throw new GameError('نوبت شما نیست');
    const r = this.round!;
    if (!r.hands[seat].includes(card)) throw new GameError('این ورق در دست شما نیست');
    const legal = legalCards(r.hands[seat], r.trick);
    if (!legal.includes(card)) {
      const lead = suitOf(r.trick[0].card);
      throw new GameError(`باید از خال ${suitLabel(lead)} بازی کنید`);
    }
    r.hands[seat] = r.hands[seat].filter((c) => c !== card);
    r.trick.push({ seat, card });
    this.pushLog(`${this.players[seat]!.name}: ${cardName(card)} آمد`);
    this.setDeadline(TURN_MS);
    this.bump();
    if (r.trick.length < 2) return;
    this.onFlush?.();
    this.resolveTrick();
  }

  private resolveTrick(): void {
    const r = this.round!;
    const winner = trickWinner(r.trick, r.trump!);
    r.tricks.push(r.trick.slice());
    const counts = this.trickCounts();
    this.pushLog(`دست را ${this.players[winner]!.name} گرفت (${counts[0]}-${counts[1]})`);
    r.trick = [];
    r.leader = winner;
    if (counts[winner] >= this.roundTarget) {
      this.endRound(winner);
      return;
    }
    this.setDeadline(TURN_MS);
    this.bump();
  }

  private trickCounts(): [number, number] {
    const r = this.round!;
    const out: [number, number] = [0, 0];
    for (const tr of r.tricks) out[trickWinner(tr, r.trump!)]++;
    return out;
  }

  private endRound(winner: number): void {
    const counts = this.trickCounts();
    const opp = 1 - winner;
    const kti = counts[opp] === 0;
    const pts = kti ? (winner === this.hakem ? 2 : 3) : 1;
    this.points[winner] += pts;
    this.lastRound = { winner, points: pts, tricks: counts, kti };
    const ktiLabel = kti ? (winner === this.hakem ? ' (کوت حاکم!)' : ' (حاکم کتی شد!)') : '';
    this.pushLog(
      `پایان دور — ${this.players[winner]!.name} ${pts} امتیاز گرفت${ktiLabel} — نتیجه: ${this.points[0]}-${this.points[1]}`
    );
    if (this.points[winner] >= this.matchTarget) {
      this.matchWinner = winner;
      this.phase = 'matchEnd';
      this.notifiedEnd = false;
      this.clearDeadline();
      this.pushLog(`پایان مسابقه — برنده: ${this.players[winner]!.name}`);
    } else {
      this.phase = 'roundEnd';
      this.setDeadline(ROUND_END_MS);
    }
    this.bump();
  }

  nextRound(playerId: string): void {
    this.requireSeat(playerId);
    this.advanceRound();
  }

  private advanceRound(): void {
    if (this.phase !== 'roundEnd') throw new GameError('دور هنوز تمام نشده');
    const prevHakem = this.hakem!;
    const winner = this.lastRound!.winner;
    const nextHakem = prevHakem === winner ? prevHakem : 1 - prevHakem;
    this.beginRound(nextHakem);
  }

  // ---------- پایان و شروع دوباره ----------

  restart(playerId: string): void {
    this.requireSeat(playerId);
    if (this.phase !== 'matchEnd') throw new GameError('مسابقه هنوز تمام نشده');
    this.points = [0, 0];
    this.round = null;
    this.hakem = null;
    this.matchWinner = null;
    this.lastRound = null;
    this.notifiedEnd = false;
    this.clearDeadline();
    this.phase = 'lobby';
    this.pushLog('مسابقهٔ جدید — منتظر ۲ بازیکن');
    this.bump();
  }

  forfeit(playerId: string): void {
    const seat = this.requireSeat(playerId);
    if (this.phase === 'lobby') {
      this.leave(playerId);
      return;
    }
    if (this.phase === 'matchEnd') throw new GameError('مسابقه تمام شده');
    const winner = 1 - seat;
    this.matchWinner = winner;
    this.phase = 'matchEnd';
    this.notifiedEnd = false;
    this.clearDeadline();
    this.pushLog(`${this.players[seat]!.name} بازی را ترک کرد — برد ${this.players[winner]!.name}`);
    this.bump();
  }

  // ---------- اکشن‌های مخصوص بازی چهارنفره (در این حالت نامعتبر) ----------

  cut(_playerId: string, _index: number | null): void {
    throw new GameError('کوپ فقط در بازی چهارنفره وجود دارد');
  }

  chooseBam(_playerId: string, _cont: boolean): void {
    throw new GameError('«بام» فقط در بازی چهارنفره وجود دارد');
  }

  // ---------- زمان‌بند خودکار ----------

  autoAdvance(now: number): boolean {
    if (this.deadline === null || now < this.deadline) return false;
    const before = this.versionCounter;
    try {
      switch (this.phase) {
        case 'trump': {
          const r = this.round!;
          const suit = autoTrumpSuit(r.hands[this.hakem!]);
          this.pushLog('مهلت تعیین حکم تمام شد — حکم خودکار');
          this.applyTrump(suit);
          break;
        }
        case 'burn': {
          const r = this.round!;
          const seat = this.burnSeat;
          const sorted = [...r.hands[seat]].sort((a, b) => cardValue(a) - cardValue(b));
          this.pushLog('مهلت سوزاندن تمام شد — ۲ ورق ضعیف خودکار سوزانده شد');
          this.applyBurn(seat, sorted.slice(0, 2));
          break;
        }
        case 'draw': {
          const r = this.round!;
          const seat = r.drawTurn;
          const c1 = r.currentDraw;
          if (c1 === null) {
            this.clearDeadline();
            this.bump();
            break;
          }
          const keep = suitOf(c1) === r.trump || cardValue(c1) >= 10;
          this.pushLog('مهلت برداشت تمام شد — انتخاب خودکار');
          this.applyDrawPick(seat, keep);
          break;
        }
        case 'play': {
          const turn = this.currentTurn();
          const legal = turn === null ? [] : this.legalFor(turn);
          if (turn === null || legal.length === 0) {
            this.clearDeadline();
            this.bump();
            break;
          }
          const card = legal[Math.floor(this.rnd() * legal.length)];
          this.pushLog('مهلت نوبت تمام شد — ورق خودکار');
          this.applyPlay(turn, card);
          break;
        }
        case 'roundEnd':
          this.advanceRound();
          break;
        default:
          this.clearDeadline();
          this.bump();
      }
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      this.pushLog(`خطای زمان‌بند: ${e.message}`);
      this.clearDeadline();
      this.bump();
    }
    return this.versionCounter !== before;
  }

  // ---------- نما برای هر بازیکن ----------

  view(seat: number | null): PlayerView2 {
    const r = this.round;
    const players: (PublicPlayer2 | null)[] = this.players.map((p, i) => {
      if (!p) return null;
      return {
        seat: i,
        name: p.name,
        photo: p.photo,
        cardCount: r ? r.hands[i].length : 0,
        isHakem: this.hakem === i,
        isPartner: false,
      };
    });
    const hand = seat !== null && r ? sortHand(r.hands[seat], r.trump) : [];
    const turn = this.currentTurn();
    const isHakem = seat !== null && this.hakem === seat;
    const draw =
      r !== null
        ? {
            turn: r.drawTurn,
            card1: seat !== null && seat === r.drawTurn ? r.currentDraw : null,
            pileLeft: r.pile.length,
          }
        : null;

    return {
      mode: '2',
      gameId: this.id,
      chatId: this.chatId,
      phase: this.phase,
      you: seat,
      players,
      hand,
      legal: seat !== null && this.phase === 'play' && turn === seat ? this.legalFor(seat) : [],
      trump: r?.trump ?? null,
      trick: r ? r.trick.slice() : [],
      leader: r ? r.leader : null,
      turn,
      deadline: this.deadline,
      srvNow: this.now(),
      tricks: r ? this.trickCounts() : [0, 0],
      points: [this.points[0], this.points[1]],
      roundTarget: this.roundTarget,
      matchTarget: this.matchTarget,
      hakem: this.hakem,
      matchWinner: this.matchWinner,
      lastRound: this.lastRound,
      draw,
      can: {
        leave: this.phase === 'lobby' && seat !== null,
        start: this.phase === 'lobby' && seat !== null && this.playerCount() === 2,
        trump: this.phase === 'trump' && isHakem,
        redeal:
          this.phase === 'trump' &&
          isHakem &&
          !!r &&
          !r.redealRequested &&
          canRequestRedeal(r.hands[this.hakem!]),
        burn: this.phase === 'burn' && seat !== null && seat === this.burnSeat,
        drawPick:
          this.phase === 'draw' &&
          seat !== null &&
          !!r &&
          seat === r.drawTurn &&
          r.currentDraw !== null,
        play: this.phase === 'play' && turn !== null && turn === seat,
        next: this.phase === 'roundEnd' && seat !== null,
        restart: this.phase === 'matchEnd' && seat !== null,
        forfeit: this.phase !== 'lobby' && this.phase !== 'matchEnd' && seat !== null,
      },
      aceLog: r && this.phase === 'trump' ? r.aceLog.slice() : [],
      log: this.log.slice(),
      version: this.versionCounter,
    };
  }
}

function suitLabel(s: Suit): string {
  return { H: 'دل', D: 'خشت', C: 'گشنیز', S: 'پیک' }[s];
}
