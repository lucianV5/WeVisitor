<script setup lang="ts">
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { callFunction } from '@/services/cloud'
import EmptyState from '@/components/EmptyState/index.vue'
import styles from './index.module.scss'

const userStore = useUserStore()

const list = ref<any[]>([])
const loading = ref(true)

const iconOf = (type: string) => {
  if (type === 'visit_approved' || type === 'insider_approved') return '✅'
  if (type === 'visit_rejected' || type === 'insider_rejected' || type === 'visit_expired') return '❌'
  if (type === 'new_visit') return '📋'
  return '🔔'
}

const loadList = async () => {
  try {
    const res = await callFunction<any>('getMyNotifications', { role: userStore.currentRole || '' })
    list.value = res?.list || res?.data || []
    if ((res?.unread || 0) > 0) {
      await callFunction('markNotificationsRead', { role: userStore.currentRole || '' })
    }
  } catch (err) {
    console.error('[Messages] load error:', err)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

onLoad(() => {
  loadList()
})

onShow(() => {
  loadList()
})

onPullDownRefresh(async () => {
  await loadList()
  uni.stopPullDownRefresh()
})
</script>

<template>
  <view :class="styles.page">
    <EmptyState v-if="list.length === 0 && !loading" text="暂无消息" icon="🔔" />
    <view v-for="item in list" :key="item._id" :class="styles.card">
      <view :class="styles.cardTop">
        <text :class="styles.icon">{{ iconOf(item.type) }}</text>
        <text :class="styles.title">{{ item.title }}</text>
      </view>
      <text :class="styles.content">{{ item.content }}</text>
      <text :class="styles.time">{{ item.createTime }}</text>
    </view>
  </view>
</template>
