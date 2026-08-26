'use strict';

const {
  loadConfig,
  fmtDateTime,
  resolveOpenid,
  normalizeEvent,
  sendSubscribeMsg,
} = require('wevisitor-shared');

const config = loadConfig();
const HOST_TMPL_ID = (config.templates && config.templates.host) || '';
const APPLICANT_TMPL_ID = (config.templates && config.templates.applicant) || '';

const STATUSES = ['pending', 'approved', 'completed', 'rejected'];

const genQR = (prefix, id) => `${prefix || 'visit'}_${id || Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const parseVisitMs = (s) => {
  if (!s || typeof s !== 'string') return NaN;
  let str = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) str += ' 23:59';
  return new Date(str.replace(/-/g, '/')).getTime();
};

// ====== Action: getVisits ======
async function getVisitsAction(event, context) {
  const db = uniCloud.database();
  const cmd = db.command;
  const visitsCol = db.collection('visits');
  let openid = resolveOpenid(context, event);

  const { status = '', keyword = '', role = 'visitor', userId = '' } = event || {};

  // resolveOpenid 回退：优先用 uid（前端传的 _openid），其次通过 userId 查 users 表
  if (!openid) {
    const uid = (event && event.uid) || (context && context.uid) || '';
    if (uid) openid = uid;
  }
  if (!openid && userId) {
    try {
      const uRes = await db.collection('users').doc(userId).get();
      const u = uRes.data && uRes.data[0];
      if (u && u._openid) openid = u._openid;
    } catch (e) {
      console.error('[visit:getVisits] fallback openid lookup error:', e);
    }
  }

  try {
    const effectiveRole = (role || 'visitor').toLowerCase();
    const statusValid = status && STATUSES.indexOf(status) >= 0;
    const baseWhere = {};
    if (statusValid) baseWhere.status = status;

    let where = baseWhere;
    if (effectiveRole === 'visitor') {
      if (openid) {
        where._openid = openid;
      } else {
        where._openid = '__none__';
      }
    } else if (effectiveRole !== 'admin') {
      // insider: match by hostId or hostName
      const hostIds = [];
      if (userId) hostIds.push(userId);
      if (openid) hostIds.push(openid);
      let hostNameForMatch = '';
      try {
        const uRes = await db.collection('users').where({ _openid: openid }).limit(1).get();
        const u = uRes.data && uRes.data[0];
        if (u) {
          hostNameForMatch = u.name || u.nickname || '';
          if (u.name) {
            const nRes = await db.collection('users').where({ name: u.name, role: cmd.in(['insider', 'admin']) }).limit(20).get();
            (nRes.data || []).forEach(i => {
              if (i._id && hostIds.indexOf(i._id) < 0) hostIds.push(i._id);
            });
          }
        }
      } catch (e) {
        console.error('[visit:getVisits] resolve insider identity error:', e);
      }
      const orConds = [];
      if (hostIds.length) orConds.push({ hostId: cmd.in(hostIds) });
      if (hostNameForMatch) orConds.push({ hostName: hostNameForMatch });
      where = orConds.length
        ? cmd.and([baseWhere, cmd.or(orConds)])
        : Object.assign({}, baseWhere, { hostId: '__none__' });
    }

    let list = [];
    const page = Math.max(1, parseInt(event.page) || 1);
    const pageSize = Math.min(100, parseInt(event.pageSize) || 20);
    const usePaging = event.page != null || event.pageSize != null;

    let total = 0;
    if (usePaging) {
      const countRes = await visitsCol.where(where).count();
      total = (countRes && countRes.total) || 0;
      const res = await visitsCol.where(where).orderBy('createTime', 'desc').skip((page - 1) * pageSize).limit(pageSize).get();
      list = res.data || [];
    } else {
      const query = visitsCol.where(where).orderBy('createTime', 'desc').limit(500);
      const res = await query.get();
      list = res.data || [];
    }

    // Auto-complete expired approved visits
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
          console.error('[visit:getVisits] auto complete error:', e);
        }
      }
    }

    // Auto-expire pending visits whose visit time has passed
    const expiredPending = list.filter(v =>
      v.status === 'pending' &&
      !isNaN(parseVisitMs(v.visitDate)) &&
      parseVisitMs(v.visitDate) <= nowMs
    );
    if (expiredPending.length) {
      console.log('[visit:getVisits] expiredPending count:', expiredPending.length, 'ids:', expiredPending.map(v => v._id).join(','));
      for (const v of expiredPending) {
        console.log('[visit:getVisits] expiring visit:', v._id, '_openid:', v._openid ? v._openid.slice(0, 8) + '...' : 'EMPTY', 'visitDate:', v.visitDate, 'visitorName:', v.visitorName);
        try {
          const expirePatch = {
            status: 'rejected',
            rejectReason: '来访时间已过期，请重新申请',
            updateTime: fmtDateTime(),
          };
          await visitsCol.doc(v._id).update(expirePatch);
          v.status = 'rejected';
          v.rejectReason = '来访时间已过期，请重新申请';

          // Notify applicant
          if (v._openid) {
            try {
              await db.collection('notifications').add({
                _openid: v._openid,
                type: 'visit_expired',
                title: '预约已过期',
                content: `您${v.visitDate || ''}的访客预约因来访时间已过被自动取消，请重新申请。`,
                relatedId: v._id,
                read: false,
                createTime: fmtDateTime(),
              });
              const applicantTpl = {
                name1: { value: String(v.visitorName || '访客').slice(0, 20) },
                date8: { value: String(v.visitDate || v.createTime || fmtDateTime()).slice(0, 20) },
                thing10: { value: '未通过' },
                thing6: { value: '来访时间已过被自动取消，请重新申请'.slice(0, 20) },
              };
              await sendSubscribeMsg(v._openid, applicantTpl, `pages/visit-detail/index?id=${v._id}`, APPLICANT_TMPL_ID, config);
            } catch (e) {
              console.error('[visit:getVisits] notify applicant expired error:', e);
            }
          }

          // Notify host (station message only, no WeChat push)
          let hostOpenid = '';
          try {
            if (v.hostId) {
              const hostRes = await db.collection('users').doc(v.hostId).get();
              hostOpenid = (hostRes.data && hostRes.data[0] && hostRes.data[0]._openid) || '';
            }
          } catch (e) {}
          if (hostOpenid) {
            try {
              await db.collection('notifications').add({
                _openid: hostOpenid,
                type: 'visit_expired',
                title: '访客预约已过期',
                content: `${v.visitorName || '访客'}的预约（${v.visitDate || ''}）因来访时间已过自动取消。`,
                relatedId: v._id,
                read: false,
                createTime: fmtDateTime(),
              });
            } catch (e) {
              console.error('[visit:getVisits] notify host expired error:', e);
            }
          }
        } catch (e) {
          console.error('[visit:getVisits] auto expire error:', e);
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

    // Enrich visitorName with real name from users table
    const visitorPhones = [...new Set(list.map(v => v.visitorPhone).filter(Boolean))];
    if (visitorPhones.length) {
      try {
        const userRes = await db.collection('users').where({ phone: db.command.in(visitorPhones) }).limit(100).get();
        const phoneToName = {};
        for (const u of (userRes.data || [])) {
          if (u.phone && u.name) phoneToName[u.phone] = u.name;
        }
        list = list.map(v => {
          const realName = v.visitorPhone ? (phoneToName[v.visitorPhone] || '') : '';
          return realName ? { ...v, visitorName: realName } : v;
        });
      } catch (e) {
        console.error('[visit:getVisits] enrich visitorName error:', e);
      }
    }

    if (usePaging) {
      return { code: 0, msg: 'ok', data: { list, total, page, pageSize, hasMore: page * pageSize < total } };
    }
    return { code: 0, msg: 'ok', data: list };
  } catch (err) {
    console.error('[visit:getVisits] error:', err);
    return { code: 500, data: [], msg: `查询失败：${err.message || err}` };
  }
}

// ====== Action: createVisit ======
async function createVisitAction(event, context) {
  const db = uniCloud.database();
  const visitsCol = db.collection('visits');
  let openid = resolveOpenid(context, event);
  if (!openid) {
    const uid = (event && event.uid) || (context && context.uid) || '';
    if (uid) openid = uid;
  }

  const body = event || {};
  console.log('[visit:createVisit] event keys:', Object.keys(body).join(','), 'submitterRole:', body.submitterRole, 'hostId:', body.hostId, 'visitorName:', body.visitorName);
  const visitorName = (body.visitorName || '').trim();
  const visitorPhone = (body.visitorPhone || '').trim();
  const visitorCount = Number(body.visitorCount) || 1;
  const hostId = (body.hostId || '').trim();
  const hostName = (body.hostName || '').trim();
  const hostDepartment = (body.hostDepartment || '').trim();
  const visitDate = (body.visitDate || '').trim();
  const purpose = (body.purpose || '').trim();
  const remark = (body.remark || '').trim();
  const status = STATUSES.indexOf(body.status) >= 0 ? body.status : 'pending';
  const signInTime = body.signInTime || '';
  const signOutTime = body.signOutTime || '';
  const rejectReason = body.rejectReason || '';
  const submitterRole = (body.submitterRole || '').trim();

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

    // Send notification
    try {
      const tplData = {
        name1: { value: String(visitorName || '访客').slice(0, 20) },
        date2: { value: String(visitDate || fmtDateTime()).slice(0, 20) },
        phone_number9: { value: String(visitorPhone || '').slice(0, 20) },
        thing4: { value: String(purpose || '来访').slice(0, 20) },
      };

      if (submitterRole !== 'insider' && submitterRole !== 'admin') {
        // Visitor submitted -> notify host
        let hostOpenid = '';
        try {
          const hostRes = await db.collection('users').doc(hostId).get();
          hostOpenid = (hostRes.data && hostRes.data[0] && hostRes.data[0]._openid) || '';
          console.log('[visit:createVisit] host lookup: hostId=', hostId, 'hostOpenid=', hostOpenid ? hostOpenid.slice(0, 8) + '...' : 'EMPTY', 'hostRes.data.length=', (hostRes.data || []).length);
        } catch (e) {
          console.log('[visit:createVisit] users lookup failed for hostId:', hostId, e.message || '');
        }

        console.log('[visit:createVisit] submitterRole=', submitterRole, 'hostOpenid=', hostOpenid ? hostOpenid.slice(0, 8) + '...' : 'EMPTY', 'HOST_TMPL_ID=', HOST_TMPL_ID ? HOST_TMPL_ID.slice(0, 8) + '...' : 'EMPTY');
        if (hostOpenid) {
          console.log('[visit:createVisit] sending host notification...');
          await sendSubscribeMsg(hostOpenid, tplData, `pages/workbench/index`, HOST_TMPL_ID, config);
          console.log('[visit:createVisit] sendSubscribeMsg returned');
          await db.collection('notifications').add({
            _openid: hostOpenid,
            type: 'new_visit',
            title: '新的访客预约',
            content: `${visitorName} 预约了 ${visitDate} 的访问，请及时审核。`,
            relatedId: _id,
            read: false,
            createTime: fmtDateTime(),
          });
        } else {
          console.log('[visit:createVisit] hostOpenid is EMPTY, skipping notification');
        }
      } else {
        // Insider submitted -> notify admins
        const adminRes = await db.collection('users').where({ role: 'admin' }).limit(10).get();
        const admins = adminRes.data || [];
        for (const admin of admins) {
          const adminOpenid = admin._openid;
          if (adminOpenid && adminOpenid !== openid) {
            await sendSubscribeMsg(adminOpenid, tplData, `pages/workbench/index`, HOST_TMPL_ID, config);
            await db.collection('notifications').add({
              _openid: adminOpenid,
              type: 'new_visit',
              title: '新的访客预约',
              content: `${visitorName}（内部人员）预约了 ${visitDate} 的访问，请及时审核。`,
              relatedId: _id,
              read: false,
              createTime: fmtDateTime(),
            });
          }
        }
      }
    } catch (e) {
      console.error('[visit:createVisit] notification error:', e);
    }

    return { code: 0, msg: '创建成功', data: doc };
  } catch (err) {
    console.error('[visit:createVisit] error:', err);
    return { code: 500, data: null, msg: `创建失败：${err.message || err}` };
  }
}

// ====== Action: updateVisitStatus ======
async function updateVisitStatusAction(event, context) {
  const db = uniCloud.database();
  const visitsCol = db.collection('visits');
  let openid = resolveOpenid(context, event);
  if (!openid) {
    const uid = (event && event.uid) || (context && context.uid) || '';
    if (uid) openid = uid;
  }

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

    // Notify applicant on approve/reject
    let applicantOpenid = visit._openid || '';
    // Fallback: if _openid is empty, look up by visitorPhone
    if (!applicantOpenid && visit.visitorPhone) {
      try {
        const vRes = await db.collection('users').where({ phone: visit.visitorPhone }).limit(1).get();
        const vUser = vRes.data && vRes.data[0];
        if (vUser && vUser._openid) {
          applicantOpenid = vUser._openid;
          // Patch the visit record for future use
          await visitsCol.doc(visitId).update({ _openid: applicantOpenid });
          console.log('[visit:updateVisitStatus] patched _openid from visitorPhone:', applicantOpenid.slice(0, 8) + '...');
        }
      } catch (e) {
        console.error('[visit:updateVisitStatus] fallback openid lookup error:', e);
      }
    }
    console.log('[visit:updateVisitStatus] notify check: applicantOpenid=', applicantOpenid ? applicantOpenid.slice(0, 8) + '...' : 'EMPTY', 'operator openid=', openid ? openid.slice(0, 8) + '...' : 'EMPTY', 'same=', applicantOpenid === openid, 'newStatus=', newStatus);
    if ((newStatus === 'approved' || newStatus === 'rejected') && applicantOpenid && applicantOpenid !== openid) {
      try {
        const dateText = visit.visitDate || '';
        const note = newStatus === 'approved'
          ? { type: 'visit_approved', title: '预约已通过', content: `您${dateText}的访客预约已通过审批，请按时到访。` }
          : { type: 'visit_rejected', title: '预约已被拒绝', content: `您${dateText}的访客预约未通过审批${rejectReason ? '，原因：' + rejectReason : ''}。` };
        await db.collection('notifications').add({
          _openid: applicantOpenid,
          type: note.type,
          title: note.title,
          content: note.content,
          relatedId: visitId,
          read: false,
          createTime: fmtDateTime(),
        });

        const tplData = {
          name1: { value: String(visit.visitorName || '访客').slice(0, 20) },
          date8: { value: String(visit.visitDate || visit.createTime || fmtDateTime()).slice(0, 20) },
          thing10: { value: newStatus === 'approved' ? '已通过' : '未通过' },
          thing6: { value: String(newStatus === 'approved' ? '接待人：' + (visit.hostName || '') : (rejectReason || '暂不接受此预约')).slice(0, 20) },
        };
        console.log('[visit:updateVisitStatus] sending wx msg: applicantOpenid=', applicantOpenid.slice(0, 8) + '...', 'tmplId=', APPLICANT_TMPL_ID ? APPLICANT_TMPL_ID.slice(0, 8) + '...' : 'EMPTY', 'page=', `pages/visit-detail/index?id=${visitId}`, 'tplData=', JSON.stringify(tplData));
        await sendSubscribeMsg(applicantOpenid, tplData, `pages/visit-detail/index?id=${visitId}`, APPLICANT_TMPL_ID, config);
        console.log('[visit:updateVisitStatus] sendSubscribeMsg returned');
      } catch (e) {
        console.error('[visit:updateVisitStatus] notification error:', e);
      }
    }

    return { code: 0, msg: '更新成功', data: { _id: visitId, ...patch } };
  } catch (err) {
    console.error('[visit:updateVisitStatus] error:', err);
    return { code: 500, data: null, msg: `更新失败：${err.message || err}` };
  }
}

// ====== Timer: expireCheck ======
async function expireCheckAction() {
  const db = uniCloud.database();
  const visitsCol = db.collection('visits');
  const nowMs = Date.now();

  console.log('[visit:expireCheck] running at', fmtDateTime());

  try {
    const res = await visitsCol.where({ status: 'pending' }).limit(500).get();
    const pending = res.data || [];
    const expired = pending.filter(v =>
      !isNaN(parseVisitMs(v.visitDate)) &&
      parseVisitMs(v.visitDate) <= nowMs
    );

    if (!expired.length) {
      console.log('[visit:expireCheck] no expired visits');
      return { code: 0, msg: 'no expired', data: { count: 0 } };
    }

    console.log('[visit:expireCheck] expired count:', expired.length);

    for (const v of expired) {
      console.log('[visit:expireCheck] expiring:', v._id, '_openid:', v._openid ? v._openid.slice(0, 8) + '...' : 'EMPTY', 'visitDate:', v.visitDate);
      try {
        const expirePatch = {
          status: 'rejected',
          rejectReason: '来访时间已过期，请重新申请',
          updateTime: fmtDateTime(),
        };
        await visitsCol.doc(v._id).update(expirePatch);

        // Notify applicant
        if (v._openid) {
          try {
            await db.collection('notifications').add({
              _openid: v._openid,
              type: 'visit_expired',
              title: '预约已过期',
              content: `您${v.visitDate || ''}的访客预约因来访时间已过被自动取消，请重新申请。`,
              relatedId: v._id,
              read: false,
              createTime: fmtDateTime(),
            });
            const applicantTpl = {
              name1: { value: String(v.visitorName || '访客').slice(0, 20) },
              date8: { value: String(v.visitDate || v.createTime || fmtDateTime()).slice(0, 20) },
              thing10: { value: '未通过' },
              thing6: { value: '来访时间已过被自动取消，请重新申请'.slice(0, 20) },
            };
            await sendSubscribeMsg(v._openid, applicantTpl, `pages/visit-detail/index?id=${v._id}`, APPLICANT_TMPL_ID, config);
            console.log('[visit:expireCheck] applicant notified:', v._openid.slice(0, 8) + '...');
          } catch (e) {
            console.error('[visit:expireCheck] notify applicant error:', e);
          }
        } else {
          console.log('[visit:expireCheck] visit has no _openid, skip applicant notification');
        }

        // Notify host (station message only)
        let hostOpenid = '';
        try {
          if (v.hostId) {
            const hostRes = await db.collection('users').doc(v.hostId).get();
            hostOpenid = (hostRes.data && hostRes.data[0] && hostRes.data[0]._openid) || '';
          }
        } catch (e) {}
        if (hostOpenid) {
          try {
            await db.collection('notifications').add({
              _openid: hostOpenid,
              type: 'visit_expired',
              title: '访客预约已过期',
              content: `${v.visitorName || '访客'}的预约（${v.visitDate || ''}）因来访时间已过自动取消。`,
              relatedId: v._id,
              read: false,
              createTime: fmtDateTime(),
            });
          } catch (e) {
            console.error('[visit:expireCheck] notify host error:', e);
          }
        }
      } catch (e) {
        console.error('[visit:expireCheck] error processing visit:', v._id, e);
      }
    }

    return { code: 0, msg: 'expired', data: { count: expired.length } };
  } catch (err) {
    console.error('[visit:expireCheck] error:', err);
    return { code: 500, msg: `expire check failed: ${err.message || err}`, data: null };
  }
}

// ====== Action router ======
const handlers = {
  getVisits: getVisitsAction,
  createVisit: createVisitAction,
  updateVisitStatus: updateVisitStatusAction,
  expireCheck: expireCheckAction,
};

exports.main = async (event, context) => {
  // Timer trigger
  if (event && event.TriggerName === 'expireCheck') {
    console.log('[visit] timer triggered: expireCheck');
    return expireCheckAction();
  }

  const normalized = normalizeEvent(event);
  const action = normalized.action || '';
  const handler = handlers[action];
  if (!handler) {
    return { code: 400, msg: `[visit] 未知 action: ${action || '(空)'}，支持: ${Object.keys(handlers).join(', ')}`, data: null };
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
    console.error(`[visit:${action}] error:`, msg, err && err.stack ? err.stack : err);
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
};
