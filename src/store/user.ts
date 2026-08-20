import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { User, UserRole } from '@/types'
import { callFunction } from '@/services/cloud'

const STORAGE_USER_KEY = 'wevisitor_user'
const STORAGE_ROLE_KEY = 'wevisitor_role'

export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const currentRole = ref<UserRole>('visitor')
  const loading = ref(false)

  try {
    const saved = uni.getStorageSync(STORAGE_USER_KEY)
    if (saved) user.value = saved as User
    const savedRole = uni.getStorageSync(STORAGE_ROLE_KEY)
    if (savedRole) currentRole.value = savedRole as UserRole
  } catch (_) {}

  watch(user, val => {
    try {
      if (val) uni.setStorageSync(STORAGE_USER_KEY, val)
      else uni.removeStorageSync(STORAGE_USER_KEY)
    } catch (_) {}
    if (val) {
      const mapped: UserRole = val.role === 'visitor' ? 'visitor' : 'insider'
      if (currentRole.value !== mapped) currentRole.value = mapped
    }
  }, { deep: true })

  watch(currentRole, val => {
    try {
      if (val) uni.setStorageSync(STORAGE_ROLE_KEY, val)
      else uni.removeStorageSync(STORAGE_ROLE_KEY)
    } catch (_) {}
  })

  const setCurrentRole = (role: UserRole) => {
    currentRole.value = role
  }

  const logout = () => {
    user.value = null
    currentRole.value = 'visitor'
  }

  const login = async (options?: { skipProfile?: boolean }): Promise<User | null> => {
    if (loading.value) return null
    loading.value = true
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
    try {

      if (isWeapp && typeof uni.getUserProfile === 'function') {
        try {
          const profileRes = await new Promise<any>((resolve, reject) => {
            uni.getUserProfile({
              desc: '用于完善您的访客个人资料',
              lang: 'zh_CN',
              success: resolve,
              fail: reject,
            })
          })
          if (profileRes && profileRes.userInfo) {
            loginParams.userInfo = profileRes.userInfo
            console.log('[UserStore] getUserProfile ok:', profileRes.userInfo.nickName)
          }
        } catch (profileErr: any) {
          const msg: string = (profileErr && (profileErr.errMsg || profileErr.message)) || ''
          const cancelled = typeof msg === 'string' && /cancel/i.test(msg)
          const gesture = typeof msg === 'string' && /TAP|gesture|tap gesture/i.test(msg)
          console.warn(`[UserStore] getUserProfile ${gesture ? 'gesture' : cancelled ? 'cancelled' : 'failed'}:`, profileErr)
          if (gesture) {
            uni.showToast({ title: '请点击登录按钮授权微信头像昵称', icon: 'none', duration: 1600 })
          } else if (!cancelled) {
            uni.showToast({ title: '授权失败，将使用默认资料', icon: 'none', duration: 1500 })
          }
        }
      }

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

      console.log('[UserStore] calling login cloud function with params:', Object.keys(loginParams))
      const result = await callFunction<User>('login', loginParams)
      if (result) {
        user.value = result
        const roleToSet: UserRole = result.role === 'admin' ? 'insider' : result.role
        currentRole.value = roleToSet
        return result
      }
      console.warn('[UserStore] login returned empty result')
      uni.showToast({ title: '登录失败：未获取到用户信息', icon: 'none' })
      return null
    } catch (err: any) {
      console.error('[UserStore] login error:', err)
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

  const refreshUser = async (): Promise<boolean> => {
    try {
      const fresh = await callFunction<User>('getUserInfo', {})
      if (!fresh) return false
      const old = user.value
      const changed =
        !old ||
        old.role !== fresh.role ||
        old.nickname !== fresh.nickname ||
        old.department !== fresh.department ||
        old.phone !== fresh.phone
      user.value = fresh
      if (!old || old.role !== fresh.role) {
        setCurrentRole(fresh.role === 'visitor' ? 'visitor' : 'insider')
      }
      return changed
    } catch (err) {
      console.error('[UserStore] refreshUser error:', err)
      return false
    }
  }

  const isLoggedIn = computed(() => !!user.value)

  return {
    user,
    currentRole,
    loading,
    isLoggedIn,
    login,
    setCurrentRole,
    updateUser,
    refreshUser,
    logout,
  }
})
