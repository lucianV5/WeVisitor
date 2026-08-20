<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
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

const isVisitor = computed(() => {
  const r = userStore.user?.role
  return !r || r === 'visitor'
})
const isAdmin = computed(() => userStore.user?.role === 'admin')
const isInsider = computed(() => !isVisitor.value)

const visitorMenus = [
  { key: 'messages', icon: '🔔', label: '我的消息' },
  { key: 'edit', icon: '👤', label: '我的资料' },
  { key: 'applyInsider', icon: '🪪', label: '申请成为内部员工' },
]
const insiderMenus = computed(() => {
  const list = []
  if (isAdmin.value) {
    list.push({ key: 'insiders', icon: '👥', label: '内部人员管理' })
    list.push({ key: 'approve', icon: '✅', label: '内部员工申请审批' })
  }
  list.push({ key: 'messages', icon: '🔔', label: '我的消息' })
  list.push({ key: 'edit', icon: '👤', label: '我的资料' })
  return list
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

const handleVisitorMenu = (key: string) => {
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
  if (key === 'myVisits') {
    uni.switchTab({ url: '/pages/visits/index' })
    return
  }
}

const handleInsiderMenu = (key: string) => {
  if (!userStore.user) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (key === 'insiders') {
    uni.switchTab({ url: '/pages/insiders/index' })
    return
  }
  if (key === 'edit') {
    uni.navigateTo({ url: '/pages/profile-edit/index' })
    return
  }
  if (key === 'approve') {
    uni.navigateTo({ url: '/pages/insider-approve/index' })
    return
  }
  if (key === 'messages') {
    uni.navigateTo({ url: '/pages/messages/index' })
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
              :class="styles.avatarImg"
              :src="userStore.user.avatar || '/static/default-avatar.png'"
              mode="aspectFill"
            />
          </view>
          <text :class="styles.userName">{{ userStore.user.nickname || '微信名称展示' }}</text>
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
      <!-- Visitor view -->
      <view v-if="isVisitor" :class="styles.menuCard">
        <view
          v-for="(item, idx) in visitorMenus"
          :key="item.key"
          :class="[styles.menuItem, idx < visitorMenus.length - 1 ? styles.withBorder : '']"
          @tap="handleVisitorMenu(item.key)"
        >
          <view :class="styles.menuIcon">{{ item.icon }}</view>
          <text :class="styles.menuLabel">{{ item.label }}</text>
          <text v-if="item.key === 'messages' && unread > 0" :class="styles.unreadBadge">
            {{ unread > 99 ? '99+' : unread }}
          </text>
          <text :class="styles.menuArrow">›</text>
        </view>
      </view>

      <!-- Insider view -->
      <template v-else>
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
            v-for="(item, idx) in insiderMenus"
            :key="item.key"
            :class="[styles.menuItem, idx < insiderMenus.length - 1 ? styles.withBorder : '']"
            @tap="handleInsiderMenu(item.key)"
          >
            <view :class="styles.menuIcon">{{ item.icon }}</view>
            <text :class="styles.menuLabel">{{ item.label }}</text>
            <text v-if="item.key === 'messages' && unread > 0" :class="styles.unreadBadge">
              {{ unread > 99 ? '99+' : unread }}
            </text>
            <text :class="styles.menuArrow">›</text>
          </view>
        </view>
      </template>

      <view :class="styles.footer">
        <button :class="styles.logoutBtn" @click="handleLogout">退出登录</button>
      </view>
    </template>
  </view>
</template>
