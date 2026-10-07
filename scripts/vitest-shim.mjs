import { isDeepStrictEqual } from 'node:util';

let passed = 0;
const failures = [];
let path = [];

export function describe(name, fn) {
  path.push(name);
  try {
    fn();
  } finally {
    path.pop();
  }
}

export function it(name, fn) {
  const full = [...path, name].join(' > ');
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push({ full, err: e });
  }
}

export const test = it;

function makeError(msg) {
  return new Error(msg);
}

export function expect(actual) {
  const build = (negate) => {
    const check = (cond, msg) => {
      const failed = negate ? cond : !cond;
      if (failed) throw makeError((negate ? 'NOT: ' : '') + msg + describeActual(actual));
    };
    const obj = {
      get not() {
        return build(!negate);
      },
      toBe(exp) {
        check(Object.is(actual, exp), `toBe(${fmt(exp)})`);
      },
      toEqual(exp) {
        check(isDeepStrictEqual(actual, exp), `toEqual(${fmt(exp)})`);
      },
      toHaveLength(n) {
        check(actual != null && actual.length === n, `toHaveLength(${n})`);
      },
      toBeNull() {
        check(actual === null, 'toBeNull');
      },
      toBeTruthy() {
        check(Boolean(actual), 'toBeTruthy');
      },
      toContain(x) {
        check(actual != null && actual.includes(x), `toContain(${fmt(x)})`);
      },
      toBeGreaterThan(n) {
        check(actual > n, `toBeGreaterThan(${n})`);
      },
      toBeGreaterThanOrEqual(n) {
        check(actual >= n, `toBeGreaterThanOrEqual(${n})`);
      },
      toThrow(cls) {
        if (typeof actual !== 'function') {
          throw makeError(`toThrow expects a function — actual: ${fmt(actual)}`);
        }
        let thrown = null;
        try {
          actual();
        } catch (e) {
          thrown = e;
        }
        let matched;
        if (thrown === null) matched = false;
        else if (cls === undefined) matched = true;
        else if (cls instanceof RegExp) matched = cls.test(String(thrown.message ?? thrown));
        else if (typeof cls === 'string') matched = String(thrown.message ?? thrown).includes(cls);
        else matched = thrown instanceof cls;
        const wanted =
          cls === undefined
            ? 'error'
            : cls instanceof RegExp
              ? String(cls)
              : typeof cls === 'string'
                ? JSON.stringify(cls)
                : cls.name ?? String(cls);
        check(matched, `to throw ${wanted} (got: ${thrown === null ? 'nothing' : thrown.message})`);
      },
    };
    return obj;
  };
  return build(false);
}

function fmt(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v instanceof Error) return v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function describeActual(a) {
  return ` — actual: ${fmt(a)}`;
}

process.on('beforeExit', () => {
  for (const f of failures) {
    console.error(`FAIL: ${f.full}\n  ${f.err?.stack ?? f.err}`);
  }
  console.log(`tests: ${passed + failures.length}, passed: ${passed}, failed: ${failures.length}`);
  if (failures.length > 0) process.exitCode = 1;
});
