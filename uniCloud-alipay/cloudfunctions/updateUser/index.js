'use strict';

const DEPTS = [
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

  const { nickname, avatar, phone, department, role } = event || {};

  const patch = {};
  if (typeof nickname === 'string') patch.nickname = nickname;
  if (typeof avatar === 'string') patch.avatar = avatar;
  if (typeof phone === 'string') patch.phone = phone;
  if (typeof department === 'string') {
    patch.department = department;
    const deptEntry = DEPTS.find(d => d.name === department);
    if (deptEntry) patch.departmentCode = deptEntry.code;
  }
  if (role && ['visitor', 'insider', 'admin'].indexOf(role) >= 0) {
    patch.role = role;
  }
  patch.updateTime = fmtDateTime();

  if (Object.keys(patch).length <= 1) {
    return { code: 0, msg: '没有需要更新的字段', data: null };
  }

  try {
    const usersCol = db.collection('users');
    const findRes = await usersCol.where({ _openid: openid }).limit(1).get();
    if (!findRes.data || findRes.data.length === 0) {
      return { code: 404, data: null, msg: '用户不存在' };
    }
    const user = findRes.data[0];
    await usersCol.doc(user._id).update(patch);
    const updated = Object.assign({}, user, patch);

    try {
      const insidersCol = db.collection('insiders');
      if (typeof phone === 'string' && phone) {
        const byPhone = await insidersCol.where({ phone }).limit(1).get();
        const matched = byPhone.data && byPhone.data[0];
        if (matched && matched._openid !== openid) {
          await insidersCol.doc(matched._id).update({ _openid: openid });
        }
      }
      const linkedRes = await insidersCol.where({ _openid: openid }).limit(1).get();
      const insider = linkedRes.data && linkedRes.data[0];
      if (insider) {
        if (typeof department === 'string' && department && insider.department !== department) {
          const deptEntry = DEPTS.find(d => d.name === department);
          const iPatch = { department };
          if (deptEntry) iPatch.departmentCode = deptEntry.code;
          await insidersCol.doc(insider._id).update(iPatch);
        }
        const uPatch = {};
        if (!department && insider.department) {
          uPatch.department = insider.department;
          if (insider.departmentCode) uPatch.departmentCode = insider.departmentCode;
        }
        if (insider.name && (!updated.nickname || updated.nickname === '微信用户')) {
          uPatch.nickname = insider.name;
        }
        if (insider.role === 'admin' || insider.role === 'insider') {
          if (updated.role !== insider.role) uPatch.role = insider.role;
        }
        if (Object.keys(uPatch).length > 0) {
          await usersCol.doc(updated._id).update(uPatch);
          Object.assign(updated, uPatch);
        }
      }
    } catch (e) {
      console.error('[updateUser] insider sync error:', e);
    }

    return { code: 0, msg: '更新成功', data: updated };
  } catch (err) {
    console.error('[updateUser] error:', err);
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
    console.error('[updateUser] main error:', msg, err && err.stack ? err.stack : err);
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
};
