'use strict';

const WX_CONFIG = {
  APPID: process.env.WX_APPID || 'wx6dd33bc1b66b1cd5',
  SECRET: process.env.WX_SECRET || '',
};

const fmtDateTime = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

async function code2Session(code, appid, secret) {
  if (!code) return { openid: '', session_key: '', unionid: '' };
  const useAppid = String(appid || WX_CONFIG.APPID || '').trim();
  const useSecret = String(secret || WX_CONFIG.SECRET || '').trim();
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

const businessMain = async (event, context) => {
  const db = uniCloud.database();
  const $ = db.command.aggregate;
  const usersCol = db.collection('users');

  const { code, userInfo = {}, clientAppid = '' } = event || {};
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
    const fallbackAppid = String(appid || clientAppid || WX_CONFIG.APPID || '').trim();
    const session = await code2Session(code, fallbackAppid, WX_CONFIG.SECRET);
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
    const diagTxt = diags.length ? diags.join(' | ') : 'unknown';
    return {
      code: 401,
      data: { diag: diagTxt, gotCode: !!code, gotClientAppid: !!clientAppid, gotUserInfo: !!userInfo },
      msg: '无法获取用户身份标识，请重新授权登录。若使用 uniCloud.callFunction，请先在 HBuilderX 关联微信小程序 AppID，或在 WX_CONFIG.SECRET 中配置小程序密钥后重新部署 login 云函数。',
    };
  }

  const defaultNick = nickName || '微信用户';
  const defaultAvatar = avatarUrl || '';

  const insidersCol = db.collection('insiders');
  const syncFromInsider = async (userRecord) => {
    try {
      let insider = null;
      const byOpenid = await insidersCol.where({ _openid: openid }).limit(1).get();
      insider = byOpenid.data && byOpenid.data[0];
      if (!insider && userRecord.phone) {
        const byPhone = await insidersCol.where({ phone: userRecord.phone }).limit(1).get();
        const cand = byPhone.data && byPhone.data[0];
        if (cand && !cand._openid) {
          await insidersCol.doc(cand._id).update({ _openid: openid });
          insider = cand;
        }
      }
      if (!insider) return userRecord;
      const phoneConflict = !!(insider.phone && userRecord.phone && insider.phone !== userRecord.phone);
      const patch = {};
      if (insider.name && userRecord.nickname !== insider.name) patch.nickname = insider.name;
      if (insider.phone && userRecord.phone !== insider.phone && !phoneConflict) patch.phone = insider.phone;
      if (insider.department && userRecord.department !== insider.department) patch.department = insider.department;
      if (insider.departmentCode && userRecord.departmentCode !== insider.departmentCode) patch.departmentCode = insider.departmentCode;
      if (insider.role === 'admin' || insider.role === 'insider') {
        if (userRecord.role !== insider.role) patch.role = insider.role;
      } else if (userRecord.role !== 'admin' && userRecord.role !== 'insider') {
        patch.role = 'insider';
      }
      if (Object.keys(patch).length > 0) {
        patch.updateTime = fmtDateTime();
        await usersCol.doc(userRecord._id).update(patch);
        Object.assign(userRecord, patch);
      }
    } catch (e) {
      console.error('[login] syncFromInsider error:', e);
    }
    return userRecord;
  };

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
      await syncFromInsider(user);
      return {
        code: 0,
        msg: '登录成功',
        data: Object.assign({ _openid: openid, appid, unionid }, user),
      };
    }

    const newUser = {
      _openid: openid,
      nickname: defaultNick,
      avatar: defaultAvatar,
      phone: '',
      role: 'visitor',
      department: '',
      createTime: fmtDateTime(),
      updateTime: fmtDateTime(),
    };

    const addRes = await usersCol.add(newUser);
    newUser._id = (addRes && addRes.id) || '';
    await syncFromInsider(newUser);

    return {
      code: 0,
      msg: '注册成功',
      data: Object.assign({ _openid: openid, appid, unionid }, newUser),
    };
  } catch (err) {
    console.error('[login] db error:', err);
    return { code: 500, data: null, msg: `登录失败：${err.message || err}` };
  }
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
    console.error('[login] main error:', msg, err && err.stack ? err.stack : err);
    return { code: typeof (err && err.code) === 'number' ? err.code : 500, msg, data: null };
  }
};
