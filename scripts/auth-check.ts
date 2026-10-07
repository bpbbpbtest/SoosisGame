import { verifyInitData } from '../server/src/auth.ts';
import { createHmac } from 'node:crypto';

const TOKEN = '8333624755:AAE8nwTOJ7l0jB92GdO3j62X9OykQFaiZ8I';

const user = JSON.stringify({ id: 111, first_name: 'Test', username: 'tester' });
const fields = { user, auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAF_test' };
const dcs = Object.keys(fields)
  .sort()
  .map((k) => `${k}=${fields[k]}`)
  .join('\n');
const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
const hash = createHmac('sha256', secret).update(dcs).digest('hex');
const forged = new URLSearchParams({ ...fields, hash }).toString();

console.log('forged initData ->', JSON.stringify(verifyInitData(forged, TOKEN, false)));
console.log('empty initData  ->', JSON.stringify(verifyInitData('', TOKEN, false)));
