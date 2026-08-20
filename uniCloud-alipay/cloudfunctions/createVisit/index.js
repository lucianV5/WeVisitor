'use strict';

const genQR = (prefix, id) => `${prefix || 'visit'}_${id || Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const fmtDateTime = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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
  const visitsCol = db.collection('visits');

  let openid = '';
  try {
    const wx = uniCloud.getWXContext && uniCloud.getWXContext();
    openid = (wx && wx.OPENID) || '';
  } catch (e) {}
  if (!openid) openid = (context && context.uid) || (event && event.uid) || '';

  const body = event || {};
  const visitorName = (body.visitorName || '').trim();
  const visitorPhone = (body.visitorPhone || '').trim();
  const visitorCount = Number(body.visitorCount) || 1;
  const hostId = (body.hostId || '').trim();
  const hostName = (body.hostName || '').trim();
  const hostDepartment = (body.hostDepartment || '').trim();
  const visitDate = (body.visitDate || '').trim();
  const purpose = (body.purpose || '').trim();
  const remark = (body.remark || '').trim();
  const status = (['pending', 'approved', 'completed', 'rejected'].indexOf(body.status) >= 0) ? body.status : 'pending';
  const signInTime = body.signInTime || '';
  const signOutTime = body.signOutTime || '';
  const rejectReason = body.rejectReason || '';

  if (!visitorName) return { code: 400, data: null, msg: '访客姓名必填' };
  if (!visitorPhone) return { code: 400, data: null, msg: '访客手机号必填' };
  if (!hostId || !hostName) return { code: 400, data: null, msg: '接待人必选' };
  if (!visitDate) return { code: 400, data: null, msg: '来访日期必选' };
  if (!purpose) return { code: 400, data: null, msg: '来访事由必填' };

  try {
    const doc = {
      _openid: openid || '',
      visitorName,
      visitorPhone,
      visitorCount,
      hostId,
      hostName,
      hostDepartment,
      visitDate,
      purpose,
      remark,
      status,
      qrCode: '',
      rejectReason,
      signInTime,
      signOutTime,
      createTime: fmtDateTime(),
      updateTime: fmtDateTime(),
      extra: {},
    };
    const addRes = await visitsCol.add(doc);
    const _id = (addRes && addRes.id) || '';
    doc.qrCode = genQR('visit', _id);
    if (_id) {
      await visitsCol.doc(_id).update({ qrCode: doc.qrCode });
    }
    doc._id = _id;
    return { code: 0, msg: '创建成功', data: doc };
  } catch (err) {
    console.error('[createVisit] error:', err);
    return { code: 500, data: null, msg: `创建失败：${err.message || err}` };
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
    console.error('[createVisit] main error:', msg, err && err.stack ? err.stack : err);
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
};
