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

export function loadConfig(): Config {
  const botToken = process.env.BOT_TOKEN?.trim() || null;
  const webappUrl =
    process.env.WEBAPP_URL?.trim() || 'http://localhost:5173/SoosisGame/';
  return {
    botToken,
    webappUrl: webappUrl.endsWith('/') ? webappUrl : webappUrl + '/',
    port: Number(process.env.PORT || 8787),
    ownerId: process.env.TG_OWNER_ID?.trim() || null,
    allowDev: bool(process.env.ALLOW_DEV),
    matchTarget: Number(process.env.MATCH_TARGET || 7),
  };
}
