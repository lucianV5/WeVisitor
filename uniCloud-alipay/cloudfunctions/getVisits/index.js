'use strict';

const fmtDateTime = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const parseVisitMs = (s) => {
  if (!s || typeof s !== 'string') return NaN;
  let str = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) str += ' 23:59';
  return new Date(str.replace(/-/g, '/')).getTime();
};

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

const businessMain = async (event, context) => {
  const db = uniCloud.database();
  const cmd = db.command;
  const visitsCol = db.collection('visits');

  let openid = '';
  try {
    const wx = uniCloud.getWXContext && uniCloud.getWXContext();
    openid = (wx && wx.OPENID) || '';
  } catch (e) {}
  if (!openid) openid = (context && context.uid) || (event && event.uid) || '';

  const { status = '', keyword = '', role = 'visitor', userId = '' } = event || {};

  try {
    const effectiveRole = (role || 'visitor').toLowerCase();
    const statusValid = status && ['pending', 'approved', 'completed', 'rejected'].indexOf(status) >= 0;
    const baseWhere = {};
    if (statusValid) baseWhere.status = status;

    let where = baseWhere;
    if (effectiveRole === 'visitor') {
      where._openid = openid || '__none__';
    } else if (effectiveRole !== 'admin') {
      const hostIds = [];
      if (userId) hostIds.push(userId);
      if (openid) hostIds.push(openid);
      let nickname = '';
      try {
        const uRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
        const u = uRes.data && uRes.data[0];
        if (u) {
          nickname = u.nickname || '';
          if (u.phone) {
            const iRes = await db.collection('insiders').where({ phone: u.phone }).limit(20).get();
            (iRes.data || []).forEach(i => {
              if (i._id && hostIds.indexOf(i._id) < 0) hostIds.push(i._id);
            });
          }
        }
      } catch (e) {
        console.error('[getVisits] resolve insider identity error:', e);
      }
      try {
        if (openid) {
          const oRes = await db.collection('insiders').where({ _openid: openid }).limit(20).get();
          (oRes.data || []).forEach(i => {
            if (i._id && hostIds.indexOf(i._id) < 0) hostIds.push(i._id);
          });
        }
        if (nickname) {
          const nRes = await db.collection('insiders').where({ name: nickname }).limit(20).get();
          (nRes.data || []).forEach(i => {
            if (i._id && hostIds.indexOf(i._id) < 0) hostIds.push(i._id);
          });
        }
      } catch (e) {
        console.error('[getVisits] resolve insider identity error:', e);
      }
      const orConds = [];
      if (hostIds.length) orConds.push({ hostId: cmd.in(hostIds) });
      if (nickname) orConds.push({ hostName: nickname });
      where = orConds.length
        ? cmd.and([baseWhere, cmd.or(orConds)])
        : Object.assign({}, baseWhere, { hostId: '__none__' });
      console.log('[getVisits] insider match info:', JSON.stringify({
        openid,
        userId,
        nickname,
        hostIds,
        hasHostIdCond: hostIds.length > 0,
        hasHostNameCond: !!nickname,
      }));
    }

    let list = [];
    const query = visitsCol.where(where).orderBy('createTime', 'desc').limit(500);
    const res = await query.get();
    list = res.data || [];
    console.log('[getVisits] role=' + effectiveRole + ' status=' + (status || 'all') + ' result count=' + list.length);

    const nowMs = Date.now();
    const expired = list.filter(v =>
      v.status === 'approved' &&
      !isNaN(parseVisitMs(v.visitDate)) &&
      parseVisitMs(v.visitDate) <= nowMs
    );
    if (expired.length) {
      const patch = { status: 'completed', updateTime: fmtDateTime() };
      for (const v of expired) {
        try {
          await visitsCol.doc(v._id).update(patch);
          v.status = 'completed';
        } catch (e) {
          console.error('[getVisits] auto complete error:', e);
        }
      }
    }

    if (keyword) {
      const kw = String(keyword).toLowerCase();
      list = list.filter(v =>
        (v.visitorName || '').toLowerCase().indexOf(kw) >= 0 ||
        (v.visitorPhone || '').indexOf(kw) >= 0 ||
        (v.hostName || '').toLowerCase().indexOf(kw) >= 0 ||
        (v.purpose || '').toLowerCase().indexOf(kw) >= 0
      );
    }

    return { code: 0, msg: 'ok', data: list };
  } catch (err) {
    console.error('[getVisits] error:', err);
    return { code: 500, data: [], msg: `查询失败：${err.message || err}` };
  }
};

exports.main = async (event, context) => {
  const normalized = normalizeEvent(event);
  try {
    const result = await businessMain(normalized, context);
    if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'result') &&
        !Object.prototype.hasOwnProperty.call(result, 'data') && !Object.prototype.hasOwnProperty.call(result, 'code')) {
      return result.result;
    }
    return result;
  } catch (err) {
    const msg = (err && (err.message || err.msg || err.errMsg)) || String(err || 'FUNCTION_ERROR');
    console.error('[getVisits] main error:', msg, err && err.stack ? err.stack : err);
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: [] };
  }
};
