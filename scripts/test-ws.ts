import { createHmac } from 'node:crypto';

const TOKEN = '8333624755:AAE8nwTOJ7l0jB92GdO3j62X9OykQFaiZ8I';
const BASE = process.argv[2] || 'https://sink-possible-edition-stylish.trycloudflare.com';
const GAME = process.argv[3] || '4YESCP';

function forgeInitData(userId, first_name) {
  const user = JSON.stringify({ id: userId, first_name, username: 'tester' });
  const fields = { user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAF_test' };
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

function tryWs(label, qs) {
  return new Promise((resolve) => {
    const wsBase = BASE.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/ws?${qs}`);
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      resolve(`${label}: TIMEOUT (no open/close in 6s)`);
    }, 6000);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(`${label}: OPEN (handshake ok)`);
      setTimeout(() => ws.close(), 500);
    };
    ws.onmessage = (ev) => resolve(`${label}: message -> ${String(ev.data).slice(0, 200)}`);
    ws.onclose = (ev) => {
      clearTimeout(timer);
      resolve(`${label}: CLOSED code=${ev.code} reason="${ev.reason || '(none)'}"`);
    };
    ws.onerror = () => {};
  });
}

const results = [];
results.push(await tryWs('A) no initData', `game=${GAME}&initData=`));
results.push(await tryWs('B) valid initData + real game', `game=${GAME}&initData=${forgeInitData(111, 'Test')}`));
results.push(await tryWs('C) valid initData + fake game', `game=ZZZZZZ&initData=${forgeInitData(111, 'Test')}`));
for (const r of results) console.log(r);
