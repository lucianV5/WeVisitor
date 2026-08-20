'use strict';

const STATUSES = ['pending', 'approved', 'completed', 'rejected'];

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

  const { visitId = '', newStatus = '', rejectReason = '', action = '', signTime = '' } = event || {};

  if (!visitId) return { code: 400, data: null, msg: '缺少 visitId' };
  if (!newStatus || STATUSES.indexOf(newStatus) < 0) {
    return { code: 400, data: null, msg: 'newStatus 参数非法' };
  }

  try {
    const res = await visitsCol.doc(visitId).get();
    if (!res.data || res.data.length === 0) {
      return { code: 404, data: null, msg: '预约记录不存在' };
    }
    const visit = res.data[0];

    const patch = {
      status: newStatus,
      updateTime: fmtDateTime(),
    };

    if (newStatus === 'rejected' && rejectReason) {
      patch.rejectReason = rejectReason;
    }

    if (action === 'signIn') {
      patch.signInTime = signTime || patch.updateTime;
    } else if (action === 'signOut') {
      patch.signOutTime = signTime || patch.updateTime;
    }

    await visitsCol.doc(visitId).update(patch);

    if ((newStatus === 'approved' || newStatus === 'rejected') && visit._openid && visit._openid !== openid) {
      try {
        const dateText = visit.visitDate || '';
        const note = newStatus === 'approved'
          ? { type: 'visit_approved', title: '预约已通过', content: `您${dateText}的访客预约已通过审批，请按时到访。` }
          : { type: 'visit_rejected', title: '预约已被拒绝', content: `您${dateText}的访客预约未通过审批${rejectReason ? '，原因：' + rejectReason : ''}。` };
        await db.collection('notifications').add({
          _openid: visit._openid,
          type: note.type,
          title: note.title,
          content: note.content,
          relatedId: visitId,
          read: false,
          createTime: fmtDateTime(),
        });
      } catch (e) {
        console.error('[updateVisitStatus] add notification error:', e);
      }
    }

    return { code: 0, msg: '更新成功', data: { _id: visitId, ...patch } };
  } catch (err) {
    console.error('[updateVisitStatus] error:', err);
    return { code: 500, data: null, msg: `更新失败：${err.message || err}` };
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
    console.error('[updateVisitStatus] main error:', msg, err && err.stack ? err.stack : err);
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
};
