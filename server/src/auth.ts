import { createHmac } from 'node:crypto';

export interface AuthedUser {
  id: string;
  name: string;
  photo?: string;
}

/**
 * اعتبارسنجی initData مینی‌اپ تلگرام (HMAC-SHA256 طبق مستندات Telegram).
 * در حالت ALLOW_DEV اگر ورودی شامل hash نباشد به‌عنوان کاربر توسعه پذیرفته می‌شود.
 */
export function verifyInitData(
  initData: string,
  token: string | null,
  allowDev: boolean
): AuthedUser | null {
  if (!initData) return null;

  if (!initData.includes('hash=')) {
    if (!allowDev) return null;
    const name = initData.slice(0, 40).replace(/[^\w\u0600-\u06FF \-]/g, '');
    if (!name) return null;
    return { id: `dev:${name}`, name };
  }

  if (!token) return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    // اعتبار initData محدود است (پیشنهاد تلگرام) — کلید دائمی نباشد
    const authDate = Number(params.get('auth_date'));
    if (
      !Number.isFinite(authDate) ||
      Math.abs(Date.now() / 1000 - authDate) > 24 * 60 * 60
    ) {
      return null;
    }
    params.delete('hash');
    const pairs = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
    const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
    const calc = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calc.length !== hash.length) return null;
    let diff = 0;
    for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ hash.charCodeAt(i);
    if (diff !== 0) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;
    const u = JSON.parse(userRaw) as {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };
    const name =
      [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || `کاربر ${u.id}`;
    return { id: String(u.id), name, photo: u.photo_url };
  } catch {
    return null;
  }
}
