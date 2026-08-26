<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { callFunction } from '@/services/cloud'
import EmptyState from '@/components/EmptyState/index.vue'
import styles from './index.module.scss'

const list = ref<any[]>([])
const loading = ref(true)

const iconOf = (type: string) => {
  if (type === 'visit_approved' || type === 'insider_approved') return '✅'
  if (type === 'visit_rejected' || type === 'insider_rejected' || type === 'visit_expired') return '❌'
  if (type === 'new_visit') return '📋'
  return '🔔'
}

onLoad(async () => {
  try {
    const res = await callFunction<any>('getMyNotifications', {})
    list.value = res?.list || []
    if ((res?.unread || 0) > 0) {
      await callFunction('markNotificationsRead', {})
    }
  } catch (err) {
    console.error('[Messages] load error:', err)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
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
