'use strict';

const {
  loadConfig,
  fmtDateTime,
  resolveOpenid,
  normalizeEvent,
  cloneAny,
  getDepartmentCode,
} = require('wevisitor-shared');

const config = loadConfig();
const WX_CONFIG = {
  appid: (config.wx && config.wx.appid) || '',
  secret: process.env.WX_SECRET || '',
};
console.log('[user] env check: WX_SECRET=' + (WX_CONFIG.secret ? 'YES(len=' + WX_CONFIG.secret.length + ')' : 'NO'), 'appid=' + (WX_CONFIG.appid ? 'YES' : 'NO'));
const TMPL_IDS = {
  host: (config.templates && config.templates.host) || '',
  applicant: (config.templates && config.templates.applicant) || '',
};

// ====== code2Session ======
async function code2Session(code, appid, secret) {
  if (!code) return { openid: '', session_key: '', unionid: '' };
  const useAppid = String(appid || WX_CONFIG.appid || '').trim();
  const useSecret = String(secret || WX_CONFIG.secret || '').trim();
  if (!useAppid || !useSecret) return { openid: '', session_key: '', unionid: '', missingSecret: true };
  try {
    const uniCloudAny = typeof uniCloud !== 'undefined' ? uniCloud : null;
    if (uniCloudAny && typeof uniCloudAny.httpclient === 'object' && uniCloudAny.httpclient && typeof uniCloudAny.httpclient.request === 'function') {
      const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(useAppid)}&secret=${encodeURIComponent(useSecret)}&js_code=${encodeURIComponent(String(code))}&grant_type=authorization_code`;
      const resp = await uniCloudAny.httpclient.request(url, { method: 'GET', dataType: 'json', timeout: 10000 });
      const data = (resp && (resp.data || resp.result)) || resp || {};
      return {
        openid: String(data.openid || ''),
        session_key: String(data.session_key || ''),
        unionid: String(data.unionid || ''),
        errcode: data.errcode != null ? Number(data.errcode) : 0,
        errmsg: String(data.errmsg || ''),
      };
    }
    if (typeof fetch === 'function') {
      const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(useAppid)}&secret=${encodeURIComponent(useSecret)}&js_code=${encodeURIComponent(String(code))}&grant_type=authorization_code`;
      const resp = await fetch(url, { method: 'GET', timeout: 10000 });
      const data = await resp.json().catch(() => ({}));
      return {
        openid: String(data.openid || ''),
        session_key: String(data.session_key || ''),
        unionid: String(data.unionid || ''),
        errcode: data.errcode != null ? Number(data.errcode) : 0,
        errmsg: String(data.errmsg || ''),
      };
    }
  } catch (e) {
    return { openid: '', session_key: '', unionid: '', errcode: -1, errmsg: String(e.message || e || '') };
  }
  return { openid: '', session_key: '', unionid: '' };
}

// ====== Action: login ======
async function loginAction(event, context) {
  const db = uniCloud.database();
  const usersCol = db.collection('users');

  const { code, userInfo = {}, clientAppid = '', checkOnly = false } = event || {};
  const { nickName, avatarUrl } = userInfo;

  let openid = '';
  let appid = '';
  let unionid = '';
  const diags = [];

  try {
    const wxContext = uniCloud.getWXContext && uniCloud.getWXContext();
    if (wxContext) {
      openid = wxContext.OPENID || '';
      appid = wxContext.APPID || '';
      unionid = wxContext.UNIONID || '';
      if (openid) diags.push(`getWXContext openid=${String(openid).slice(0, 8)}... appid=${appid}`);
      else diags.push(`getWXContext empty (APPID=${appid})`);
    }
  } catch (e) {
    diags.push(`getWXContext err:${String(e.message || e || '').slice(0, 120)}`);
  }

  if (!openid) {
    const fallbackAppid = String(appid || clientAppid || WX_CONFIG.appid || '').trim();
    const session = await code2Session(code, fallbackAppid, WX_CONFIG.secret);
    if (session && session.openid) {
      openid = session.openid;
      appid = fallbackAppid;
      unionid = session.unionid || unionid;
      diags.push(`code2Session ok openid=${String(openid).slice(0, 8)}... appid=${fallbackAppid}`);
    } else if (session && (session.errcode || session.errmsg || session.missingSecret)) {
      diags.push(`code2Session failed errcode=${session.errcode || 0} errmsg=${String(session.errmsg || '').slice(0, 120)} missingSecret=${!!session.missingSecret}`);
    } else {
      diags.push('code2Session empty');
    }
  }

  if (!openid) {
    const ctxUid = (context && context.uid) || '';
    const evtUid = (event && event.uid) || '';
    openid = ctxUid || evtUid;
    if (openid) diags.push(`fallback uid openid=${String(openid).slice(0, 8)}...`);
  }

  if (!openid) {
    const missing = [];
    if (!WX_CONFIG.appid) missing.push('wx.appid (config.json)');
    if (!WX_CONFIG.secret) missing.push('WX_SECRET (环境变量)');
    const hint = missing.length ? `（请配置：${missing.join(', ')}）` : '';
    const diagTxt = diags.length ? diags.join(' | ') : 'unknown';
    return {
      code: 401,
      data: { diag: diagTxt, gotCode: !!code, gotClientAppid: !!clientAppid, gotUserInfo: !!userInfo, missingEnv: missing },
      msg: `无法获取用户身份标识${hint}。${diagTxt}`,
    };
  }

  const defaultNick = nickName || '微信用户';
  const defaultAvatar = avatarUrl || '';

  try {
    const existing = await usersCol.where({ _openid: openid }).limit(1).get();

    if (existing.data && existing.data.length > 0) {
      const user = existing.data[0];
      const patch = {};
      if (nickName && nickName !== '微信用户' && user.nickname !== nickName) patch.nickname = nickName;
      if (avatarUrl && !user.avatar) patch.avatar = avatarUrl;
      patch.updateTime = fmtDateTime();
      if (Object.keys(patch).length > 0) {
        await usersCol.doc(user._id).update(patch);
        Object.assign(user, patch);
      }
      const availableRoles = user.role === 'admin'
        ? ['insider', 'admin']
        : user.role === 'insider'
          ? ['insider']
          : ['visitor'];
      return {
        code: 0,
        msg: '登录成功',
        data: Object.assign({ _openid: openid, appid, unionid, availableRoles }, user),
        tmplIds: TMPL_IDS,
      };
    }

    if (checkOnly) {
      return { code: 404, data: null, msg: '用户不存在' };
    }

    const { name, phone } = event || {};
    const realName = String(name || '').trim();
    const realPhone = String(phone || '').trim();

    if (realName && realPhone) {
      const matched = await usersCol.where({
        name: realName,
        phone: realPhone,
        _openid: db.command.eq('').or(db.command.exists(false))
      }).limit(1).get();
      if (matched.data && matched.data.length > 0) {
        const preUser = matched.data[0];
        const patch2 = {
          _openid: openid,
          avatar: avatarUrl || preUser.avatar || '',
          updateTime: fmtDateTime(),
        };
        if (nickName && nickName !== '微信用户') patch2.nickname = nickName;
        await usersCol.doc(preUser._id).update(patch2);
        Object.assign(preUser, patch2);
        const availRoles2 = preUser.role === 'admin'
          ? ['insider', 'admin']
          : preUser.role === 'insider'
            ? ['insider']
            : ['visitor'];
        return {
          code: 0,
          msg: '登录成功',
          data: Object.assign({ _openid: openid, appid, unionid, availableRoles: availRoles2 }, preUser),
          tmplIds: TMPL_IDS,
        };
      }
    }

    const selectedRole = event.selectedRole || '';
    const newUser = {
      _openid: openid,
      nickname: defaultNick,
      avatar: defaultAvatar,
      name: realName,
      phone: realPhone,
      role: selectedRole === 'insider' ? '' : 'visitor',
      department: '',
      createTime: fmtDateTime(),
      updateTime: fmtDateTime(),
    };
    const addRes = await usersCol.add(newUser);
    newUser._id = (addRes && addRes.id) || '';

    return {
      code: 0,
      msg: '注册成功',
      data: Object.assign({ _openid: openid, appid, unionid, availableRoles: ['visitor'] }, newUser),
      tmplIds: TMPL_IDS,
    };
  } catch (err) {
    console.error('[user:login] db error:', err);
    return { code: 500, data: null, msg: `登录失败：${err.message || err}` };
  }
}

// ====== Action: getUser ======
async function getUserAction(event, context) {
  const db = uniCloud.database();
  const usersCol = db.collection('users');
  let openid = resolveOpenid(context, event);
  if (!openid) {
    const uid = (event && event.uid) || (context && context.uid) || '';
    if (uid) openid = uid;
  }
  if (!openid) return { code: 401, data: null, msg: '未登录或无法获取身份' };

  try {
    const res = await usersCol.where({ _openid: openid }).limit(1).get();
    if (res.data && res.data.length > 0) {
      return { code: 0, msg: 'ok', data: Object.assign({ _openid: openid }, res.data[0]) };
    }
    return { code: 404, data: null, msg: '用户不存在，请先登录注册' };
  } catch (err) {
    console.error('[user:getUser] error:', err);
    return { code: 500, data: null, msg: `查询失败：${err.message || err}` };
  }
}

// ====== Action: getUserInfo ======
async function getUserInfoAction(event, context) {
  const db = uniCloud.database();
  let openid = resolveOpenid(context, event);
  if (!openid) {
    const uid = (event && event.uid) || (context && context.uid) || '';
    if (uid) openid = uid;
  }
  if (!openid) return { code: 401, data: null, msg: '未获取到用户身份' };

  const res = await db.collection('users').where({ _openid: openid }).limit(1).get();
  const user = res.data && res.data[0];
  if (!user) return { code: 404, data: null, msg: '用户不存在' };
  return { code: 0, msg: 'ok', data: user };
}

// ====== Action: updateUser ======
async function updateUserAction(event, context) {
  const db = uniCloud.database();
  let openid = resolveOpenid(context, event);

  // resolveOpenid 回退：通过前端传来的 uid（即 _openid）获取
  if (!openid) {
    const uid = (event && event.uid) || (context && context.uid) || '';
    if (uid) openid = uid;
  }
  if (!openid) return { code: 401, data: null, msg: '未获取到用户身份' };

  const { nickname, avatar, name, phone, department, role } = event || {};
  const patch = {};
  if (typeof nickname === 'string') patch.nickname = nickname;
  if (typeof avatar === 'string') patch.avatar = avatar;
  if (typeof name === 'string') patch.name = name;
  if (typeof phone === 'string') patch.phone = phone;
  if (typeof department === 'string') {
    patch.department = department;
    const deptCode = getDepartmentCode(department);
    if (deptCode) patch.departmentCode = deptCode;
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
    return { code: 0, msg: '更新成功', data: updated };
  } catch (err) {
    console.error('[user:updateUser] error:', err);
    return { code: 500, data: null, msg: `更新失败：${err.message || err}` };
  }
}

// ====== Action router ======
const handlers = {
  login: loginAction,
  getUser: getUserAction,
  getUserInfo: getUserInfoAction,
  updateUser: updateUserAction,
};

exports.main = async (event, context) => {
  const normalized = normalizeEvent(event);
  const action = normalized.action || '';
  const handler = handlers[action];
  if (!handler) {
    return { code: 400, msg: `[user] 未知 action: ${action || '(空)'}，支持: ${Object.keys(handlers).join(', ')}`, data: null };
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
    console.error(`[user:${action}] error:`, msg, err && err.stack ? err.stack : err);
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
};
