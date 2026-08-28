import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { User, UserRole } from '@/types'
import { callFunction, getHostTmplId, getApplicantTmplId } from '@/services/cloud'

const STORAGE_USER_KEY = 'wevisitor_user'
const STORAGE_ROLE_KEY = 'wevisitor_role'
const STORAGE_ACTIVE_ROLE_KEY = 'wevisitor_active_role'
const MANUAL_LOGOUT_KEY = 'wevisitor_manual_logout'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const currentRole = ref<UserRole>('visitor')
  const availableRoles = ref<UserRole[]>(['visitor'])
  const loading = ref(false)

  try {
    const saved = uni.getStorageSync(STORAGE_USER_KEY)
    if (saved) user.value = saved as User
    const savedRole = uni.getStorageSync(STORAGE_ROLE_KEY)
    if (savedRole) currentRole.value = savedRole as UserRole
    const savedActive = uni.getStorageSync(STORAGE_ACTIVE_ROLE_KEY)
    if (savedActive) currentRole.value = savedActive as UserRole
  } catch (_) {}

  watch(user, val => {
    try {
      if (val) uni.setStorageSync(STORAGE_USER_KEY, val)
      else uni.removeStorageSync(STORAGE_USER_KEY)
    } catch (_) {}
  }, { deep: true })

  watch(currentRole, val => {
    try {
      if (val) {
        uni.setStorageSync(STORAGE_ROLE_KEY, val)
        uni.setStorageSync(STORAGE_ACTIVE_ROLE_KEY, val)
      } else {
        uni.removeStorageSync(STORAGE_ROLE_KEY)
        uni.removeStorageSync(STORAGE_ACTIVE_ROLE_KEY)
      }
    } catch (_) {}
  })

  const setCurrentRole = (role: UserRole) => {
    currentRole.value = role
  }

  const switchRole = (role: UserRole) => {
    if (!availableRoles.value.includes(role)) return
    currentRole.value = role
    try {
      uni.setStorageSync(STORAGE_ROLE_KEY, role)
      uni.setStorageSync(STORAGE_ACTIVE_ROLE_KEY, role)
    } catch (_) {}
    uni.$emit('roleChanged', role)
  }

  const hasMultipleRoles = computed(() => availableRoles.value.length > 1)

  const logout = () => {
    user.value = null
    currentRole.value = 'visitor'
    availableRoles.value = ['visitor']
    isManualLogout.value = true
    try {
      uni.setStorageSync(MANUAL_LOGOUT_KEY, true)
      uni.removeStorageSync(STORAGE_ACTIVE_ROLE_KEY)
    } catch (_) {}
  }

  const login = async (options?: { skipProfile?: boolean; silent?: boolean; name?: string; phone?: string; selectedRole?: string }): Promise<User | null> => {
    if (loading.value) return null
    loading.value = true
    isManualLogout.value = false
    try { uni.removeStorageSync(MANUAL_LOGOUT_KEY) } catch (_) {}
    const silent = options?.silent === true
    const envPlatform: string | undefined = (typeof __UNI_PLATFORM__ !== 'undefined') ? (__UNI_PLATFORM__ as any) : undefined
    const processPlatform: string | undefined = (typeof process !== 'undefined' && process && process.env) ? (process.env as any).UNI_PLATFORM : undefined
    const platform = envPlatform || processPlatform || ''
    const sys = typeof uni.getSystemInfoSync === 'function' ? (uni.getSystemInfoSync as any)() || null : null
    const isWeapp =
      platform === 'mp-weixin' ||
      (sys && (String(sys.uniPlatform || '').toLowerCase() === 'mp-weixin' ||
        String(sys.platform || '').toLowerCase() === 'devtools' ||
        String(sys.platform || '').toLowerCase() === 'wechat'))
    const loginParams: Record<string, any> = {}
    if (options?.name) loginParams.name = options.name
    if (options?.phone) loginParams.phone = options.phone
    if (options?.selectedRole) loginParams.selectedRole = options.selectedRole
    try {

      if (isWeapp && typeof uni.login === 'function') {
        try {
          const loginRes = await new Promise<any>((resolve, reject) => {
            uni.login({
              provider: 'weixin',
              success: resolve,
              fail: reject,
            })
          })
          if (loginRes && loginRes.code) {
            loginParams.code = loginRes.code
            console.log('[UserStore] uni.login got code:', String(loginRes.code).slice(0, 12) + '...')
          }
        } catch (loginErr) {
          console.warn('[UserStore] uni.login skipped:', loginErr)
        }
      }

      if (silent) loginParams.checkOnly = true
      console.log('[UserStore] calling login cloud function with params:', Object.keys(loginParams))
      const result = await callFunction<User & { availableRoles?: UserRole[] }>('login', loginParams)
      if (result) {
        user.value = result
        const roles = (result as any).availableRoles as UserRole[] | undefined
        if (roles && roles.length > 0) {
          availableRoles.value = roles
        } else {
          availableRoles.value = result.role === 'admin'
            ? ['insider', 'admin']
            : result.role === 'insider'
              ? ['insider']
              : ['visitor']
        }
        const savedActive = uni.getStorageSync(STORAGE_ACTIVE_ROLE_KEY) as UserRole | ''
        if (savedActive && availableRoles.value.includes(savedActive)) {
          currentRole.value = savedActive
        } else {
          currentRole.value = availableRoles.value[0] || 'visitor'
        }

        return result
      }
      console.warn('[UserStore] login returned empty result')
      if (!silent) uni.showToast({ title: '登录失败：未获取到用户信息', icon: 'none' })
      return null
    } catch (err: any) {
      console.error('[UserStore] login error:', err)
      if (!silent) {
        const rawMsg: string =
          (err && (err.errMsg || err.message)) || (typeof err === 'string' ? err : '登录失败')
        const noUserInfo = isWeapp && !loginParams.userInfo
        const noCode = isWeapp && !loginParams.code
        let finalMsg = String(rawMsg || '登录失败').slice(0, 40)
        if (noUserInfo && /401|无法获取用户身份|用户不存在|未登录/.test(rawMsg || '')) {
          finalMsg = '请允许授权微信头像昵称后再登录'
        } else if (noCode && /401|用户不存在/.test(rawMsg || '')) {
          finalMsg = '微信登录未返回 code，请重试'
        } else if (/关联云服务空间|上传部署|HBuilderX/.test(rawMsg || '')) {
          finalMsg = String(rawMsg || '').slice(0, 60)
        }
        uni.showToast({ title: finalMsg, icon: 'none', duration: Math.max(2000, finalMsg.length * 120) })
      }
      return null
    } finally {
      loading.value = false
    }
  }

  const updateUser = async (data: Partial<User>): Promise<User | null> => {
    if (loading.value) return null
    loading.value = true
    try {
      const result = await callFunction<User>('updateUser', data as any)
      if (result) {
        user.value = { ...(user.value || {} as User), ...result } as User
      }
      return result
    } catch (err) {
      console.error('[UserStore] updateUser error:', err)
      return null
    } finally {
      loading.value = false
    }
  }

  const refreshUser = async (): Promise<boolean | null> => {
    try {
      const fresh = await callFunction<User>('getUserInfo', {})
      if (!fresh) return null
      const old = user.value
      const changed =
        !old ||
        old.role !== fresh.role ||
        old.nickname !== fresh.nickname ||
        old.department !== fresh.department ||
        old.phone !== fresh.phone
      user.value = { ...old, ...fresh } as User
      const roles = fresh.role === 'admin'
        ? ['insider', 'admin'] as UserRole[]
        : fresh.role === 'insider'
          ? ['insider'] as UserRole[]
          : ['visitor'] as UserRole[]
      availableRoles.value = roles
      if (!availableRoles.value.includes(currentRole.value)) {
        currentRole.value = availableRoles.value[0] || 'visitor'
      }
      return changed
    } catch (err) {
      console.error('[UserStore] refreshUser error:', err)
      return null
    }
  }

  const isLoggedIn = computed(() => !!user.value)
  const isManualLogout = ref(false)
  try { isManualLogout.value = !!uni.getStorageSync(MANUAL_LOGOUT_KEY) } catch (_) {}

  return {
    user,
    currentRole,
    availableRoles,
    hasMultipleRoles,
    loading,
    isLoggedIn,
    isManualLogout,
    login,
    setCurrentRole,
    switchRole,
    updateUser,
    refreshUser,
    logout,
  }
})
