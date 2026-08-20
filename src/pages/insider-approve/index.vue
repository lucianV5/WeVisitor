<script setup lang="ts">
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { callFunction } from '@/services/cloud'
import EmptyState from '@/components/EmptyState/index.vue'
import styles from './index.module.scss'

const activeTab = ref('pending')
const list = ref<any[]>([])
const loading = ref(false)

const loadList = async () => {
  loading.value = true
  try {
    const result = await callFunction<any[]>('getInsiderApplications', { status: activeTab.value })
    list.value = result || []
  } catch (err) {
    console.error('[InsiderApprove] load error:', err)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

const switchTab = (tab: string) => {
  if (activeTab.value === tab) return
  activeTab.value = tab
  loadList()
}

onShow(() => {
  loadList()
})
onPullDownRefresh(() => loadList())

const handleAction = (item: any, action: 'approve' | 'reject') => {
  const actionText = action === 'approve' ? '通过' : '拒绝'
  uni.showModal({
    title: '提示',
    content: `确定${actionText}【${item.name}】的内部员工申请吗？`,
    success: async (res: any) => {
      if (!res.confirm) return
      try {
        uni.showLoading({ title: '处理中...' })
        await callFunction('handleInsiderApplication', { id: item._id, action })
        uni.hideLoading()
        uni.showToast({ title: `已${actionText}`, icon: 'success' })
        loadList()
      } catch (err: any) {
        console.error('[InsiderApprove] handle error:', err)
        uni.hideLoading()
        uni.showToast({ title: err?.message || '处理失败', icon: 'none' })
      }
    },
  })
}

const statusText = (s: string) => (s === 'approved' ? '已通过' : s === 'rejected' ? '已拒绝' : '待审核')
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.tabBar">
      <view
        :class="[styles.tabItem, activeTab === 'pending' ? styles.tabActive : '']"
        @tap="switchTab('pending')"
      >
        待审核
      </view>
      <view
        :class="[styles.tabItem, activeTab === 'approved' ? styles.tabActive : '']"
        @tap="switchTab('approved')"
      >
        已通过
      </view>
      <view
        :class="[styles.tabItem, activeTab === 'rejected' ? styles.tabActive : '']"
        @tap="switchTab('rejected')"
      >
        已拒绝
      </view>
    </view>

    <view :class="styles.listWrap">
      <EmptyState v-if="list.length === 0 && !loading" text="暂无申请记录" icon="📋" />
      <view v-for="item in list" :key="item._id" :class="styles.card">
        <view :class="styles.cardTop">
          <view :class="styles.avatar">
            <text :class="styles.avatarText">{{ (item.name || '申')[0] }}</text>
          </view>
          <view :class="styles.cardTitle">
            <text :class="styles.name">{{ item.name }}</text>
            <text :class="styles.subName">微信昵称：{{ item.nickname || '—' }}</text>
          </view>
          <text
            v-if="item.status !== 'pending'"
            :class="[styles.statusTag, item.status === 'approved' ? styles.tagGreen : styles.tagRed]"
          >
            {{ statusText(item.status) }}
          </text>
        </view>
        <view :class="styles.cardInfo">
          <text :class="styles.infoLabel">手 机 号：</text>
          <text :class="styles.infoValue">{{ item.phone || '—' }}</text>
        </view>
        <view :class="styles.cardInfo">
          <text :class="styles.infoLabel">申请部门：</text>
          <text :class="styles.infoValue">{{ item.department || '—' }}</text>
        </view>
        <view :class="styles.cardInfo">
          <text :class="styles.infoLabel">申请时间：</text>
          <text :class="styles.infoValue">{{ item.createTime || '—' }}</text>
        </view>
        <view v-if="item.status === 'pending'" :class="styles.cardActions">
          <view :class="styles.rejectBtn" @tap="handleAction(item, 'reject')">拒绝</view>
          <view :class="styles.approveBtn" @tap="handleAction(item, 'approve')">通过</view>
        </view>
        <view v-else :class="styles.handleTime">处理时间：{{ item.handleTime || '—' }}</view>
      </view>
    </view>
  </view>
</template>
