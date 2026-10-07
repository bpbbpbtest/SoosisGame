import { createHmac } from 'node:crypto';

const TOKEN = '8333624755:AAE8nwTOJ7l0jB92GdO3j62X9OykQFaiZ8I';
const BASE = 'https://sink-possible-edition-stylish.trycloudflare.com';

function forge() {
  const user = JSON.stringify({ id: 111, first_name: 'Test', username: 'tester' });
  const fields = { user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAF_test' };
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function tryWs(label, qs) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws?${qs}`);
    const t = setTimeout(() => { try { ws.close(); } catch {} resolve(label + ': TIMEOUT'); }, 6000);
    ws.onopen = () => { clearTimeout(t); resolve(label + ': OPEN'); };
    ws.onmessage = (ev) => { clearTimeout(t); resolve(label + ': MSG -> ' + String(ev.data).slice(0, 220)); };
    ws.onclose = (ev) => { clearTimeout(t); resolve(`${label}: CLOSED code=${ev.code} reason="${ev.reason || '-'}"`); };
    ws.onerror = () => {};
  });
}

const id = encodeURIComponent(forge());
console.log(await tryWs('B2) valid + 4YESCP', 'game=4YESCP&initData=' + id));
console.log(await tryWs('C2) valid + ZZZZZZ', 'game=ZZZZZZ&initData=' + id));
