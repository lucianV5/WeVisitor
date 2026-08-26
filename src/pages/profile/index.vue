<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { callFunction } from '@/services/cloud'
import { syncTabBarActive } from '@/utils'
import styles from './index.module.scss'

const instance = getCurrentInstance()
const userStore = useUserStore()

onShow(async () => {
  syncTabBarActive(instance, '/pages/profile/index')
  if (userStore.user) {
    const changed = await userStore.refreshUser()
    if (changed) syncTabBarActive(instance, '/pages/profile/index')
    fetchUnread()
  }
})

const activeRole = computed(() => userStore.currentRole)
const isVisitor = computed(() => activeRole.value === 'visitor')
const isAdmin = computed(() => activeRole.value === 'admin')
const isInsider = computed(() => activeRole.value === 'insider')

const visitorMenus = [
  { key: 'messages', icon: '🔔', label: '我的消息' },
  { key: 'edit', icon: '👤', label: '我的资料' },
  { key: 'applyInsider', icon: '🪪', label: '申请成为内部员工' },
]

const insiderMenus = computed(() => {
  const list = [
    { key: 'messages', icon: '🔔', label: '我的消息' },
    { key: 'edit', icon: '👤', label: '我的资料' },
  ]
  return list
})

const adminMenus = computed(() => {
  const list = [
    { key: 'insiders', icon: '👥', label: '内部人员管理' },
    { key: 'approve', icon: '✅', label: '内部员工申请审批' },
    { key: 'messages', icon: '🔔', label: '我的消息' },
    { key: 'edit', icon: '👤', label: '我的资料' },
  ]
  return list
})

const currentMenus = computed(() => {
  if (isVisitor.value) return visitorMenus
  if (isAdmin.value) return adminMenus.value
  return insiderMenus.value
})

const unread = ref(0)
const fetchUnread = async () => {
  try {
    const res = await callFunction<any>('getMyNotifications', {})
    unread.value = res?.unread || 0
  } catch (_) {}
}

const approvalGrid = [
  { key: 'supplement', icon: '➕', label: '补录访客' },
  { key: 'all', icon: '🗂', label: '全部记录' },
  { key: 'pending', icon: '⏱', label: '待确认' },
  { key: 'approved', icon: '🔍', label: '已确认待到访' },
  { key: 'completed', icon: '✓', label: '已到访' },
  { key: 'rejected', icon: '✕', label: '已拒绝' },
]

const handleLogin = async () => {
  uni.showLoading({ title: '登录中...' })
  try {
    const result = await userStore.login()
    uni.hideLoading()
    if (result) {
      uni.showToast({ title: '登录成功', icon: 'success' })
      setTimeout(() => uni.switchTab({ url: '/pages/visits/index' }), 600)
    } else {
      uni.showToast({ title: '登录失败，请重试', icon: 'none' })
    }
  } catch (err) {
    console.error('[Profile] login error:', err)
    uni.hideLoading()
    uni.showToast({ title: '登录失败', icon: 'none' })
  }
}

const handleLogout = () => {
  uni.showModal({
    title: '提示',
    content: '确定要退出登录吗？',
    success: (res: any) => {
      if (res.confirm) {
        userStore.logout()
        uni.showToast({ title: '已退出', icon: 'none' })
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/index/index' })
        }, 500)
      }
    },
  })
}

const showRoleSwitcher = () => {
  const roles = userStore.availableRoles
  const items = roles.map(r => {
    const label = r === 'admin' ? '管理员' : r === 'insider' ? '内部员工' : '访客'
    return r === activeRole.value ? `${label}（当前）` : label
  })
  uni.showActionSheet({
    itemList: items,
    success: (res: any) => {
      const selected = roles[res.tapIndex]
      if (selected !== activeRole.value) {
        userStore.switchRole(selected)
        uni.showToast({ title: '已切换角色', icon: 'success' })
        const targetUrl = selected === 'visitor' ? '/pages/visits/index' : '/pages/workbench/index'
        setTimeout(() => uni.switchTab({ url: targetUrl }), 500)
      }
    },
  })
}

const handleMenu = (key: string) => {
  if (!userStore.user) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (key === 'edit') {
    uni.navigateTo({ url: '/pages/profile-edit/index' })
    return
  }
  if (key === 'applyInsider') {
    uni.navigateTo({ url: '/pages/insider-apply/index' })
    return
  }
  if (key === 'messages') {
    uni.navigateTo({ url: '/pages/messages/index' })
    return
  }
  if (key === 'insiders') {
    uni.switchTab({ url: '/pages/insiders/index' })
    return
  }
  if (key === 'approve') {
    uni.navigateTo({ url: '/pages/insider-approve/index' })
    return
  }
}

const handleGridTap = (key: string) => {
  if (!userStore.user) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (key === 'supplement') {
    uni.navigateTo({ url: '/pages/visit-supplement/index' })
    return
  }
  if (key === 'all' || key === 'pending' || key === 'approved' || key === 'completed' || key === 'rejected') {
    try {
      uni.setStorageSync('wevisitor_visits_filter', key)
    } catch (_) {}
    uni.switchTab({ url: '/pages/visits/index' })
    return
  }
}
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.header">
      <template v-if="userStore.user">
        <view :class="styles.userRow">
          <view :class="styles.avatar">
            <image
              v-if="userStore.user.avatar"
              :class="styles.avatarImg"
              :src="userStore.user.avatar"
              mode="aspectFill"
            />
            <view v-else :class="styles.avatarFallback">
              {{ (userStore.user.nickname || '访')[0] }}
            </view>
          </view>
          <view :class="styles.userInfo">
            <text :class="styles.userName">{{ userStore.user.nickname || '微信名称展示' }}</text>
            <view v-if="userStore.hasMultipleRoles" :class="styles.roleSwitchRow" @tap="showRoleSwitcher">
              <text :class="styles.roleTag">
                {{ isAdmin ? '管理员' : isInsider ? '内部员工' : '访客' }}
              </text>
              <text :class="styles.switchIcon">切换 ›</text>
            </view>
          </view>
        </view>
      </template>
      <template v-else>
        <view :class="styles.userRow">
          <view :class="styles.avatar" />
          <button :class="styles.loginBtn" :loading="userStore.loading" @click="handleLogin">
            微信登录
          </button>
        </view>
      </template>
    </view>

    <template v-if="userStore.user">
      <view v-if="isAdmin" :class="styles.managementCard">
        <text :class="styles.managementTitle">访客记录审批管理</text>
        <view :class="styles.grid">
          <view
            v-for="item in approvalGrid"
            :key="item.key"
            :class="styles.gridItem"
            @tap="handleGridTap(item.key)"
          >
            <view :class="styles.gridIcon">{{ item.icon }}</view>
            <text :class="styles.gridLabel">{{ item.label }}</text>
          </view>
        </view>
      </view>

      <view :class="styles.menuCard">
        <view
          v-for="(item, idx) in currentMenus"
          :key="item.key"
          :class="[styles.menuItem, idx < currentMenus.length - 1 ? styles.withBorder : '']"
          @tap="handleMenu(item.key)"
        >
          <view :class="styles.menuIcon">{{ item.icon }}</view>
          <text :class="styles.menuLabel">{{ item.label }}</text>
          <text v-if="item.key === 'messages' && unread > 0" :class="styles.unreadBadge">
            {{ unread > 99 ? '99+' : unread }}
          </text>
          <text :class="styles.menuArrow">›</text>
        </view>
      </view>

      <view :class="styles.footer">
        <button :class="styles.logoutBtn" @click="handleLogout">退出登录</button>
      </view>
    </template>
  </view>
</template>
