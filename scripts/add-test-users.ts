import { createHmac } from 'node:crypto';

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) throw new Error('BOT_TOKEN env لازم است');
const BASE = (process.argv[3] as string) || 'https://copyright-resolutions-acres-none.trycloudflare.com';
const GAME = (process.argv[2] as string).toUpperCase();

function forge(id: number, first: string) {
  const user = JSON.stringify({ id, first_name: first, username: 'tester' });
  const fields = { user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAF_test' };
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return encodeURIComponent(new URLSearchParams({ ...fields, hash }).toString());
}

function joinAs(id: number, first: string): Promise<string> {
  return new Promise((resolve) => {
    const url = `${BASE.replace(/^http/, 'ws')}/ws?game=${GAME}&initData=${forge(id, first)}`;
    const ws = new WebSocket(url);
    const t = setTimeout(() => { try { ws.close(); } catch {} resolve(`${first}: TIMEOUT`); }, 8000);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data));
        if (msg.t === 'state') {
          clearTimeout(t);
          const seats = (msg.state.players || []).map((p: any) => (p ? `${p.seat}:${p.name}` : '-'));
          ws.close();
          resolve(`${first}: joined -> [${seats.join(', ')}]`);
        } else if (msg.t === 'error') {
          clearTimeout(t);
          resolve(`${first}: ERROR -> ${msg.message}`);
        }
      } catch {}
    };
    ws.onclose = (ev) => {
      clearTimeout(t);
      resolve(`${first}: CLOSED code=${ev.code} reason="${ev.reason || '-'}"`);
    };
    ws.onerror = () => {};
  });
}

console.log(await joinAs(111, 'Test1'));
console.log(await joinAs(112, 'Test2'));
