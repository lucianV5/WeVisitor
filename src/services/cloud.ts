export type CloudResult<T = any> = {
  code: number
  msg?: string
  message?: string
  data: T | null
  [k: string]: any
}

// 订阅消息模板 ID — 由 login 云函数返回，前端动态获取
let _hostTmplId = 'yjIQuTyaTAHd0NHnhEcP4FSROEJGWKWvUPrI9CTjddc'
let _applicantTmplId = 'ezMBbwj4xLjjtHNBL0keqQOMS6CtMZr4JFOP6KfGH9w'

export const getHostTmplId = () => _hostTmplId
export const getApplicantTmplId = () => _applicantTmplId

export function setTmplIds(host?: string, applicant?: string) {
  if (host) _hostTmplId = host
  if (applicant) _applicantTmplId = applicant
}

const VALID_CALL_NAMES = [
  'login',
  'getUser',
  'updateUser',
  'getUserInfo',
  'getVisits',
  'createVisit',
  'updateVisitStatus',
  'getInsiders',
  'createInsider',
  'updateInsider',
  'deleteInsider',
  'applyInsider',
  'getMyInsiderApplication',
  'getInsiderApplications',
  'handleInsiderApplication',
  'getMyNotifications',
  'markNotificationsRead',
  // merged domain functions
  'user',
  'insider',
  'visit',
  'notify',
] as const

// 旧云函数名 → 新域名云函数 + action 映射
const FUNCTION_MAP: Record<string, { name: string; action: string }> = {
  login: { name: 'user', action: 'login' },
  getUser: { name: 'user', action: 'getUser' },
  getUserInfo: { name: 'user', action: 'getUserInfo' },
  updateUser: { name: 'user', action: 'updateUser' },
  getInsiders: { name: 'insider', action: 'getInsiders' },
  createInsider: { name: 'insider', action: 'createInsider' },
  updateInsider: { name: 'insider', action: 'updateInsider' },
  deleteInsider: { name: 'insider', action: 'deleteInsider' },
  applyInsider: { name: 'insider', action: 'applyInsider' },
  getMyInsiderApplication: { name: 'insider', action: 'getMyInsiderApplication' },
  getInsiderApplications: { name: 'insider', action: 'getInsiderApplications' },
  handleInsiderApplication: { name: 'insider', action: 'handleInsiderApplication' },
  getVisits: { name: 'visit', action: 'getVisits' },
  createVisit: { name: 'visit', action: 'createVisit' },
  updateVisitStatus: { name: 'visit', action: 'updateVisitStatus' },
  getMyNotifications: { name: 'notify', action: 'getMyNotifications' },
  markNotificationsRead: { name: 'notify', action: 'markNotificationsRead' },
}

export type ValidCloudFunctionName = typeof VALID_CALL_NAMES[number]

const UNICLOUD_PROVIDER = ''
const UNICLOUD_SPACE_ID = ''
const UNICLOUD_CLIENT_SECRET = ''
const UNICLOUD_ROOT = 'uniCloud-alipay/cloudfunctions/'

let _inited = false
let _initError: string | null = null

export function getUniCloud(): any | null {
  const g: any = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : {}))
  if (g && typeof g.uniCloud !== 'undefined') return g.uniCloud
  if (typeof uniCloud !== 'undefined') return (uniCloud as any)
  return null
}

export function isCloudAvailable(): boolean {
  const uc = getUniCloud()
  return !!(uc && typeof uc.callFunction === 'function')
}

export function initCloud(provider?: 'aliyun' | 'tcb', spaceId?: string, clientSecret?: string) {
  if (_inited) return
  const uc = getUniCloud()
  if (!uc || typeof uc.init !== 'function') {
    _initError = 'uniCloud 全局对象不可用，请在 manifest.json 中开启 uniCloud 或安装 @dcloudio/uni-cloud 插件'
    console.warn('[Cloud] init skipped:', _initError)
    return
  }
  try {
    const cfg: any = { traceUser: true }
    if (provider) cfg.provider = provider
    if (spaceId) cfg.spaceId = spaceId
    if (clientSecret) cfg.clientSecret = clientSecret
    uc.init(cfg)
    _inited = true
    _initError = null
    console.log('[Cloud] uniCloud.init ok, provider:', cfg.provider || 'default')
  } catch (err: any) {
    _initError = (err && (err.message || err.errMsg)) || 'uniCloud.init 失败'
    console.warn('[Cloud] uniCloud.init failed:', _initError)
  }
}

function matchFatalError(m: string): boolean {
  return /Method name is required|500\s*\(|Internal Server Error|FUNCTION_EXCUTE_ERROR|name is required/i.test(m)
}

function str(err: any): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  return String((err.errMsg || err.message || err.errDetail || ''))
}

function extractMessageFromCloud(resp: any): string {
  if (!resp) return ''
  if (typeof resp === 'string') return resp
  const parts: string[] = []
  const msg = resp.errMsg || resp.message || resp.msg || resp.errorMessage
  if (msg) parts.push(String(msg))
  const detail = resp.errDetail || resp.error_detail || resp.detail
  if (detail) parts.push(String(detail))
  const origin = resp.errOrigin
  if (origin && typeof origin === 'object') {
    const inner = (origin as any).message || (origin as any).msg || (origin as any).errMsg
    if (inner) parts.push(String(inner))
  }
  return parts.join(' | ')
}

function readManifestUniCloudConfig(): { provider: string; spaceId: string; clientSecret: string; cloudfunctionRoot: string } {
  let envCfg: Record<string, any> = {}
  /* #ifndef MP-WEIXIN */
  try {
    const meta: any = (typeof import.meta !== 'undefined') ? (import.meta as any) : null
    if (meta && typeof meta.env === 'object' && meta.env) {
      envCfg = meta.env
    }
  } catch (e) {
    envCfg = {}
  }
  /* #endif */
  const spaceId = String(envCfg.VITE_UNICLOUD_SPACE_ID || UNICLOUD_SPACE_ID || '')
  const clientSecret = String(envCfg.VITE_UNICLOUD_CLIENT_SECRET || UNICLOUD_CLIENT_SECRET || '')
  const provider = String(envCfg.VITE_UNICLOUD_PROVIDER || UNICLOUD_PROVIDER || 'aliyun') as any
  const cloudfunctionRoot = String(UNICLOUD_ROOT || 'uniCloud-alipay/cloudfunctions/')
  return { provider, spaceId, clientSecret, cloudfunctionRoot }
}

export async function callFunction<T = any>(
  name: string,
  data?: Record<string, any>,
): Promise<T> {
  if (!name) throw new Error('[Cloud] 缺少云函数名 name')
  if (VALID_CALL_NAMES.indexOf(name as any) < 0) {
    console.warn(`[Cloud] 云函数名不在白名单中：${name}，仍尝试调用`)
  }
  // 旧名 → 新域名云函数 + action 映射
  const mapped = FUNCTION_MAP[name]
  const cloudFnName = mapped ? mapped.name : name
  const uc = getUniCloud()
  const cfg = readManifestUniCloudConfig()
  if (!uc || typeof uc.callFunction !== 'function') {
    const msg =
      `[Cloud] 全局 uniCloud 对象不可用或缺少 callFunction（${_initError || 'manifest.json 未开启 uniCloud'}），请在 HBuilderX 中关联 uniCloud 服务空间后再调用 ${name}`
    console.error(msg)
    throw new Error(msg)
  }
  try {
    const payload: Record<string, any> = Object.assign({}, data || {})
    if (mapped) {
      payload.action = mapped.action
    }
    if (name === 'login') {
      payload.clientProvider = cfg.provider || ''
      payload.clientPlatform = (typeof __UNI_PLATFORM__ !== 'undefined') ? String(__UNI_PLATFORM__) : ''
      let appid = ''
      try {
        const ac: any = (typeof uni !== 'undefined' && uni && typeof (uni as any).getAccountInfoSync === 'function')
          ? (uni as any).getAccountInfoSync()
          : null
        if (ac && ac.miniProgram && typeof ac.miniProgram.appId === 'string') appid = ac.miniProgram.appId
        if (appid) payload.clientAppid = appid
      } catch (e) {}
      if (!payload.clientAppid) payload.clientAppid = 'wx6dd33bc1b66b1cd5'
    } else if (!payload.uid) {
      try {
        const saved: any = uni.getStorageSync('wevisitor_user')
        const cachedOpenid = saved && (saved._openid || saved.openid)
        if (cachedOpenid) payload.uid = cachedOpenid
      } catch (e) {}
    }
    const sdkArgs: Record<string, any> = {
      name: cloudFnName,
      functionName: cloudFnName,
      method: cloudFnName,
      action: 'callFunction',
      data: payload,
      params: payload,
      body: payload,
      provider: cfg.provider || undefined,
      spaceId: cfg.spaceId || undefined,
      clientSecret: cfg.clientSecret || undefined,
    }

    let raw: any = null
    let lastErr: any = null
    try {
      raw = await new Promise<any>((resolve, reject) => {
        try {
          const p = uc.callFunction(sdkArgs)
          Promise.resolve(p).then(resolve, reject)
        } catch (syncErr) {
          reject(syncErr)
        }
      }).catch((e: any) => {
        lastErr = e
        return null
      })
    } catch (e: any) {
      lastErr = e
      raw = null
    }

    if (raw == null && lastErr) {
      const m = str(lastErr)
      const errName: string = String((lastErr && lastErr.name) || '').trim()
      const errStack: string = String((lastErr && lastErr.stack) || '')
      const isSyntaxOrRuntimeCrash =
        /SyntaxError|TypeError|ReferenceError|Missing initializer|Unexpected token|Unexpected identifier|not defined|Identifier|is not defined|Invalid or unexpected|strict mode/i.test(`${m} ${errName} ${errStack}`)
      console.warn(`[Cloud] ${name} sdk#1 failed name=${errName}:`, m || lastErr)
      if (isSyntaxOrRuntimeCrash) {
        throw new Error(
          `uniCloud.callFunction 内部报错（${errName || ''}）：${m || String(lastErr || 'SDK 错误')}`
        )
      }
      throw lastErr
    }

    const dataOrResult = (raw && (raw.result || raw.data || raw.result || raw.data)) || raw
    const m = str(dataOrResult) || str(raw)
    const fatalResp = raw && typeof raw === 'object' && matchFatalError(m)
    if (fatalResp) {
      throw new Error(m || `sdk#1 failed`)
    }
    const res = dataOrResult
    const resTxt = JSON.stringify(res || {}).slice(0, 200)
    console.info(`[Cloud] ${name} sdk#1 ok ->`, resTxt.length >= 200 ? resTxt.slice(0, 200) + '...' : resTxt)

    const result: any = (res && (res.result || res.data)) || res

    if (result && typeof result === 'object' && ('code' in result)) {
      const c = Number(result.code)
      if (c !== 0) {
        const errMsg = result.msg || result.message || `云函数 ${name} 返回非 0 状态码 ${c}`
        console.error(`[Cloud] ${name} 云函数返回错误 code=${c}：`, errMsg, result, 'payload=', payload)
        throw new Error(errMsg)
      }
      // login 云函数返回模板 ID，存入全局变量
      if (name === 'login' && result.tmplIds) {
        setTmplIds(result.tmplIds.host, result.tmplIds.applicant)
      }
      return (result.data ?? null) as T
    }
    return result as T
  } catch (err: any) {
    const rawMsg: string = str(err)
    const msg = `[Cloud] 调用 ${name} 失败：${rawMsg || String(err)}`
    console.error(msg, 'payload=', Object.assign({}, data || {}))
    if (typeof rawMsg === 'string' && /FUNCTION_NOT_FOUND|not find|找不到|未部署|40000/i.test(rawMsg)) {
      throw new Error(
        `云函数「${cloudFnName}」未部署或入口不兼容（请升级部署）：在 HBuilderX 中右键 uniCloud-alipay/cloudfunctions/${cloudFnName} → 上传并部署（云端安装依赖），保持 package.json main=index.js 再上传一次`
      )
    }
    if (typeof rawMsg === 'string' && matchFatalError(rawMsg)) {
      throw new Error(
        `${rawMsg || '云端入口 Method name required'}：请 HBuilderX 打开项目根目录 → 右键 uniCloud-alipay/cloudfunctions/${cloudFnName} → 重新上传并部署（云端安装依赖），确认 package.json main=index.js`
      )
    }
    throw new Error(rawMsg || msg)
  }
}

