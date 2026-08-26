'use strict';

// ====== Department data ======
const DEPARTMENTS = [
  { code: '300001', name: '高管' },
  { code: '300002', name: '研究部' },
  { code: '300003', name: '固定收益部' },
  { code: '300004', name: '项目投资部' },
  { code: '300006', name: '集中交易室' },
  { code: '300007', name: '产品管理部' },
  { code: '300009', name: '风险管理部' },
  { code: '300010', name: '信用评审部' },
  { code: '300011', name: '法律合规部' },
  { code: '300012', name: '运营管理部' },
  { code: '300013', name: '金融科技部' },
  { code: '300014', name: '资金财务部' },
  { code: '300015', name: '综合管理部' },
  { code: '300016', name: '党委组织部' },
  { code: '300017', name: '审计部' },
  { code: '300018', name: '科技专家' },
  { code: '300019', name: '风险专家' },
  { code: '300022', name: '首席投资官' },
  { code: '300023', name: '多资产配置部' },
  { code: '300025', name: '战略客户部' },
  { code: '300026', name: '渠道拓展部' },
  { code: '300027', name: '纪委办公室' },
];

function getDepartmentCode(name) {
  const found = DEPARTMENTS.find(d => d.name === name);
  return found ? found.code : '';
}

function isValidDepartment(name) {
  return DEPARTMENTS.some(d => d.name === name);
}

// ====== Config loader ======
function loadConfig() {
  try {
    const createConfig = require('uni-config-center');
    const configCenter = createConfig({ pluginId: 'wevisitor' });
    return configCenter.config();
  } catch (e) {
    console.error('[wevisitor-shared] loadConfig error:', e.message);
    return {};
  }
}

// ====== Date formatter ======
function fmtDateTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ====== OpenID resolver ======
function resolveOpenid(context, event) {
  let openid = '';
  try {
    const wx = uniCloud.getWXContext && uniCloud.getWXContext();
    openid = (wx && wx.OPENID) || '';
  } catch (e) {}
  if (!openid) openid = (context && context.uid) || (event && event.uid) || '';
  return openid;
}

// ====== Admin checker ======
async function requireAdmin(db, openid) {
  if (!openid) return null;
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
  const u = res.data && res.data[0];
  return u && u.role === 'admin' ? u : null;
}

// ====== Clone & normalize event ======
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
  if (hasAction && (hasMethod || hasFn)) {
    const drop = ['action', 'method', 'functionName', 'data', 'params', 'body', 'queryStringParameters', 'headers', 'requestContext', 'httpMethod', 'path', 'source', 'resource'];
    const rest = {};
    for (const k of Object.keys(ev)) {
      if (drop.indexOf(k) >= 0) continue;
      rest[k] = ev[k];
    }
    const meta = { action: ev.action, method: ev.method, functionName: ev.functionName };
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

// ====== WeChat access token ======
// appid 从 config.json 读取，secret 从环境变量 WX_SECRET 读取（不放配置文件）
async function getAccessToken(config) {
  const wx = config.wx || {};
  const appid = String(wx.appid || '').trim();
  const secret = String(process.env.WX_SECRET || '').trim();
  if (!appid || !secret) {
    const missing = [];
    if (!appid) missing.push('wx.appid (config.json)');
    if (!secret) missing.push('WX_SECRET (环境变量)');
    console.error('[shared] getAccessToken: missing ' + missing.join(', '));
    return '';
  }
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
    const uniCloudAny = typeof uniCloud !== 'undefined' ? uniCloud : null;
    if (uniCloudAny && uniCloudAny.httpclient && typeof uniCloudAny.httpclient.request === 'function') {
      const resp = await uniCloudAny.httpclient.request(url, { method: 'GET', dataType: 'json', timeout: 10000 });
      const data = (resp && (resp.data || resp.result)) || resp || {};
      return String(data.access_token || '');
    }
    if (typeof fetch === 'function') {
      const resp = await fetch(url, { method: 'GET' });
      const data = await resp.json().catch(() => ({}));
      return String(data.access_token || '');
    }
  } catch (e) {
    console.error('[shared] getAccessToken error:', e);
  }
  return '';
}

// ====== Send subscribe message ======
async function sendSubscribeMsg(openid, tplData, page, tmplId, config) {
  const token = await getAccessToken(config);
  if (!token) return;
  if (!tmplId) {
    console.error('[shared] sendSubscribeMsg: missing template ID');
    return;
  }
  const state = process.env.MINIPROGRAM_STATE || 'trial';
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`;
  const body = {
    touser: openid,
    template_id: tmplId,
    page: page || 'pages/visits/index',
    miniprogram_state: state,
    lang: 'zh_CN',
    data: tplData,
  };
  try {
    const uniCloudAny = typeof uniCloud !== 'undefined' ? uniCloud : null;
    let result = null;
    if (uniCloudAny && uniCloudAny.httpclient && typeof uniCloudAny.httpclient.request === 'function') {
      const resp = await uniCloudAny.httpclient.request(url, {
        method: 'POST',
        data: body,
        contentType: 'json',
        dataType: 'json',
        timeout: 10000,
      });
      result = (resp && (resp.data || resp.result)) || resp || {};
    } else if (typeof fetch === 'function') {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      result = await resp.json().catch(() => ({}));
    }
    if (result && result.errcode && result.errcode !== 0) {
      console.error('[shared] subscribe msg failed:', result.errcode, result.errmsg);
    } else {
      console.log('[shared] subscribe msg sent OK, openid:', String(openid).slice(0, 10) + '...');
    }
  } catch (e) {
    console.error('[shared] sendSubscribeMsg error:', e);
  }
}

module.exports = {
  DEPARTMENTS,
  getDepartmentCode,
  isValidDepartment,
  loadConfig,
  fmtDateTime,
  resolveOpenid,
  requireAdmin,
  cloneAny,
  normalizeEvent,
  getAccessToken,
  sendSubscribeMsg,
};
