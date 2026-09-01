<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { onShow, onHide, onLoad, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import type { Visit, VisitStatus } from '@/types'
import { useUserStore } from '@/store/user'
import { callFunction } from '@/services/cloud'
import * as XLSX from 'xlsx'
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

const isGuestMode = ref(false)

const goToLogin = () => {
  uni.removeStorageSync('wevisitor_guest_mode')
  uni.reLaunch({ url: '/pages/index/index' })
}

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
  const r = userStore.currentRole
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

onShow(async () => {
  syncTabBarActive(instance, '/pages/visits/index')
  try {
    const filter = uni.getStorageSync('wevisitor_visits_filter')
    if (filter) {
      uni.removeStorageSync('wevisitor_visits_filter')
      if (tabs.some(t => t.key === filter)) activeTab.value = filter as VisitStatus | 'all'
    }
  } catch (_) {}
  if (!userStore.user) {
    const isGuest = uni.getStorageSync('wevisitor_guest_mode')
    if (!isGuest) {
      uni.reLaunch({ url: '/pages/index/index' })
      return
    }
    isGuestMode.value = true
    return
  }
  isGuestMode.value = false
  uni.removeStorageSync('wevisitor_guest_mode')
  now.value = Date.now()
  doFetch()
  startTick()
})

onHide(() => stopTick())

onPullDownRefresh(async () => {
  await doFetch()
  uni.stopPullDownRefresh()
})
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
    content: '确定要撤销该预约吗？撤销后接待人将不再收到此预约通知。',
    confirmText: '撤销',
    cancelText: '取消',
    success: async (res: any) => {
      if (!res.confirm) return
      try {
        uni.showLoading({ title: '处理中...' })
        await callFunction('deleteVisit', { visitId: visit._id })
        uni.hideLoading()
        const idx = list.value.findIndex(v => v._id === visit._id)
        if (idx >= 0) list.value.splice(idx, 1)
        uni.showToast({ title: '已撤销', icon: 'success' })
      } catch (err) {
        uni.hideLoading()
        uni.showToast({ title: err instanceof Error ? err.message : '操作失败', icon: 'none' })
      }
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
  const statusMap: Record<string, string> = {
    pending: '待确认',
    approved: '已确认待到访',
    completed: '已到访',
    rejected: '已拒绝',
  }
  const rows = [
    ['接待人', '访客姓名', '手机号', '所在公司', '来访时间', '来访事由', '申请人', '状态'],
    ...list.value.map(v => [
      v.hostName || '',
      v.visitorName || '',
      v.visitorPhone || '',
      v.company || '',
      v.visitDate || '',
      v.purpose || '',
      v.visitorName || '',
      statusMap[v.status] || v.status || '',
    ]),
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws, '访客记录')
  const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })
  const fileName = `访客记录_${Date.now()}.xlsx`
  try {
    const fs: any = (typeof uni.getFileSystemManager === 'function') ? uni.getFileSystemManager() : null
    console.log('[export] fs available:', !!fs)
    if (fs) {
        const userPath = (uni as any).env?.USER_DATA_PATH || ''
        const filePath = `${userPath}/${fileName}`
        console.log('[export] filePath:', filePath)
        fs.writeFile({
          filePath,
          data: base64Data,
          encoding: 'base64',
          success: () => {
            console.log('[export] writeFile success')
            uni.hideLoading()
            uni.showActionSheet({
              itemList: ['转发到微信', '预览文件'],
              success: (res: any) => {
                if (res.tapIndex === 0) {
                  ;(uni as any).shareFileMessage({
                    filePath,
                    fileName,
                    success: () => {
                      console.log('[export] shareFileMessage success')
                    },
                    fail: (err: any) => {
                      console.error('[export] shareFileMessage fail:', err)
                      uni.showToast({ title: '分享失败，请尝试预览', icon: 'none' })
                    },
                  })
                } else if (res.tapIndex === 1) {
                  uni.openDocument({
                    filePath,
                    showMenu: true,
                    success: () => {
                      console.log('[export] openDocument success')
                    },
                    fail: (err: any) => {
                      console.error('[export] openDocument fail:', err)
                      uni.showToast({ title: '预览失败，请尝试转发', icon: 'none' })
                    },
                  })
                }
              },
              fail: () => {
                uni.showToast({ title: '已取消', icon: 'none' })
              },
            })
          },
          fail: (err: any) => {
            console.error('[export] writeFile fail:', err)
            uni.hideLoading()
            uni.showModal({
              title: '导出失败',
              content: `写入文件失败：${JSON.stringify(err)}`,
              showCancel: false,
            })
          },
        })
    } else {
      console.error('[export] FileSystemManager not available')
      uni.hideLoading()
      uni.showModal({
        title: '导出失败',
        content: '当前环境不支持文件操作',
        showCancel: false,
      })
    }
  } catch (err) {
    console.error('[export] catch error:', err)
    uni.hideLoading()
    uni.showModal({
      title: '导出失败',
      content: String(err),
      showCancel: false,
    })
  }
}
</script>

<template>
  <view :class="styles.page">
    <!-- Guest mode -->
    <view v-if="isGuestMode" :class="styles.guestView">
      <text :class="styles.guestIcon">📋</text>
      <text :class="styles.guestTitle">访客预约系统</text>
      <text :class="styles.guestDesc">登录后可使用以下功能：</text>
      <view :class="styles.guestFeatures">
        <view :class="styles.guestFeatureItem">
          <text :class="styles.guestFeatureIcon">📝</text>
          <text :class="styles.guestFeatureText"> 在线预约访客</text>
        </view>
        <view :class="styles.guestFeatureItem">
          <text :class="styles.guestFeatureIcon">✅</text>
          <text :class="styles.guestFeatureText">接待人审批确认</text>
        </view>
        <view :class="styles.guestFeatureItem">
          <text :class="styles.guestFeatureIcon">📋</text>
          <text :class="styles.guestFeatureText">查看预约记录</text>
        </view>
        <view :class="styles.guestFeatureItem">
          <text :class="styles.guestFeatureIcon">🔔</text>
          <text :class="styles.guestFeatureText">消息通知提醒</text>
        </view>
      </view>
      <button :class="styles.guestLoginBtn" @tap="goToLogin">去登录</button>
    </view>

    <!-- Normal mode -->
    <template v-else>
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
    </template>
  </view>
</template>
