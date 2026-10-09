export interface Config {
  botToken: string | null;
  webappUrl: string;
  port: number;
  ownerId: string | null;
  allowDev: boolean;
  matchTarget: number;
}

function bool(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'yes';
}

function int(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
}

export function loadConfig(): Config {
  const botToken = process.env.BOT_TOKEN?.trim() || null;
  const webappUrl =
    process.env.WEBAPP_URL?.trim() || 'http://localhost:5173/SoosisGame/';
  return {
    botToken,
    webappUrl: webappUrl.endsWith('/') ? webappUrl : webappUrl + '/',
    port: int(process.env.PORT, 8787, 1, 65535),
    ownerId: process.env.TG_OWNER_ID?.trim() || null,
    allowDev: bool(process.env.ALLOW_DEV),
    // عدد نامعتبر نباید بازی را برای همیشه بدون پایان کند (points >= NaN هرگز درست نمی‌شود)
    matchTarget: int(process.env.MATCH_TARGET, 7, 1, 100),
  };
}
