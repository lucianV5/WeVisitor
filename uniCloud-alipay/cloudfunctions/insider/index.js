'use strict';

const {
  loadConfig,
  fmtDateTime,
  resolveOpenid,
  requireAdmin,
  normalizeEvent,
  getDepartmentCode,
  isValidDepartment,
  sendSubscribeMsg,
} = require('wevisitor-shared');

const config = loadConfig();
const HOST_TMPL_ID = (config.templates && config.templates.host) || '';

// ====== Action: getInsiders ======
async function getInsidersAction(event, context) {
  const db = uniCloud.database();
  const usersCol = db.collection('users');
  const dbCmd = db.command;

  const { keyword = '', department = '' } = event || {};

  try {
    const where = { role: dbCmd.in(['insider', 'admin']) };
    if (department) where.department = department;

    const page = Math.max(1, parseInt(event.page) || 1);
    const pageSize = Math.min(100, parseInt(event.pageSize) || 20);
    const usePaging = event.page != null || event.pageSize != null;

    let total = 0;
    if (usePaging) {
      const countRes = await usersCol.where(where).count();
      total = (countRes && countRes.total) || 0;
    }
    const query = usersCol.where(where).orderBy('createTime', 'desc');
    const res = usePaging
      ? await query.skip((page - 1) * pageSize).limit(pageSize).get()
      : await query.limit(500).get();
    let list = (res.data || []).map(u => ({
      _id: u._id || '',
      _openid: u._openid || '',
      name: u.name || u.nickname || u.phone || '',
      phone: u.phone || '',
      department: u.department || '',
      role: u.role || 'insider',
      departmentCode: u.departmentCode || '',
      createTime: u.createTime || '',
    }));

    if (keyword) {
      const kw = String(keyword).toLowerCase();
      list = list.filter(i =>
        (i.name || '').toLowerCase().indexOf(kw) >= 0 ||
        (i.phone || '').indexOf(kw) >= 0 ||
        (i.department || '').toLowerCase().indexOf(kw) >= 0
      );
    }

    if (usePaging) {
      return { code: 0, msg: 'ok', data: { list, total, page, pageSize, hasMore: page * pageSize < total } };
    }
    return { code: 0, msg: 'ok', data: list };
  } catch (err) {
    console.error('[insider:getInsiders] error:', err);
    return { code: 500, data: [], msg: `查询失败：${err.message || err}` };
  }
}

// ====== Action: createInsider ======
async function createInsiderAction(event, context) {
  const db = uniCloud.database();
  const usersCol = db.collection('users');
  const openid = resolveOpenid(context, event);

  const userRes = await usersCol.where({ _openid: openid }).limit(1).get();
  const caller = userRes.data && userRes.data[0];
  if (!caller || caller.role !== 'admin') {
    return { code: 403, data: null, msg: '无权限：仅管理员可添加内部人员' };
  }

  const body = event || {};
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const department = body.department || '';
  const role = body.role === 'admin' ? 'admin' : 'insider';

  if (!name) return { code: 400, data: null, msg: '姓名必填' };
  if (!phone) return { code: 400, data: null, msg: '手机号必填' };
  if (!department) return { code: 400, data: null, msg: '部门必填' };
  if (!isValidDepartment(department)) return { code: 400, data: null, msg: '部门选项不合法' };

  const existRes = await usersCol.where({ name, phone }).limit(1).get();
  if (existRes.data && existRes.data.length > 0) {
    const existUser = existRes.data[0];
    if (existUser.role === 'insider' || existUser.role === 'admin') {
      return { code: 400, data: null, msg: '该员工已存在' };
    }
    await usersCol.doc(existUser._id).update({
      role,
      department,
      departmentCode: getDepartmentCode(department),
      name,
      phone,
      updateTime: fmtDateTime(),
    });
    return { code: 0, msg: '创建成功', data: { ...existUser, role, department, name, phone } };
  }

  try {
    const doc = {
      _openid: '',
      nickname: '',
      name,
      avatar: '',
      phone,
      role,
      department,
      departmentCode: getDepartmentCode(department),
      createTime: fmtDateTime(),
      updateTime: fmtDateTime(),
      extra: { adminCreate: true },
    };
    const addRes = await usersCol.add(doc);
    doc._id = (addRes && addRes.id) || '';
    return { code: 0, msg: '创建成功', data: doc };
  } catch (err) {
    console.error('[insider:createInsider] error:', err);
    return { code: 500, data: null, msg: `创建失败：${err.message || err}` };
  }
}

// ====== Action: updateInsider ======
async function updateInsiderAction(event, context) {
  const db = uniCloud.database();
  const usersCol = db.collection('users');
  const openid = resolveOpenid(context, event);

  const userRes = await usersCol.where({ _openid: openid }).limit(1).get();
  const caller = userRes.data && userRes.data[0];
  if (!caller || caller.role !== 'admin') {
    return { code: 403, data: null, msg: '无权限：仅管理员可修改内部人员' };
  }

  const body = event || {};
  const _id = (body._id || body.id || '').trim();
  const name = typeof body.name === 'string' ? body.name.trim() : null;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : null;
  const department = typeof body.department === 'string' ? body.department.trim() : null;
  const role = typeof body.role === 'string' ? body.role : null;

  if (!_id) return { code: 400, data: null, msg: '缺少 _id 参数' };
  if (role !== null && ['admin', 'insider'].indexOf(role) < 0) {
    return { code: 400, data: null, msg: 'role 参数不合法' };
  }
  if (department && !isValidDepartment(department)) return { code: 400, data: null, msg: '部门选项不合法' };

  const patch = {};
  if (name !== null) patch.name = name;
  if (phone !== null) patch.phone = phone;
  if (department !== null) {
    patch.department = department;
    patch.departmentCode = getDepartmentCode(department);
  }
  if (role !== null) patch.role = role;
  if (Object.keys(patch).length === 0) {
    return { code: 0, msg: '没有需要更新的字段', data: null };
  }

  try {
    const res = await usersCol.doc(_id).get();
    if (!res.data || res.data.length === 0) {
      return { code: 404, data: null, msg: '记录不存在' };
    }
    await usersCol.doc(_id).update(patch);
    return { code: 0, msg: '更新成功', data: { _id, ...patch } };
  } catch (err) {
    console.error('[insider:updateInsider] error:', err);
    return { code: 500, data: null, msg: `更新失败：${err.message || err}` };
  }
}

// ====== Action: deleteInsider ======
async function deleteInsiderAction(event, context) {
  const db = uniCloud.database();
  const usersCol = db.collection('users');
  const openid = resolveOpenid(context, event);

  const userRes = await usersCol.where({ _openid: openid }).limit(1).get();
  const caller = userRes.data && userRes.data[0];
  if (!caller || caller.role !== 'admin') {
    return { code: 403, data: null, msg: '无权限：仅管理员可删除内部人员' };
  }

  const body = event || {};
  const id = (body.id || body._id || '').trim();
  if (!id) return { code: 400, data: null, msg: '缺少 id 参数' };

  try {
    const targetRes = await usersCol.doc(id).get();
    const target = targetRes.data && targetRes.data[0];
    if (!target) return { code: 404, data: null, msg: '记录不存在' };
    if (target.role === 'admin') return { code: 400, data: null, msg: '不能删除管理员账户' };
    const targetOpenid = target._openid || '';
    await usersCol.doc(id).remove();
    if (targetOpenid) {
      try {
        const appsCol = db.collection('insiderApplications');
        const dbCmd = db.command;
        await appsCol.where({ _openid: targetOpenid, status: 'approved' }).update({ status: 'deleted', handleTime: fmtDateTime() });
      } catch (e) {
        console.error('[insider:deleteInsider] update applications error:', e);
      }
    }
    return { code: 0, msg: '删除成功', data: { id } };
  } catch (err) {
    console.error('[insider:deleteInsider] error:', err);
    return { code: 500, data: null, msg: `删除失败：${err.message || err}` };
  }
}

// ====== Action: applyInsider ======
async function applyInsiderAction(event, context) {
  const db = uniCloud.database();
  const appsCol = db.collection('insiderApplications');
  const openid = resolveOpenid(context, event);
  if (!openid) return { code: 401, data: null, msg: '未获取到用户身份' };

  const body = event || {};
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const department = body.department || '';
  if (!name) return { code: 400, data: null, msg: '姓名必填' };
  if (!phone) return { code: 400, data: null, msg: '手机号必填' };
  if (!department) return { code: 400, data: null, msg: '部门必填' };
  if (!isValidDepartment(department)) return { code: 400, data: null, msg: '部门选项不合法' };

  const linked = await db.collection('users').where({ _openid: openid, role: db.command.in(['insider', 'admin']) }).limit(1).get();
  if (linked.data && linked.data.length > 0) {
    return { code: 400, data: null, msg: '您已是内部员工，无需重复申请' };
  }
  const pend = await appsCol.where({ _openid: openid, status: 'pending' }).limit(1).get();
  if (pend.data && pend.data.length > 0) {
    return { code: 400, data: null, msg: '您已有申请正在审核中，请等待管理员处理' };
  }

  let nickname = '';
  const uRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
  const u = uRes.data && uRes.data[0];
  if (u) nickname = u.nickname || '';

  const doc = {
    _openid: openid,
    nickname,
    name,
    phone,
    department,
    departmentCode: getDepartmentCode(department),
    status: 'pending',
    createTime: fmtDateTime(),
    handleTime: '',
  };
  const delRes = await appsCol.where({ _openid: openid, status: 'deleted' }).orderBy('createTime', 'desc').limit(1).get();
  if (delRes.data && delRes.data.length > 0) {
    const oldDoc = delRes.data[0];
    await appsCol.doc(oldDoc._id).update(doc);
    doc._id = oldDoc._id;
  } else {
    const addRes = await appsCol.add(doc);
    doc._id = (addRes && addRes.id) || '';
  }

  // Notify all admins
  try {
    const adminRes = await db.collection('users').where({ role: 'admin' }).limit(50).get();
    const admins = adminRes.data || [];
    const tplData = {
      name1: { value: String(name || '申请人').slice(0, 20) },
      date2: { value: String(fmtDateTime()).slice(0, 20) },
      phone_number9: { value: String(phone || '').slice(0, 20) },
      thing4: { value: String('申请部门：' + department).slice(0, 20) },
    };
    for (const admin of admins) {
      const adminOpenid = admin._openid;
      if (adminOpenid) {
        await sendSubscribeMsg(adminOpenid, tplData, 'pages/insider-approve/index', HOST_TMPL_ID, config);
        await db.collection('notifications').add({
          _openid: adminOpenid,
          targetRole: 'admin',
          type: 'new_visit',
          title: '新的员工申请',
          content: `${name} 申请成为内部员工，部门：${department}，请及时审核。`,
          relatedId: doc._id,
          read: false,
          createTime: fmtDateTime(),
        });
      }
    }
  } catch (e) {
    console.error('[insider:applyInsider] notify admins error:', e);
  }

  return { code: 0, msg: '申请已提交，请等待管理员审核', data: doc };
}

// ====== Action: getMyInsiderApplication ======
async function getMyInsiderApplicationAction(event, context) {
  const db = uniCloud.database();
  const openid = resolveOpenid(context, event);
  if (!openid) return { code: 401, data: null, msg: '未获取到用户身份' };

  const res = await db.collection('insiderApplications').where({ _openid: openid }).orderBy('createTime', 'desc').limit(1).get();
  const app = res.data && res.data[0];
  return { code: 0, msg: 'ok', data: app || null };
}

// ====== Action: getInsiderApplications ======
async function getInsiderApplicationsAction(event, context) {
  const db = uniCloud.database();
  const openid = resolveOpenid(context, event);
  const admin = await requireAdmin(db, openid);
  if (!admin) return { code: 403, data: null, msg: '无权限：仅管理员可查看申请' };

  const body = event || {};
  const status = body.status || '';
  const where = {};
  if (status && ['pending', 'approved', 'rejected'].indexOf(status) >= 0) where.status = status;

  const page = Math.max(1, parseInt(body.page) || 1);
  const pageSize = Math.min(100, parseInt(body.pageSize) || 20);
  const usePaging = body.page != null || body.pageSize != null;

  const col = db.collection('insiderApplications');
  if (usePaging) {
    const countRes = await col.where(where).count();
    const total = (countRes && countRes.total) || 0;
    const res = await col.where(where).orderBy('createTime', 'desc').skip((page - 1) * pageSize).limit(pageSize).get();
    return { code: 0, msg: 'ok', data: { list: res.data || [], total, page, pageSize, hasMore: page * pageSize < total } };
  }
  const res = await col.where(where).orderBy('createTime', 'desc').limit(200).get();
  return { code: 0, msg: 'ok', data: res.data || [] };
}

// ====== Action: handleInsiderApplication ======
async function handleInsiderApplicationAction(event, context) {
  const db = uniCloud.database();
  const appsCol = db.collection('insiderApplications');
  const openid = resolveOpenid(context, event);
  const admin = await requireAdmin(db, openid);
  if (!admin) return { code: 403, data: null, msg: '无权限：仅管理员可审批申请' };

  const body = event || {};
  const id = (body.id || '').trim();
  const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : '';
  if (!id) return { code: 400, data: null, msg: '缺少 id 参数' };
  if (!decision) return { code: 400, data: null, msg: 'decision 参数必须为 approve 或 reject' };

  const appRes = await appsCol.doc(id).get();
  const app = appRes.data && appRes.data[0];
  if (!app) return { code: 404, data: null, msg: '申请不存在' };
  if (app.status !== 'pending') return { code: 400, data: null, msg: '该申请已处理，请勿重复操作' };

  const notify = async (type, title, content) => {
    try {
      await db.collection('notifications').add({
        _openid: app._openid,
        targetRole: '',
        type,
        title,
        content,
        relatedId: id,
        read: false,
        createTime: fmtDateTime(),
      });
    } catch (e) {
      console.error('[insider:handleInsiderApplication] add notification error:', e);
    }
  };

  if (decision === 'reject') {
    await appsCol.doc(id).update({ status: 'rejected', handleTime: fmtDateTime() });
    await notify('insider_rejected', '内部员工申请未通过', '很抱歉，您的内部员工申请未通过审核，如需申请可重新填写提交。');
    return { code: 0, msg: '已拒绝该申请', data: { id, status: 'rejected' } };
  }

  const deptCode = getDepartmentCode(app.department);
  await appsCol.doc(id).update({ status: 'approved', handleTime: fmtDateTime() });

  const uRes = await db.collection('users').where({ _openid: app._openid }).limit(1).get();
  const u = uRes.data && uRes.data[0];
  if (u) {
    const uPatch = {
      role: 'insider',
      department: app.department,
      departmentCode: deptCode || '',
      name: app.name,
      phone: app.phone,
      updateTime: fmtDateTime(),
    };
    await db.collection('users').doc(u._id).update(uPatch);
  } else {
    await db.collection('users').add({
      _openid: app._openid,
      nickname: app.nickname || '',
      name: app.name,
      phone: app.phone,
      avatar: '',
      role: 'insider',
      department: app.department,
      departmentCode: deptCode || '',
      createTime: fmtDateTime(),
      updateTime: fmtDateTime(),
      extra: { fromApplication: true, approvedBy: openid },
    });
  }
  await notify('insider_approved', '内部员工申请已通过', `恭喜，您的内部员工申请已通过审核，所属部门：${app.department}。重新进入小程序即可使用内部员工功能。`);
  return { code: 0, msg: '已通过申请', data: { id, status: 'approved' } };
}

// ====== Action router ======
const handlers = {
  getInsiders: getInsidersAction,
  createInsider: createInsiderAction,
  updateInsider: updateInsiderAction,
  deleteInsider: deleteInsiderAction,
  applyInsider: applyInsiderAction,
  getMyInsiderApplication: getMyInsiderApplicationAction,
  getInsiderApplications: getInsiderApplicationsAction,
  handleInsiderApplication: handleInsiderApplicationAction,
};

exports.main = async (event, context) => {
  const normalized = normalizeEvent(event);
  const action = normalized.action || '';
  const handler = handlers[action];
  if (!handler) {
    return { code: 400, msg: `[insider] 未知 action: ${action || '(空)'}，支持: ${Object.keys(handlers).join(', ')}`, data: null };
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
    console.error(`[insider:${action}] error:`, msg, err && err.stack ? err.stack : String(err));
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
};
