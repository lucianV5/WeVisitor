const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'uniCloud-alipay', 'cloudfunctions');

const INDEX_JS_CONTENT = `'use strict';
const mod = require('./index.obj.js');
let mainFn = null;
if (mod && typeof mod.main === 'function') {
  mainFn = mod.main;
} else if (mod && typeof mod.default === 'function') {
  mainFn = mod.default;
} else if (typeof mod === 'function') {
  mainFn = mod;
} else if (mod && typeof mod === 'object') {
  const keys = Object.keys(mod);
  const k = keys.find((name) => typeof mod[name] === 'function');
  if (k) mainFn = mod[k];
}

function cloneAny(o) {
  if (o == null) return o;
  if (typeof o !== 'object') return o;
  try { return JSON.parse(JSON.stringify(o)); } catch (e) { return o; }
}

function normalizeEvent(rawEvent) {
  const ev = cloneAny(rawEvent) || {};
  if (typeof ev !== 'object') return { data: ev };
  const hasAction = typeof ev.action === 'string' && ev.action.length > 0;
  const hasMethod = typeof ev.method === 'string' && ev.method.length > 0;
  const hasName = typeof ev.name === 'string' && ev.name.length > 0;
  const hasFn = typeof ev.functionName === 'string' && ev.functionName.length > 0;
  const hasHttpParams = ev.httpMethod || ev.headers || ev.requestContext || ev.path;
  let bodyLike = null;
  if (ev.data !== undefined && ev.data !== null) bodyLike = ev.data;
  else if (ev.params !== undefined && ev.params !== null) bodyLike = ev.params;
  else if (ev.body !== undefined && ev.body !== null) bodyLike = ev.body;
  else if (typeof ev.queryStringParameters === 'object' && ev.queryStringParameters && Object.keys(ev.queryStringParameters).length) bodyLike = ev.queryStringParameters;
  if (hasHttpParams) {
    if (typeof bodyLike === 'string') {
      try { bodyLike = JSON.parse(bodyLike); } catch (e) {}
    }
  }
  if (hasAction && (hasMethod || hasName || hasFn)) {
    const drop = ['action','method','name','functionName','data','params','body','queryStringParameters','headers','requestContext','httpMethod','path','source','resource'];
    const rest = {};
    for (const k of Object.keys(ev)) {
      if (drop.indexOf(k) >= 0) continue;
      rest[k] = ev[k];
    }
    const meta = { action: ev.action, method: ev.method, name: ev.name, functionName: ev.functionName };
    if (bodyLike != null && typeof bodyLike === 'object') {
      return Object.assign({}, rest, bodyLike, { __invoke: meta });
    }
    if (bodyLike != null) {
      return Object.assign({}, rest, { data: bodyLike, __invoke: meta });
    }
    return Object.assign({}, rest, { __invoke: meta });
  }
  if (bodyLike != null && typeof bodyLike === 'object' && !Array.isArray(bodyLike)) {
    const merged = Object.assign({}, ev);
    for (const k of Object.keys(bodyLike)) {
      if (merged[k] === undefined || merged[k] === null) merged[k] = bodyLike[k];
    }
    return merged;
  }
  return ev;
}

async function mainHandler(event, context) {
  const normalized = normalizeEvent(event);
  if (!mainFn) {
    return { code: 500, msg: '云函数入口未找到 exports.main', data: null };
  }
  try {
    const result = await mainFn(normalized, context);
    if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'result') &&
        !Object.prototype.hasOwnProperty.call(result, 'data') && !Object.prototype.hasOwnProperty.call(result, 'code')) {
      return result.result;
    }
    return result;
  } catch (err) {
    const msg = (err && (err.message || err.msg || err.errMsg)) || String(err || 'FUNCTION_ERROR');
    console.error('[wrap] mainFn error:', msg, err && err.stack ? err.stack : err);
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
}

exports.main = mainHandler;

if (mod && typeof mod === 'object') {
  const keys = Object.keys(mod);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k === 'main') continue;
    if (Object.prototype.hasOwnProperty.call(exports, k)) continue;
    exports[k] = mod[k];
  }
}
`;

const dirs = fs.readdirSync(ROOT).filter((name) => {
  const p = path.join(ROOT, name);
  return fs.statSync(p).isDirectory();
});

dirs.forEach((name) => {
  const dir = path.join(ROOT, name);
  const idx = path.join(dir, 'index.js');
  fs.writeFileSync(idx, INDEX_JS_CONTENT);
  const pkgPath = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.main = 'index.js';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('patched', dir);
});

console.log('DONE: patched', dirs.length, 'cloudfunctions');
