<script setup lang="ts">
import { useUserStore } from '@/store/user'
import { getHostTmplId, getApplicantTmplId } from '@/services/cloud'
import type { UserRole } from '@/types'
import { onLoad, onShow } from '@dcloudio/uni-app'
import styles from './index.module.scss'

const userStore = useUserStore()

const forcedVisitor = ref(false)

onLoad((options: any) => {
  const scene = options?.scene ? decodeURIComponent(options.scene) : ''
  const role = options?.role || ''
  if (scene === 'vr' || role === 'visitor') {
    forcedVisitor.value = true
    userStore.setCurrentRole('visitor')
  }
})

const goHomeByRole = (role?: string) => {
  if (role === 'insider' || role === 'admin') {
    uni.switchTab({ url: '/pages/workbench/index' })
  } else {
    uni.switchTab({ url: '/pages/visits/index' })
  }
}

const goInsiderApply = () => {
  uni.redirectTo({ url: '/pages/insider-apply/index' })
}

const showRoleSelector = () => {
  const roles = userStore.availableRoles
  const items = roles.map(r => r === 'admin' ? '管理员' : r === 'insider' ? '内部员工' : '访客')
  uni.showActionSheet({
    itemList: items,
    success: (res: any) => {
      const selected = roles[res.tapIndex]
      userStore.switchRole(selected)
      goHomeByRole(selected)
    },
  })
}

let mountedDone = false

onMounted(async () => {
  if (!forcedVisitor.value) {
    try {
      const savedRole = uni.getStorageSync('wevisitor_role') || uni.getStorageSync('currentRole')
      if (savedRole) userStore.setCurrentRole(savedRole as any)
    } catch (_) {}
  }
  const wantedInsider = !forcedVisitor.value && userStore.currentRole === 'insider'
  if (userStore.user) {
    const valid = await userStore.refreshUser()
    if (valid !== null) {
      if (forcedVisitor.value) {
        userStore.setCurrentRole('visitor')
        goHomeByRole('visitor')
      } else if (userStore.hasMultipleRoles) {
        showRoleSelector()
      } else if (wantedInsider && userStore.user?.role !== 'insider' && userStore.user?.role !== 'admin') {
        goInsiderApply()
      } else {
        goHomeByRole(userStore.currentRole)
      }
      mountedDone = true
      return
    }
    userStore.logout()
  }
  if (userStore.isManualLogout && !forcedVisitor.value) {
    mountedDone = true
    return
  }
  const savedRole = forcedVisitor.value ? 'visitor' : userStore.currentRole
  if (savedRole) {
    const result = await userStore.login({ silent: true, selectedRole: forcedVisitor.value ? 'visitor' : undefined })
    if (result) {
      if (forcedVisitor.value) {
        const userRole = result.role
        if (userRole === 'insider' || userRole === 'admin') {
          uni.showModal({
            title: '无法登录',
            content: '您是内部人员，不允许以访客身份登录。请直接使用内部员工身份登录。',
            showCancel: false,
            confirmText: '知道了',
          })
          mountedDone = true
          return
        }
        userStore.setCurrentRole('visitor')
        goHomeByRole('visitor')
      } else if (userStore.hasMultipleRoles) {
        showRoleSelector()
      } else if (wantedInsider && result.role !== 'insider' && result.role !== 'admin') {
        goInsiderApply()
      } else {
        goHomeByRole(userStore.currentRole)
      }
      mountedDone = true
      return
    }
  }
  mountedDone = true
})

onShow(() => {
  if (!mountedDone) return
  if (userStore.user && !userStore.isManualLogout) {
    goHomeByRole(userStore.currentRole)
  }
})

const requestSubscribeOnLogin = (): Promise<boolean> => {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    const hostId = getHostTmplId()
    const applicantId = getApplicantTmplId()
    const tmplIds = [hostId, applicantId].filter(Boolean) as string[]
    if (!tmplIds.length) { resolve(false); return }
    uni.requestSubscribeMessage({
      tmplIds,
      success: (res: any) => {
        const accepted = tmplIds.some(id => res[id] === 'accept')
        if (accepted) {
          let count = 1
          let failed = 0
          const loop = (remaining: number) => {
            if (remaining <= 0) return
            uni.requestSubscribeMessage({
              tmplIds,
              success: () => { count++; failed = 0; setTimeout(() => loop(remaining - 1), 50) },
              fail: () => { failed++; if (failed >= 2) return; setTimeout(() => loop(remaining - 1), 50) },
            })
          }
          loop(48)
        }
        resolve(accepted)
      },
      fail: () => resolve(false),
    })
    // #endif
    // #ifndef MP-WEIXIN
    resolve(false)
    // #endif
  })
}

const handleLogin = async () => {
  console.log('[IndexPage] handleLogin')
  if (!agreedToTerms.value) {
    uni.showToast({ title: '请先阅读并同意用户服务协议和隐私政策', icon: 'none' })
    return
  }
  const selectedRole = forcedVisitor.value ? 'visitor' : userStore.currentRole

  // #ifdef MP-WEIXIN
  const notified = uni.getStorageSync('wevisitor_notify_authorized')
  if (!notified) {
    const accepted = await requestSubscribeOnLogin()
    if (accepted) uni.setStorageSync('wevisitor_notify_authorized', true)
  }
  // #endif

  uni.showLoading({ title: '登录中...' })
  try {
    const result = await userStore.login({ selectedRole })
    uni.hideLoading()
    if (result) {

      if (forcedVisitor.value) {
        const userRole = result.role
        if (userRole === 'insider' || userRole === 'admin') {
          uni.showModal({
            title: '无法登录',
            content: '您是内部人员，不允许以访客身份登录。请直接使用内部员工身份登录。',
            showCancel: false,
            confirmText: '知道了',
          })
          return
        }
        userStore.setCurrentRole('visitor')
        uni.showToast({ title: '登录成功', icon: 'success' })
        goHomeByRole('visitor')
        return
      }

      const userRole = result.role
      const isInsiderOrAdmin = userRole === 'insider' || userRole === 'admin'

      if (selectedRole === 'visitor' && isInsiderOrAdmin) {
        uni.showModal({
          title: '无法登录',
          content: '您是内部人员，不允许以访客身份登录。请直接使用内部员工身份登录。',
          showCancel: false,
          confirmText: '知道了',
        })
        return
      }

      if (selectedRole === 'insider' && !isInsiderOrAdmin) {
        goInsiderApply()
      } else if (userStore.hasMultipleRoles) {
        showRoleSelector()
      } else {
        uni.showToast({ title: '登录成功', icon: 'success' })
        goHomeByRole(userStore.currentRole)
      }
    } else {
      uni.showToast({ title: '登录失败，请重试', icon: 'none' })
    }
  } catch (err) {
    console.error('[IndexPage] login error:', err)
    uni.hideLoading()
    uni.showToast({ title: '登录失败', icon: 'none' })
  }
}

const handleRoleChange = (role: UserRole) => {
  userStore.setCurrentRole(role)
}

const isVisitor = computed(() => userStore.currentRole === 'visitor')

const visitorIcon = '/static/login/visitor.jpg'
const insiderIcon = '/static/login/insider.jpg'

const agreedToTerms = ref(false)

const toggleAgree = () => {
  agreedToTerms.value = !agreedToTerms.value
}
const openAgreement = (type: 'service' | 'privacy') => {
  uni.navigateTo({ url: `/pages/agreement/index?type=${type}` })
}

const guestBrowse = () => {
  uni.setStorageSync('wevisitor_guest_mode', true)
  uni.switchTab({ url: '/pages/visits/index' })
}
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.header">
      <text :class="styles.title">访客预约系统</text>
      <text :class="styles.subtitle">{{ forcedVisitor ? '访客登录' : '请选择您的身份' }}</text>
    </view>

    <view :class="styles.roleGrid">
      <view
        :class="[styles.roleCard, isVisitor ? styles.active : '']"
        @tap="handleRoleChange('visitor')"
      >
        <view v-if="isVisitor" :class="styles.checkmark">✓</view>
        <image :class="styles.roleIcon" :src="visitorIcon" mode="aspectFill" />
        <text :class="[styles.roleName, isVisitor ? styles.roleNameActive : '']">我是访客</text>
      </view>
      <view
        v-if="!forcedVisitor"
        :class="[styles.roleCard, !isVisitor ? styles.active : '']"
        @tap="handleRoleChange('insider')"
      >
        <view v-if="!isVisitor" :class="styles.checkmark">✓</view>
        <image :class="styles.roleIcon" :src="insiderIcon" mode="aspectFill" />
        <text :class="[styles.roleName, !isVisitor ? styles.roleNameActive : '']">内部人员</text>
      </view>
    </view>

    <view :class="styles.bottomBar">
      <button :class="styles.loginButton" :loading="userStore.loading" :disabled="!agreedToTerms" @click="handleLogin">
        微信登录
      </button>
      <view :class="styles.agreementRow">
        <view :class="[styles.checkbox, agreedToTerms ? styles.checkboxActive : '']" @tap="toggleAgree">
          <text v-if="agreedToTerms" :class="styles.checkIcon">✓</text>
        </view>
        <text :class="styles.agreementText">
          我已阅读并同意
        </text>
        <text :class="styles.agreementLink" @tap="openAgreement('service')">《用户服务协议》</text>
        <text :class="styles.agreementText">及</text>
        <text :class="styles.agreementLink" @tap="openAgreement('privacy')">《隐私政策》</text>
      </view>
      <view v-if="!forcedVisitor" :class="styles.guestLink" @tap="guestBrowse">
        <text :class="styles.guestLinkText">游客浏览</text>
      </view>
    </view>
  </view>
</template>
