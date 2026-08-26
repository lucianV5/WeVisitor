<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { onShow, onHide, onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import type { Visit, VisitStatus } from '@/types'
import { useUserStore } from '@/store/user'
import { callFunction } from '@/services/cloud'
import { syncTabBarActive, parseVisitTime } from '@/utils'
import { useInfiniteList } from '@/composables/useInfiniteList'
import VisitCard from '@/components/VisitCard/index.vue'
import EmptyState from '@/components/EmptyState/index.vue'
import styles from './index.module.scss'

const instance = getCurrentInstance()

const tabs: { key: VisitStatus | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待确认' },
  { key: 'approved', label: '已确认待到访' },
  { key: 'completed', label: '已到访' },
  { key: 'rejected', label: '已拒绝' },
]

const userStore = useUserStore()
const activeTab = ref<VisitStatus | 'all'>('all')
const initialStatusSet = ref(false)

onLoad((q: any) => {
  const status = (q?.status || '') as string
  if (status && tabs.some(t => t.key === status)) {
    activeTab.value = status as VisitStatus | 'all'
    initialStatusSet.value = true
  }
})

const { list, loading, loadingMore, hasMore, total: totalCount, fetchList, loadMore, setParams } = useInfiniteList<Visit>('getVisits', {})

const doFetch = async () => {
  if (!userStore.user) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    uni.stopPullDownRefresh()
    return
  }
  const r = userStore.user?.role
  const params: Record<string, any> = {
    role: r === 'admin' ? 'admin' : r === 'insider' ? 'insider' : 'visitor',
    userId: userStore.user?._id || '',
  }
  if (activeTab.value !== 'all') {
    params.status = activeTab.value
  }
  setParams(params)
  await fetchList(true)
}

watch(activeTab, () => doFetch())

const now = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

const startTick = () => {
  stopTick()
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 30000)
}
const stopTick = () => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

onShow(() => {
  syncTabBarActive(instance, '/pages/visits/index')
  try {
    const filter = uni.getStorageSync('wevisitor_visits_filter')
    if (filter) {
      uni.removeStorageSync('wevisitor_visits_filter')
      if (tabs.some(t => t.key === filter)) activeTab.value = filter as VisitStatus | 'all'
    }
  } catch (_) {}
  if (userStore.user) {
    now.value = Date.now()
    doFetch()
    startTick()
  } else {
    list.value = []
    uni.showToast({ title: '请先登录', icon: 'none' })
  }
})

onHide(() => stopTick())

onPullDownRefresh(() => doFetch())
onReachBottom(() => loadMore())

const openDetail = async (visit: Visit) => {
  uni.navigateTo({ url: `/pages/visit-detail/index?id=${visit._id || ''}` })
}

const handleEdit = (visit: Visit) => {
  openDetail(visit)
}

const handleDelete = (visit: Visit) => {
  uni.showModal({
    title: '提示',
    content: '确定要删除该预约记录吗？',
    success: (res: any) => {
      if (!res.confirm) return
      const idx = list.value.findIndex(v => v._id === visit._id)
      if (idx >= 0) list.value.splice(idx, 1)
      uni.showToast({ title: '已删除', icon: 'success' })
    },
  })
}

const updateStatus = async (visit: Visit, status: VisitStatus, extra?: Record<string, any>) => {
  if (!visit._id) return
  try {
    uni.showLoading({ title: '处理中...' })
    await callFunction('updateVisitStatus', {
      visitId: visit._id,
      newStatus: status,
      ...(extra || {}),
    })
    uni.hideLoading()
    const idx = list.value.findIndex(v => v._id === visit._id)
    if (idx >= 0) list.value.splice(idx, 1)
    uni.showToast({
      title: status === 'approved' ? '已确认' : status === 'rejected' ? '已拒绝' : '操作成功',
      icon: 'success',
    })
  } catch (err) {
    console.error('[VisitsPage] update status error:', err)
    uni.hideLoading()
    uni.showToast({ title: '操作失败', icon: 'none' })
  }
}

const handleApprove = async (visit: Visit) => {
  updateStatus(visit, 'approved')
}

const handleReject = async (visit: Visit) => {
  uni.showModal({
    title: '拒绝预约',
    editable: true,
    placeholderText: '请输入拒绝原因（选填）',
    success: (res: any) => {
      if (res.confirm) {
        updateStatus(visit, 'rejected', { rejectReason: res.content || '暂不接受此预约' })
      }
    },
  })
}

const handleSignIn = (visit: Visit) => updateStatus(visit, 'completed')

const handleExport = () => {
  if (list.value.length === 0) {
    uni.showToast({ title: '暂无数据可导出', icon: 'none' })
    return
  }
  uni.showLoading({ title: '导出中...' })
  const rows = [
    ['接待人', '访客姓名', '手机号', '来访时间', '来访事由', '申请人', '状态'],
    ...list.value.map(v => [
      v.hostName || '',
      v.visitorName || '',
      v.visitorPhone || '',
      v.visitDate || '',
      v.purpose || '',
      v.visitorName || '',
      v.status || '',
    ]),
  ]
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const fileName = `访客记录_${Date.now()}.csv`
  try {
    const fs: any = (typeof uni.getFileSystemManager === 'function') ? uni.getFileSystemManager() : null
    if (fs) {
      const userPath = (uni as any).env?.USER_DATA_PATH || ''
      const filePath = `${userPath}/${fileName}`
      fs.writeFile({
        filePath,
        data: '\uFEFF' + csv,
        encoding: 'utf8',
        success: () => {
          uni.hideLoading()
          uni.showModal({
            title: '导出成功',
            content: `文件已保存：${fileName}`,
            showCancel: false,
          })
        },
        fail: () => {
          uni.hideLoading()
          uni.showToast({ title: '导出失败', icon: 'none' })
        },
      })
    } else {
      uni.hideLoading()
      uni.showToast({ title: `已导出 ${list.value.length} 条记录`, icon: 'success' })
    }
  } catch (err) {
    uni.hideLoading()
    uni.showToast({ title: `已导出 ${list.value.length} 条记录`, icon: 'success' })
  }
}
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.tabsWrap">
      <view :class="styles.tabs">
        <view
          v-for="tab in tabs"
          :key="tab.key"
          :class="[styles.tab, activeTab === tab.key ? styles.active : '']"
          @tap="activeTab = tab.key"
        >
          <text :class="styles.tabText">{{ tab.label }}</text>
        </view>
      </view>

      <view v-if="userStore.currentRole !== 'visitor'" :class="styles.toolbar">
        <text :class="styles.totalText">访客记录</text>
        <view :class="styles.exportBtn" @tap="handleExport">导出</view>
      </view>
    </view>

    <view :class="styles.listWrap">
      <EmptyState v-if="list.length === 0 && !loading" :text="userStore.user ? '暂无预约记录' : '请先登录'" icon="📋" />
      <VisitCard
        v-for="visit in list"
        :key="visit._id"
        :visit="visit"
        :now="now"
        :role="userStore.currentRole === 'visitor' ? 'visitor' : 'insider'"
        @click="openDetail(visit)"
        @edit="handleEdit"
        @delete="handleDelete"
        @approve="handleApprove"
        @reject="handleReject"
        @signIn="handleSignIn"
      />
      <view v-if="loadingMore" :class="styles.loadingMore">加载中...</view>
      <view v-else-if="!hasMore && list.length > 0" :class="styles.noMore">没有更多了</view>
    </view>
  </view>
</template>
