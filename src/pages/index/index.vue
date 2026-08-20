<script setup lang="ts">
import { useUserStore } from '@/store/user'
import type { UserRole } from '@/types'
import styles from './index.module.scss'

const userStore = useUserStore()

const goHomeByRole = (role?: string) => {
  const url =
    role === 'insider' || role === 'admin' ? '/pages/workbench/index' : '/pages/visits/index'
  uni.switchTab({ url })
}

onMounted(() => {
  try {
    const savedRole = uni.getStorageSync('wevisitor_role') || uni.getStorageSync('currentRole')
    if (savedRole) userStore.setCurrentRole(savedRole as any)
  } catch (_) {}
  if (userStore.user) {
    goHomeByRole(userStore.user.role)
  }
})

const handleLogin = async () => {
  console.log('[IndexPage] handleLogin')
  const wantsInsider = userStore.currentRole === 'insider'
  uni.showLoading({ title: '登录中...' })
  try {
    const result = await userStore.login()
    uni.hideLoading()
    if (result) {
      uni.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => {
        if (wantsInsider && result.role === 'visitor') {
          uni.redirectTo({ url: '/pages/insider-apply/index' })
          return
        }
        goHomeByRole(result.role)
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
        <image :class="styles.roleIcon" :src="visitorIcon" mode="aspectFit" />
        <text :class="[styles.roleName, isVisitor ? styles.roleNameActive : '']">我是访客</text>
      </view>
      <view
        :class="[styles.roleCard, !isVisitor ? styles.active : '']"
        @tap="handleRoleChange('insider')"
      >
        <view v-if="!isVisitor" :class="styles.checkmark">✓</view>
        <image :class="styles.roleIcon" :src="insiderIcon" mode="aspectFit" />
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
