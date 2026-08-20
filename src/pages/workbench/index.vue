<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { onShow, onHide, onPullDownRefresh } from '@dcloudio/uni-app'
import type { Visit } from '@/types'
import { useUserStore } from '@/store/user'
import { callFunction } from '@/services/cloud'
import { formatDate, syncTabBarActive, getCountdownText, parseVisitTime } from '@/utils'
import styles from './index.module.scss'

const instance = getCurrentInstance()
const userStore = useUserStore()

const list = ref<Visit[]>([])
const loading = ref(false)
const activeTab = ref<'pending' | 'approved'>('pending')

const headerPaddingTop = ref(64)
try {
  const menu = uni.getMenuButtonBoundingClientRect()
  headerPaddingTop.value = menu.bottom + 8
} catch (_) {
  try {
    headerPaddingTop.value = (uni.getSystemInfoSync().statusBarHeight || 20) + 48
  } catch (_) {}
}

const roleText = computed(() => (userStore.user?.role === 'admin' ? '管理员' : '员工'))
const isAdmin = computed(() => userStore.user?.role === 'admin')

const pendingCount = computed(() => list.value.filter(v => v.status === 'pending').length)
const approvedCount = computed(() =>
  list.value.filter(v => v.status === 'approved' || v.status === 'completed').length
)

const tabList = computed(() =>
  list.value.filter(v =>
    activeTab.value === 'pending'
      ? v.status === 'pending'
      : v.status === 'approved' || v.status === 'completed'
  )
)

const fetchList = async () => {
  loading.value = true
  try {
    const res = await callFunction<Visit[]>('getVisits', {
      role: userStore.user?.role === 'admin' ? 'admin' : 'insider',
      userId: userStore.user?._id || '',
    })
    list.value = res || []
    console.log('[Workbench] fetched list statuses:', list.value.map(v => `${v._id}:${v.status}:${v.visitDate}`))
  } catch (err) {
    console.error('[Workbench] fetch error:', err)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    loading.value = false
    uni.stopPullDownRefresh()
  }
}

const now = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

const countdownOf = (visit: Visit) => getCountdownText(visit.visitDate, now.value)

const autoCompleteExpired = async () => {
  const expired = list.value.filter(
    v => v.status === 'approved' && !isNaN(parseVisitTime(v.visitDate)) && parseVisitTime(v.visitDate) <= now.value
  )
  if (!expired.length) return
  for (const v of expired) {
    try {
      await callFunction('updateVisitStatus', { visitId: v._id, newStatus: 'completed' })
    } catch (err) {
      console.error('[Workbench] auto complete error:', err)
    }
  }
  fetchList()
}

const startTick = () => {
  stopTick()
  tickTimer = setInterval(() => {
    now.value = Date.now()
    autoCompleteExpired()
  }, 30000)
}
const stopTick = () => {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

onShow(async () => {
  syncTabBarActive(instance, '/pages/workbench/index')
  if (userStore.user) {
    const changed = await userStore.refreshUser()
    if (changed) syncTabBarActive(instance, '/pages/workbench/index')
    now.value = Date.now()
    fetchList()
    fetchApplications()
    startTick()
  }
})

onHide(() => stopTick())

onPullDownRefresh(() => {
  fetchList()
  fetchApplications()
})

const updateStatus = async (visit: Visit, newStatus: 'approved' | 'rejected', extra?: Record<string, any>) => {
  try {
    await callFunction('updateVisitStatus', {
      visitId: visit._id,
      newStatus,
      ...(extra || {}),
    })
    const target = list.value.find(v => v._id === visit._id)
    if (target) target.status = newStatus
    uni.showToast({ title: newStatus === 'approved' ? '已批准' : '已拒绝', icon: 'success' })
  } catch (err) {
    console.error('[Workbench] updateStatus error:', err)
    uni.showToast({ title: err instanceof Error ? err.message : '操作失败', icon: 'none' })
  }
}

const handleApprove = (visit: Visit) => updateStatus(visit, 'approved')

const handleReject = (visit: Visit) => {
  uni.showModal({
    title: '拒绝原因',
    editable: true,
    placeholderText: '请输入拒绝原因（可选）',
    success: res => {
      if (res.confirm) updateStatus(visit, 'rejected', { rejectReason: res.content || '' })
    },
  })
}

const openDetail = (visit: Visit) => {
  uni.navigateTo({ url: `/pages/visit-detail/index?id=${visit._id || ''}` })
}

const goSupplement = () => uni.navigateTo({ url: '/pages/visit-supplement/index' })
const goInsiders = () => uni.switchTab({ url: '/pages/insiders/index' })
const goRecords = () => uni.switchTab({ url: '/pages/visits/index' })

const appList = ref<any[]>([])
const appActiveTab = ref<'pending' | 'approved' | 'rejected'>('pending')
const appTabList = computed(() => appList.value.filter(a => a.status === appActiveTab.value))
const appPendingCount = computed(() => appList.value.filter(a => a.status === 'pending').length)

const fetchApplications = async () => {
  if (userStore.user?.role !== 'admin') return
  try {
    const result = await callFunction<any[]>('getInsiderApplications', {})
    appList.value = result || []
  } catch (err) {
    console.error('[Workbench] fetch applications error:', err)
  }
}

const handleAppAction = (item: any, action: 'approve' | 'reject') => {
  const actionText = action === 'approve' ? '通过' : '拒绝'
  uni.showModal({
    title: '提示',
    content: `确定${actionText}【${item.name}】的内部员工申请吗？`,
    success: async (res: any) => {
      if (!res.confirm) return
      try {
        await callFunction('handleInsiderApplication', { id: item._id, action })
        uni.showToast({ title: `已${actionText}`, icon: 'success' })
        fetchApplications()
      } catch (err: any) {
        console.error('[Workbench] handle application error:', err)
        uni.showToast({ title: err?.message || '处理失败', icon: 'none' })
      }
    },
  })
}
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.header" :style="{ paddingTop: headerPaddingTop + 'px' }">
      <view :class="styles.headerInfo">
        <text :class="styles.headerTitle">访客预约审批小程序</text>
        <text :class="styles.headerSubtitle">内部人员端 · {{ roleText }}</text>
      </view>
      <image
        v-if="userStore.user?.avatar"
        :class="styles.headerAvatar"
        :src="userStore.user.avatar"
        mode="aspectFill"
      />
      <view v-else :class="styles.headerAvatar">{{ (userStore.user?.nickname || '访')[0] }}</view>
    </view>

    <view :class="styles.card">
      <view :class="styles.cardHeader">
        <text :class="styles.cardTitle">预约管理</text>
        <view :class="styles.tabs">
          <view
            :class="[styles.tab, activeTab === 'pending' ? styles.tabActive : '']"
            @tap="activeTab = 'pending'"
          >
            待审批 ({{ pendingCount }})
          </view>
          <view
            :class="[styles.tab, activeTab === 'approved' ? styles.tabActive : '']"
            @tap="activeTab = 'approved'"
          >
            已批准 ({{ approvedCount }})
          </view>
        </view>
      </view>

      <view v-if="tabList.length === 0 && !loading" :class="styles.empty">
        {{ activeTab === 'pending' ? '暂无待审批的预约' : '暂无已批准的预约' }}
      </view>

      <view v-for="visit in tabList" :key="visit._id" :class="styles.visitCard" @tap="openDetail(visit)">
        <view :class="styles.visitTop">
          <view :class="[styles.badge, activeTab === 'approved' ? styles.badgeOrange : '']">
            {{ (visit.visitorName || '访')[0] }}
          </view>
          <view :class="styles.visitTitle">
            <text :class="styles.visitorName">{{ visit.visitorName }}</text>
            <text :class="styles.visitorPhone">{{ visit.visitorPhone }}</text>
          </view>
        </view>
        <view :class="styles.visitGrid">
          <view :class="styles.gridItem">
            <text :class="styles.gridLabel">来访时间</text>
            <text :class="styles.gridValue">{{ visit.visitDate }}</text>
          </view>
          <view :class="styles.gridItem">
            <text :class="styles.gridLabel">来访地点</text>
            <text :class="styles.gridValue">{{ visit.hostDepartment || '-' }}</text>
          </view>
          <view :class="styles.gridItem">
            <text :class="styles.gridLabel">来访事由</text>
            <text :class="styles.gridValue">{{ visit.purpose }}</text>
          </view>
          <view :class="styles.gridItem">
            <text :class="styles.gridLabel">申请人</text>
            <text :class="styles.gridValue">{{ visit.visitorName }}</text>
          </view>
          <view :class="styles.gridItem">
            <text :class="styles.gridLabel">申请时间</text>
            <text :class="styles.gridValue">{{ formatDate(visit.createTime, 'YYYY-MM-DD HH:mm') }}</text>
          </view>
        </view>
        <text v-if="visit.status === 'approved' && countdownOf(visit)" :class="styles.countdown">
          距离到访：{{ countdownOf(visit) }}
        </text>
        <text v-else-if="visit.status === 'completed'" :class="styles.completedTag">已到访</text>
        <view v-if="visit.status === 'pending'" :class="styles.visitActions" @tap.stop>
          <button :class="styles.rejectBtn" @tap="handleReject(visit)">拒绝</button>
          <button :class="styles.approveBtn" @tap="handleApprove(visit)">批准</button>
        </view>
      </view>
    </view>

    <view v-if="isAdmin" :class="styles.card">
      <view :class="styles.cardHeader">
        <text :class="styles.cardTitle">员工申请管理</text>
        <view :class="styles.tabs">
          <view
            :class="[styles.tab, appActiveTab === 'pending' ? styles.tabActive : '']"
            @tap="appActiveTab = 'pending'"
          >
            待审批 ({{ appPendingCount }})
          </view>
          <view
            :class="[styles.tab, appActiveTab === 'approved' ? styles.tabActive : '']"
            @tap="appActiveTab = 'approved'"
          >
            已审批
          </view>
          <view
            :class="[styles.tab, appActiveTab === 'rejected' ? styles.tabActive : '']"
            @tap="appActiveTab = 'rejected'"
          >
            已拒绝
          </view>
        </view>
      </view>

      <view v-if="appTabList.length === 0 && !loading" :class="styles.empty">
        {{ appActiveTab === 'pending' ? '暂无待审批的申请' : appActiveTab === 'approved' ? '暂无已审批的申请' : '暂无已拒绝的申请' }}
      </view>

      <view v-for="app in appTabList" :key="app._id" :class="styles.visitCard">
        <view :class="styles.visitTop">
          <view :class="[styles.badge, appActiveTab !== 'pending' ? styles.badgeOrange : '']">
            {{ (app.name || '申')[0] }}
          </view>
          <view :class="styles.visitTitle">
            <text :class="styles.visitorName">{{ app.name }}</text>
            <text :class="styles.visitorPhone">微信昵称：{{ app.nickname || '—' }}</text>
          </view>
        </view>
        <view :class="styles.visitGrid">
          <view :class="styles.gridItem">
            <text :class="styles.gridLabel">手机号</text>
            <text :class="styles.gridValue">{{ app.phone || '-' }}</text>
          </view>
          <view :class="styles.gridItem">
            <text :class="styles.gridLabel">申请部门</text>
            <text :class="styles.gridValue">{{ app.department || '-' }}</text>
          </view>
          <view :class="styles.gridItem">
            <text :class="styles.gridLabel">申请时间</text>
            <text :class="styles.gridValue">{{ app.createTime || '-' }}</text>
          </view>
          <view v-if="app.status !== 'pending'" :class="styles.gridItem">
            <text :class="styles.gridLabel">处理时间</text>
            <text :class="styles.gridValue">{{ app.handleTime || '-' }}</text>
          </view>
        </view>
        <view v-if="app.status === 'pending'" :class="styles.visitActions">
          <button :class="styles.rejectBtn" @tap="handleAppAction(app, 'reject')">拒绝</button>
          <button :class="styles.approveBtn" @tap="handleAppAction(app, 'approve')">通过</button>
        </view>
      </view>
    </view>

    <view :class="styles.card">
      <text :class="styles.cardTitle">快捷操作</text>
      <view :class="styles.quickGrid">
        <view :class="styles.quickItem" @tap="goSupplement">
          <view :class="styles.quickIcon">📝</view>
          <text :class="styles.quickLabel">访客补录</text>
        </view>
        <view v-if="isAdmin" :class="styles.quickItem" @tap="goInsiders">
          <view :class="styles.quickIcon">👥</view>
          <text :class="styles.quickLabel">内部人员管理</text>
        </view>
        <view :class="styles.quickItem" @tap="goRecords">
          <view :class="styles.quickIcon">📊</view>
          <text :class="styles.quickLabel">审批记录</text>
        </view>
      </view>
    </view>

    <view :class="styles.bottomSpace" />
  </view>
</template>
