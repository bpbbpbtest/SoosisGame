import {
  type CardId,
  SUITS,
  type Suit,
  cardName,
  fullDeck,
  rankOf,
  shuffle,
  sortHand,
  suitOf,
} from './cards';
import {
  autoTrumpSuit,
  canRequestRedeal,
  legalCards,
  partnerOf,
  teamOf,
  trickWinner,
} from './rules';
import type {
  GameState,
  Phase,
  PlayerInfo,
  RoundResult,
  RoundState,
  TrickCard,
} from './types';

export class GameError extends Error {}

const TURN_MS = 60_000;
const CUT_MS = 90_000;
const TRUMP_MS = 120_000;
const BAM_MS = 60_000;
const ROUND_END_MS = 120_000;
const LOG_LIMIT = 40;

export interface GameOptions {
  matchTarget?: number;
  roundTarget?: number;
  now?: () => number;
  rnd?: () => number;
  chatId?: number | null;
}

export interface PublicPlayer {
  seat: number;
  name: string;
  photo?: string;
  cardCount: number;
  isHakem: boolean;
  isPartner: boolean;
}

export interface PlayerView {
  gameId: string;
  chatId: number | null;
  phase: Phase;
  you: number | null;
  players: (PublicPlayer | null)[];
  hand: CardId[];
  legal: CardId[];
  trump: Suit | null;
  trick: TrickCard[];
  leader: number | null;
  turn: number | null;
  deadline: number | null;
  tricks: [number, number];
  points: [number, number];
  roundTarget: number;
  matchTarget: number;
  hakem: number | null;
  dealer: number | null;
  bamTeam: number | null;
  matchWinner: number | null;
  lastRound: RoundResult | null;
  can: {
    leave: boolean;
    start: boolean;
    cut: boolean;
    trump: boolean;
    redeal: boolean;
    vote: boolean;
    votes: number;
    play: boolean;
    bam: boolean;
    next: boolean;
    restart: boolean;
    forfeit: boolean;
  };
  aceLog: CardId[];
  log: string[];
  version: number;
}

export class HokmGame implements GameState {
  readonly id: string;
  chatId: number | null;
  phase: Phase = 'lobby';
  players: (PlayerInfo | null)[] = [null, null, null, null];
  points: [number, number] = [0, 0];
  round: RoundState | null = null;
  hakem: number | null = null;
  dealer: number | null = null;
  bamTeam: number | null = null;
  matchWinner: number | null = null;
  lastRound: RoundResult | null = null;
  deadline: number | null = null;
  log: string[] = [];
  createdAt: number;
  matchTarget: number;
  roundTarget: number;
  notifiedEnd = false;

  private readonly now: () => number;
  private readonly rnd: () => number;
  private versionCounter = 0;
  private lastActivity = 0;

  constructor(id: string, opts: GameOptions = {}) {
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
    for (let i = 0; i < 4; i++) if (this.players[i]?.id === playerId) return i;
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

  // ---------- lobby ----------

  join(player: PlayerInfo): number {
    if (this.phase !== 'lobby') throw new GameError('بازی قبلاً شروع شده است');
    const existing = this.seatOf(player.id);
    if (existing !== null) return existing;
    const free = this.players.indexOf(null);
    if (free === -1) throw new GameError('بازی پُر است (۴ نفر)');
    this.players[free] = { id: player.id, name: player.name, photo: player.photo };
    this.pushLog(`${player.name} به بازی پیوست (${free + 1}/4)`);
    this.bump();
    return free;
  }

  leave(playerId: string): void {
    if (this.phase !== 'lobby') throw new GameError('در میان بازی نمی‌توانید خارج شوید؛ از «ترک بازی» استفاده کنید');
    const seat = this.requireSeat(playerId);
    const name = this.players[seat]!.name;
    this.players[seat] = null;
    this.pushLog(`${name} از بازی خارج شد`);
    this.bump();
  }

  start(playerId: string): void {
    if (this.phase !== 'lobby') throw new GameError('بازی از قبل شروع شده');
    this.requireSeat(playerId);
    if (this.playerCount() !== 4) throw new GameError('برای شروع ۴ بازیکن لازم است');
    this.points = [0, 0];
    this.matchWinner = null;
    this.lastRound = null;
    this.notifiedEnd = false;
    // تعیین حاکم دور اول: اولین ورق آس‌خور (یارکشی قبلاً با نشستن انجام شده)
    const deck = shuffle(fullDeck(), this.rnd);
    const aceLog: CardId[] = [];
    let hakem = 0;
    const startSeat = Math.floor(this.rnd() * 4);
    for (let i = 0; i < deck.length; i++) {
      const card = deck[i];
      aceLog.push(card);
      if (rankOf(card) === 'A') {
        hakem = (startSeat + i) % 4;
        break;
      }
    }
    this.hakem = hakem;
    this.dealer = (hakem + 3) % 4;
    this.pushLog(`حاکم شد: ${this.players[hakem]!.name} (اولین آس)`);
    this.beginRound(hakem, aceLog);
  }

  // ---------- چرخهٔ دور ----------

  private beginRound(hakem: number, aceLog: CardId[] = []): void {
    const dealer = (hakem + 3) % 4;
    this.hakem = hakem;
    this.dealer = dealer;
    this.bamTeam = null;
    this.round = {
      hakem,
      dealer,
      hands: [[], [], [], []],
      trump: null,
      deck: shuffle(fullDeck(), this.rnd),
      trick: [],
      leader: hakem,
      aceLog,
      cutIndex: null,
      redealVotes: [],
      hakemRequestedRedeal: false,
      tricks: [],
    };
    this.phase = 'cut';
    this.setDeadline(CUT_MS);
    this.pushLog(
      `دور جدید — حاکم: ${this.players[hakem]!.name}، یار: ${
        this.players[partnerOf(hakem)]!.name
      } — ورق‌دهنده: ${this.players[dealer]!.name}`
    );
    this.bump();
  }

  private dealCards(n: number): void {
    const r = this.round!;
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < 4; i++) {
        const seat = (r.hakem + i) % 4;
        const card = r.deck.shift();
        if (card !== undefined) r.hands[seat].push(card);
      }
    }
  }

  cut(playerId: string, index: number | null): void {
    if (this.phase !== 'cut') throw new GameError('الان مرحلهٔ کوپ نیست');
    const seat = this.requireSeat(playerId);
    const r = this.round!;
    if (seat !== partnerOf(r.hakem)) throw new GameError('فقط یار حاکم می‌تواند کوپ کند');
    this.applyCut(index);
  }

  private applyCut(index: number | null): void {
    const r = this.round!;
    if (index !== null && index > 0 && index < r.deck.length) {
      r.deck = r.deck.slice(index).concat(r.deck.slice(0, index));
      r.cutIndex = index;
      this.pushLog(`دسته کوپ شد (موقعیت ${index})`);
    } else {
      r.cutIndex = null;
      this.pushLog('کوپ انجام نشد');
    }
    this.dealCards(5);
    this.phase = 'trump';
    this.setDeadline(TRUMP_MS);
    this.bump();
  }

  chooseTrump(playerId: string, suit: Suit): void {
    if (this.phase !== 'trump') throw new GameError('الان مرحلهٔ تعیین حکم نیست');
    const seat = this.requireSeat(playerId);
    const r = this.round!;
    if (seat !== r.hakem) throw new GameError('فقط حاکم خال حکم را تعیین می‌کند');
    if (!SUITS.includes(suit)) throw new GameError('خال نامعتبر');
    r.trump = suit;
    this.pushLog(`حکم: ${suitLabel(suit)} — توسط ${this.players[seat]!.name}`);
    this.dealCards(4);
    this.dealCards(4);
    for (let s = 0; s < 4; s++) {
      if (r.hands[s].length !== 13) throw new GameError('خطا در توزیع ورق');
    }
    this.phase = 'play';
    r.leader = r.hakem;
    this.setDeadline(TURN_MS);
    this.pushLog('توزیع ورق کامل شد — بازی آغاز شد');
    this.bump();
  }

  requestRedeal(playerId: string): void {
    if (this.phase !== 'trump') throw new GameError('الان فقط در مرحلهٔ تعیین حکم می‌توان توزیع مجدد خواست');
    const seat = this.requireSeat(playerId);
    const r = this.round!;
    if (seat !== r.hakem) throw new GameError('فقط حاکم می‌تواند تقاضای توزیع مجدد کند');
    if (r.hakemRequestedRedeal) throw new GameError('قبلاً تقاضا شده');
    if (!canRequestRedeal(r.hands[r.hakem]))
      throw new GameError('دست شما شرایط توزیع مجدد (زیر ۱۰ و بدون تصویری) را ندارد');
    r.hakemRequestedRedeal = true;
    this.pushLog(`${this.players[seat]!.name} تقاضای توزیع مجدد کرد — پذیرفته شد`);
    this.redeal();
  }

  voteRedeal(playerId: string): void {
    if (this.phase !== 'trump') throw new GameError('رأی فقط در مرحلهٔ تعیین حکم معتبر است');
    const seat = this.requireSeat(playerId);
    const r = this.round!;
    if (r.redealVotes.includes(playerId)) throw new GameError('رأی شما قبلاً ثبت شده');
    r.redealVotes.push(playerId);
    this.pushLog(`${this.players[seat]!.name} رأی توزیع مجدد داد (${r.redealVotes.length}/2)`);
    if (r.redealVotes.length >= 2) {
      this.pushLog('دو رأی ثبت شد — توزیع مجدد انجام می‌شود');
      this.redeal();
    } else {
      this.bump();
    }
  }

  private redeal(): void {
    const hakem = this.round!.hakem;
    this.beginRound(hakem, this.round!.aceLog);
  }

  // ---------- بازی ----------

  currentTurn(): number | null {
    if (this.phase !== 'play' || !this.round) return null;
    const r = this.round;
    return (r.leader + r.trick.length) % 4;
  }

  legalFor(seat: number): CardId[] {
    if (!this.round || this.phase !== 'play') return [];
    return legalCards(this.round.hands[seat], this.round.trick);
  }

  play(playerId: string, card: CardId): void {
    const seat = this.requireSeat(playerId);
    this.playCard(seat, card);
  }

  private playCard(seat: number, card: CardId): void {
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

    if (r.trick.length < 4) return;
    this.resolveTrick();
  }

  private resolveTrick(): void {
    const r = this.round!;
    const winner = trickWinner(r.trick, r.trump!);
    const team = teamOf(winner);
    r.tricks.push(r.trick.slice());
    const tricks = this.tricksByTeam();
    this.pushLog(`دست را ${this.players[winner]!.name} گرفت (${tricks[0]}-${tricks[1]})`);
    r.trick = [];
    r.leader = winner;

    if (this.bamTeam === null) {
      if (tricks[team] >= this.roundTarget) {
        const opp = 1 - team;
        if (tricks[opp] === 0) {
          // کتِ کامل: فرصت ادامه برای «بام»
          this.bamTeam = team;
          this.phase = 'bam';
          this.setDeadline(BAM_MS);
          this.pushLog(
            `تیم ${teamName(team)} ${this.roundTarget}-${0} شد — ادامه برای «بام» یا پایان دور؟`
          );
          this.bump();
          return;
        }
        this.endRound(team, false);
        return;
      }
    } else if (team === this.bamTeam) {
      if (tricks[team] >= 13) {
        this.endRound(this.bamTeam, true);
        return;
      }
    } else {
      // حریف در تلاش بام یک دست گرفت → همان کتی لحاظ می‌شود
      this.endRound(this.bamTeam, false, true);
      return;
    }

    this.setDeadline(TURN_MS);
    this.bump();
  }

  private tricksByTeam(): [number, number] {
    const r = this.round!;
    const out: [number, number] = [0, 0];
    for (const tr of r.tricks) out[teamOf(trickWinner(tr, r.trump!))]++;
    return out;
  }

  chooseBam(playerId: string, cont: boolean): void {
    if (this.phase !== 'bam') throw new GameError('الان تصمیم «بام» مطرح نیست');
    const seat = this.requireSeat(playerId);
    const team = teamOf(seat);
    if (this.bamTeam !== team) throw new GameError('فقط تیمی که به ۷ دست رسیده تصمیم می‌گیرد');
    if (!cont) {
      this.endRound(this.bamTeam!, false);
      return;
    }
    this.pushLog(`تیم ${teamName(team)} برای «بام» ادامه می‌دهد`);
    this.phase = 'play';
    this.setDeadline(TURN_MS);
    this.bump();
  }

  private endRound(winnerTeam: number, bam: boolean, forceKti = false): void {
    const r = this.round!;
    const tricks = this.tricksByTeam();
    const hakemTeam = teamOf(r.hakem);
    const opp = 1 - winnerTeam;
    let pts: number;

    if (bam) {
      pts = 0;
    } else if (forceKti || tricks[opp] === 0) {
      pts = opp === hakemTeam ? 3 : 2;
    } else {
      pts = 1;
    }

    if (bam) {
      this.matchWinner = winnerTeam;
      this.phase = 'matchEnd';
      this.notifiedEnd = false;
      this.clearDeadline();
      this.pushLog(`بام! تیم ${teamName(winnerTeam)} با ۱۳ دست کامل برندهٔ نهایی شد`);
      this.lastRound = { winner: winnerTeam, points: 0, tricks, bam: true };
      this.bump();
      return;
    }

    this.points[winnerTeam] += pts;
    this.lastRound = { winner: winnerTeam, points: pts, tricks, bam: false };
    const kti = forceKti || tricks[opp] === 0;
    this.pushLog(
      `پایان دور — تیم ${teamName(winnerTeam)} ${pts} امتیاز گرفت${kti ? ' (کت!)' : ''} — نتیجه: ${this.points[0]}-${this.points[1]}`
    );

    if (this.points[winnerTeam] >= this.matchTarget) {
      this.matchWinner = winnerTeam;
      this.phase = 'matchEnd';
      this.notifiedEnd = false;
      this.clearDeadline();
      this.pushLog(`پایان مسابقه — برنده: تیم ${teamName(winnerTeam)}`);
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
    const prevHakem = this.round!.hakem;
    const winner = this.lastRound!.winner;
    const hakemStays = teamOf(prevHakem) === winner;
    const nextHakem = hakemStays ? prevHakem : (prevHakem + 1) % 4;
    this.beginRound(nextHakem);
  }

  // ---------- پایان و شروع دوباره ----------

  restart(playerId: string): void {
    this.requireSeat(playerId);
    if (this.phase !== 'matchEnd') throw new GameError('مسابقه هنوز تمام نشده');
    this.points = [0, 0];
    this.round = null;
    this.hakem = null;
    this.dealer = null;
    this.bamTeam = null;
    this.matchWinner = null;
    this.lastRound = null;
    this.notifiedEnd = false;
    this.clearDeadline();
    this.phase = 'lobby';
    this.pushLog('مسابقهٔ جدید — منتظر ۴ بازیکن');
    this.bump();
  }

  forfeit(playerId: string): void {
    const seat = this.requireSeat(playerId);
    if (this.phase === 'lobby') {
      this.leave(playerId);
      return;
    }
    if (this.phase === 'matchEnd') throw new GameError('مسابقه تمام شده');
    const winner = 1 - teamOf(seat);
    this.matchWinner = winner;
    this.phase = 'matchEnd';
    this.notifiedEnd = false;
    this.clearDeadline();
    this.pushLog(`${this.players[seat]!.name} بازی را ترک کرد — برد تیم ${teamName(winner)}`);
    this.bump();
  }

  // ---------- زمان‌بند خودکار ----------

  autoAdvance(now: number): boolean {
    if (this.deadline === null || now < this.deadline) return false;
    const before = this.versionCounter;
    try {
      switch (this.phase) {
        case 'cut':
          this.pushLog('مهلت کوپ تمام شد — کوپ انجام نشد');
          this.applyCut(null);
          break;
        case 'trump': {
          const r = this.round!;
          const suit = autoTrumpSuit(r.hands[r.hakem]);
          this.pushLog('مهلت تعیین حکم تمام شد — حکم خودکار');
          this.chooseTrumpAuto(suit);
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
          this.playCard(turn, card);
          break;
        }
        case 'bam':
          this.pushLog('مهلت تصمیم بام تمام شد — دور پایان یافت');
          this.endRound(this.bamTeam!, false);
          break;
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

  private chooseTrumpAuto(suit: Suit): void {
    // بدون بررسی مجوز: فراخوانی داخلی زمان‌بند
    const r = this.round!;
    r.trump = suit;
    this.pushLog(`حکم خودکار: ${suitLabel(suit)}`);
    this.dealCards(4);
    this.dealCards(4);
    this.phase = 'play';
    r.leader = r.hakem;
    this.setDeadline(TURN_MS);
    this.bump();
  }

  // ---------- نما برای هر بازیکن ----------

  view(seat: number | null): PlayerView {
    const r = this.round;
    const players: (PublicPlayer | null)[] = this.players.map((p, i) => {
      if (!p) return null;
      return {
        seat: i,
        name: p.name,
        photo: p.photo,
        cardCount: r ? r.hands[i].length : 0,
        isHakem: this.hakem === i,
        isPartner: this.hakem !== null && partnerOf(this.hakem) === i,
      };
    });
    const hand = seat !== null && r ? sortHand(r.hands[seat], r.trump) : [];
    const turn = this.currentTurn();
    const legal = seat !== null && turn === seat ? this.legalFor(seat) : [];
    const myId = seat !== null ? this.players[seat]?.id : null;
    const isHakem = seat !== null && this.hakem === seat;

    return {
      gameId: this.id,
      chatId: this.chatId,
      phase: this.phase,
      you: seat,
      players,
      hand,
      legal,
      trump: r?.trump ?? null,
      trick: r ? r.trick.slice() : [],
      leader: r ? r.leader : null,
      turn,
      deadline: this.deadline,
      tricks: r ? this.tricksByTeam() : [0, 0],
      points: [this.points[0], this.points[1]],
      roundTarget: this.roundTarget,
      matchTarget: this.matchTarget,
      hakem: this.hakem,
      dealer: this.dealer,
      bamTeam: this.bamTeam,
      matchWinner: this.matchWinner,
      lastRound: this.lastRound,
      can: {
        leave: this.phase === 'lobby' && seat !== null,
        start: this.phase === 'lobby' && seat !== null,
        cut: this.phase === 'cut' && seat !== null && seat === partnerOf(this.hakem ?? -1),
        trump: this.phase === 'trump' && isHakem,
        redeal:
          this.phase === 'trump' &&
          isHakem &&
          !!r &&
          !r.hakemRequestedRedeal &&
          canRequestRedeal(r.hands[r.hakem]),
        vote: this.phase === 'trump' && seat !== null && !!myId && !!r && !r.redealVotes.includes(myId),
        votes: r ? r.redealVotes.length : 0,
        play: this.phase === 'play' && turn !== null && turn === seat,
        bam: this.phase === 'bam' && seat !== null && teamOf(seat) === this.bamTeam,
        next: this.phase === 'roundEnd' && seat !== null,
        restart: this.phase === 'matchEnd' && seat !== null,
        forfeit: this.phase !== 'lobby' && this.phase !== 'matchEnd' && seat !== null,
      },
      aceLog: r && (this.phase === 'cut' || this.phase === 'trump') ? r.aceLog.slice() : [],
      log: this.log.slice(),
      version: this.versionCounter,
    };
  }
}

function suitLabel(s: Suit): string {
  return { H: 'دل', D: 'خشت', C: 'گشنیز', S: 'پیک' }[s];
}

function teamName(team: number): string {
  return team === 0 ? 'اول' : 'دوم';
}
