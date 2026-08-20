'use strict';

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


const fmtDateTime = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const resolveOpenid = (context, event) => {
  let openid = '';
  try {
    const wx = uniCloud.getWXContext && uniCloud.getWXContext();
    openid = (wx && wx.OPENID) || '';
  } catch (e) {}
  if (!openid) openid = (context && context.uid) || (event && event.uid) || '';
  return openid;
};

const requireAdmin = async (db, openid) => {
  if (!openid) return null;
  const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
  const u = res.data && res.data[0];
  return u && u.role === 'admin' ? u : null;
};

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

const businessMain = async (event, context) => {
  const db = uniCloud.database();
  const appsCol = db.collection('insiderApplications');
  const openid = resolveOpenid(context, event);
  const admin = await requireAdmin(db, openid);
  if (!admin) return { code: 403, data: null, msg: '无权限：仅管理员可审批申请' };

  const body = event || {};
  const id = (body.id || '').trim();
  const action = body.action === 'approve' ? 'approve' : body.action === 'reject' ? 'reject' : '';
  if (!id) return { code: 400, data: null, msg: '缺少 id 参数' };
  if (!action) return { code: 400, data: null, msg: 'action 参数必须为 approve 或 reject' };

  const appRes = await appsCol.doc(id).get();
  const app = appRes.data && appRes.data[0];
  if (!app) return { code: 404, data: null, msg: '申请不存在' };
  if (app.status !== 'pending') return { code: 400, data: null, msg: '该申请已处理，请勿重复操作' };

  const notify = async (type, title, content) => {
    try {
      await db.collection('notifications').add({
        _openid: app._openid,
        type,
        title,
        content,
        relatedId: id,
        read: false,
        createTime: fmtDateTime(),
      });
    } catch (e) {
      console.error('[handleInsiderApplication] add notification error:', e);
    }
  };

  if (action === 'reject') {
    await appsCol.doc(id).update({ status: 'rejected', handleTime: fmtDateTime() });
    await notify('insider_rejected', '内部员工申请未通过', '很抱歉，您的内部员工申请未通过审核，如需申请可重新填写提交。');
    return { code: 0, msg: '已拒绝该申请', data: { id, status: 'rejected' } };
  }

  const deptEntry = DEPTS.find(d => d.name === app.department);
  await appsCol.doc(id).update({ status: 'approved', handleTime: fmtDateTime() });
  await db.collection('insiders').add({
    _openid: app._openid,
    name: app.name,
    phone: app.phone,
    department: app.department,
    departmentCode: deptEntry ? deptEntry.code : '',
    role: 'insider',
    createTime: fmtDateTime(),
    extra: { fromApplication: true, approvedBy: openid },
  });

  const uRes = await db.collection('users').where({ _openid: app._openid }).limit(1).get();
  const u = uRes.data && uRes.data[0];
  if (u) {
    const uPatch = {
      role: 'insider',
      department: app.department,
      departmentCode: deptEntry ? deptEntry.code : '',
      updateTime: fmtDateTime(),
    };
    if (!u.nickname || u.nickname === '微信用户') uPatch.nickname = app.name;
    await db.collection('users').doc(u._id).update(uPatch);
  }
  await notify('insider_approved', '内部员工申请已通过', `恭喜，您的内部员工申请已通过审核，所属部门：${app.department}。重新进入小程序即可使用内部员工功能。`);
  return { code: 0, msg: '已通过申请', data: { id, status: 'approved' } };
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
    console.error('[handleInsiderApplication] main error:', msg, err && err.stack ? err.stack : String(err));
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
};
