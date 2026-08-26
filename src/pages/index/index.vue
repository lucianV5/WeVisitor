<script setup lang="ts">
import { useUserStore } from '@/store/user'
import { getHostTmplId, getApplicantTmplId } from '@/services/cloud'
import type { UserRole } from '@/types'
import styles from './index.module.scss'

const userStore = useUserStore()

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

onMounted(async () => {
  try {
    const savedRole = uni.getStorageSync('wevisitor_role') || uni.getStorageSync('currentRole')
    if (savedRole) userStore.setCurrentRole(savedRole as any)
  } catch (_) {}
  if (userStore.user) {
    const valid = await userStore.refreshUser()
    if (valid) {
      if (userStore.hasMultipleRoles) {
        showRoleSelector()
      } else {
        goHomeByRole(userStore.currentRole)
      }
      return
    }
    userStore.logout()
  }
  if (userStore.isManualLogout) return
  const savedRole = userStore.currentRole
  if (savedRole) {
    const result = await userStore.login({ silent: true })
    if (result) {
      if (userStore.hasMultipleRoles) {
        showRoleSelector()
      } else {
        goHomeByRole(userStore.currentRole)
      }
      return
    }
  }
})

const requestSubscribeOnLogin = (): Promise<void> => {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    uni.requestSubscribeMessage({
      tmplIds: [getHostTmplId(), getApplicantTmplId()],
      success: () => resolve(),
      fail: () => resolve(),
    })
    // #endif
    // #ifndef MP-WEIXIN
    resolve()
    // #endif
  })
}

const handleLogin = async () => {
  console.log('[IndexPage] handleLogin')
  const selectedRole = userStore.currentRole
  uni.showLoading({ title: '登录中...' })
  try {
    const result = await userStore.login()
    uni.hideLoading()
    if (result) {
      uni.showToast({ title: '登录成功', icon: 'success' })
      await requestSubscribeOnLogin()

      const userRole = result.role
      const isInsiderOrAdmin = userRole === 'insider' || userRole === 'admin'

      setTimeout(() => {
        if (selectedRole === 'insider' && !isInsiderOrAdmin) {
          goInsiderApply()
        } else if (userStore.hasMultipleRoles) {
          showRoleSelector()
        } else {
          goHomeByRole(userStore.currentRole)
        }
      }, 600)
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
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.header">
      <text :class="styles.title">访客预约系统</text>
      <text :class="styles.subtitle">请选择您的身份</text>
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
        :class="[styles.roleCard, !isVisitor ? styles.active : '']"
        @tap="handleRoleChange('insider')"
      >
        <view v-if="!isVisitor" :class="styles.checkmark">✓</view>
        <image :class="styles.roleIcon" :src="insiderIcon" mode="aspectFill" />
        <text :class="[styles.roleName, !isVisitor ? styles.roleNameActive : '']">内部人员</text>
      </view>
    </view>

    <view :class="styles.bottomBar">
      <button :class="styles.loginButton" :loading="userStore.loading" @click="handleLogin">
        微信登录
      </button>
      <text :class="styles.agreement">登录即表示同意《用户服务协议》</text>
    </view>
  </view>
</template>
