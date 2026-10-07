export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser };
  ready: () => void;
  expand: () => void;
  version: string;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export const tg: TgWebApp | undefined =
  typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

export function tgInitData(): string {
  return tg?.initData ?? '';
}

export function tgUser(): TgUser | undefined {
  return tg?.initDataUnsafe?.user;
}

export function tgDisplayName(): string {
  const u = tgUser();
  if (!u) return '';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '';
}

const DEV_NAME_KEY = 'soosisDevName';

export function devInitData(): string {
  let name = localStorage.getItem(DEV_NAME_KEY);
  if (!name) {
    name = `کاربر${Math.floor(Math.random() * 900 + 100)}`;
    localStorage.setItem(DEV_NAME_KEY, name);
  }
  return name;
}
