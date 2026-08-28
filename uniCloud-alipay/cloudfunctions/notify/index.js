'use strict';

const {
  resolveOpenid,
  normalizeEvent,
} = require('wevisitor-shared');

// ====== Action: getMyNotifications ======
async function getMyNotificationsAction(event, context) {
  const db = uniCloud.database();
  let openid = resolveOpenid(context, event);
  if (!openid) {
    const uid = (event && event.uid) || (context && context.uid) || '';
    if (uid) openid = uid;
  }
  if (!openid) return { code: 401, data: null, msg: '未获取到用户身份' };

  const role = (event && event.role) || '';
  const col = db.collection('notifications');
  const where = role
    ? { _openid: openid, targetRole: db.command.in([role, '']) }
    : { _openid: openid };
  const res = await col.where(where).orderBy('createTime', 'desc').limit(100).get();
  const items = res.data || [];
  const unread = items.filter(n => !n.read).length;
  return { code: 0, msg: 'ok', data: { list: items, unread } };
}

// ====== Action: markNotificationsRead ======
async function markNotificationsReadAction(event, context) {
  const db = uniCloud.database();
  let openid = resolveOpenid(context, event);
  if (!openid) {
    const uid = (event && event.uid) || (context && context.uid) || '';
    if (uid) openid = uid;
  }
  if (!openid) return { code: 401, data: null, msg: '未获取到用户身份' };

  const role = (event && event.role) || '';
  const col = db.collection('notifications');
  const where = role
    ? { _openid: openid, read: false, targetRole: db.command.in([role, '']) }
    : { _openid: openid, read: false };
  const res = await col.where(where).limit(100).get();
  const items = res.data || [];
  for (const n of items) {
    try { await col.doc(n._id).update({ read: true }); } catch (e) {}
  }
  return { code: 0, msg: 'ok', data: { marked: items.length } };
}

// ====== Action router ======
const handlers = {
  getMyNotifications: getMyNotificationsAction,
  markNotificationsRead: markNotificationsReadAction,
};

exports.main = async (event, context) => {
  const normalized = normalizeEvent(event);
  const action = normalized.action || '';
  const handler = handlers[action];
  if (!handler) {
    return { code: 400, msg: `[notify] 未知 action: ${action || '(空)'}，支持: ${Object.keys(handlers).join(', ')}`, data: null };
  }
  try {
    const result = await handler(normalized, context);
    if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'result') &&
      !Object.prototype.hasOwnProperty.call(result, 'data') && !Object.prototype.hasOwnProperty.call(result, 'code')) {
      return result.result;
    }
    return result;
  } catch (err) {
    const msg = (err && (err.message || err.msg || err.errMsg)) || String(err || 'FUNCTION_ERROR');
    console.error(`[notify:${action}] error:`, msg, err && err.stack ? err.stack : String(err));
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
};
