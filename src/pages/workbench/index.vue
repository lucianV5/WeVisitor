<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { onShow, onHide, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import type { Visit } from '@/types'
import { useUserStore } from '@/store/user'
import { callFunction, getHostTmplId, getApplicantTmplId } from '@/services/cloud'
import { formatDate, syncTabBarActive, getCountdownText, parseVisitTime } from '@/utils'
import { useInfiniteList } from '@/composables/useInfiniteList'
import styles from './index.module.scss'

const instance = getCurrentInstance()
const userStore = useUserStore()

const activeTab = ref<'pending' | 'approved'>('pending')
const { list, loading, loadingMore, hasMore, fetchList: fetchVisits, loadMore: loadMoreVisits, setParams: setVisitParams } = useInfiniteList<Visit>('getVisits', {})

const headerPaddingTop = ref(64)
try {
  const menu = uni.getMenuButtonBoundingClientRect()
  headerPaddingTop.value = menu.bottom + 8
} catch (_) {
  try {
    headerPaddingTop.value = (uni.getSystemInfoSync().statusBarHeight || 20) + 48
  } catch (_) {}
}

const activeRole = computed(() => userStore.currentRole)
const isAdmin = computed(() => activeRole.value === 'admin')
const isInsider = computed(() => activeRole.value === 'insider')
const roleText = computed(() => isAdmin.value ? '管理员' : '内部员工')

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
  if (!isInsider.value) return
  setVisitParams({
    role: 'insider',
    userId: userStore.user?._id || '',
  })
  await fetchVisits(true)
  uni.stopPullDownRefresh()
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
    if (isInsider.value) {
      fetchList()
      startTick()
    }
    if (isAdmin.value) {
      fetchApplications()
    }
  }
})

onHide(() => stopTick())

onPullDownRefresh(() => {
  if (isInsider.value) fetchList()
  if (isAdmin.value) fetchApplications()
})
onReachBottom(() => {
  if (isInsider.value) loadMoreVisits()
  if (isAdmin.value) fetchApplications(false)
})

const updateStatus = async (visit: Visit, newStatus: 'approved' | 'rejected', extra?: Record<string, any>) => {
  // #ifdef MP-WEIXIN
  await new Promise<void>((resolve) => {
    uni.requestSubscribeMessage({
      tmplIds: [getHostTmplId(), getApplicantTmplId()],
      success: () => resolve(),
      fail: () => resolve(),
    })
  })
  // #endif
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

const enableNotifications = () => {
  // #ifdef MP-WEIXIN
  const hostId = getHostTmplId()
  const applicantId = getApplicantTmplId()
  uni.showModal({
    title: '开启消息提醒',
    content: '请在弹窗中勾选"总是保持以上选择"并点击"允许"，系统将自动积累通知额度。',
    confirmText: '知道了',
    showCancel: false,
    success: () => {
      uni.requestSubscribeMessage({
        tmplIds: [hostId, applicantId],
        success: (res: any) => {
          const hostOk = res[hostId] === 'accept'
          const applicantOk = res[applicantId] === 'accept'
          if (!hostOk && !applicantOk) {
            uni.showToast({ title: '未开启通知', icon: 'none' })
            return
          }
          uni.showLoading({ title: '积累额度中...' })
          let count = 1
          let failed = 0
          const loop = (remaining: number) => {
            if (remaining <= 0) {
              uni.hideLoading()
              uni.showModal({
                title: '通知额度已积累',
                content: `本次共积累 ${count} 次通知额度。\n建议每天打开小程序点一次"开启通知"保持额度充足。`,
                showCancel: false,
                confirmText: '好的',
              })
              return
            }
            uni.requestSubscribeMessage({
              tmplIds: [hostId, applicantId],
              success: () => {
                count++
                failed = 0
                setTimeout(() => loop(remaining - 1), 50)
              },
              fail: () => {
                failed++
                if (failed >= 2) {
                  uni.hideLoading()
                  uni.showModal({
                    title: '通知额度已积累',
                    content: `本次共积累 ${count} 次通知额度。\n建议每天打开小程序点一次"开启通知"保持额度充足。`,
                    showCancel: false,
                    confirmText: '好的',
                  })
                } else {
                  setTimeout(() => loop(remaining - 1), 50)
                }
              },
            })
          }
          loop(49)
        },
        fail: (err: any) => {
          const errMsg = String(err?.errMsg || err?.message || err || '')
          let tip = '授权失败'
          if (/always/.test(errMsg) || /20004/.test(errMsg)) {
            tip = '您之前选择了"总是拒绝"，请前往微信设置 → 隐私 → 授权管理中重置'
          } else if (/invalid|template|tmpl/i.test(errMsg)) {
            tip = '模板ID无效，请检查模板是否已审核通过'
          } else if (errMsg) {
            tip = errMsg.slice(0, 60)
          }
          uni.showModal({ title: '开启通知失败', content: tip, showCancel: false })
        },
      })
    },
  })
  // #endif
}

const appList = ref<any[]>([])
const appActiveTab = ref<'pending' | 'approved' | 'rejected'>('pending')
const appLoading = ref(false)
const appLoadingMore = ref(false)
const appHasMore = ref(true)
const appPage = ref(1)
const appTabList = computed(() => appList.value.filter(a => a.status === appActiveTab.value))
const appPendingCount = computed(() => appList.value.filter(a => a.status === 'pending').length)

const fetchApplications = async (reset = true) => {
  if (!isAdmin.value) return
  if (reset) {
    appPage.value = 1
    appHasMore.value = true
    appLoading.value = true
  } else {
    if (appLoadingMore.value || !appHasMore.value) return
    appLoadingMore.value = true
  }
  try {
    const result = await callFunction<{ list: any[]; total: number; hasMore: boolean }>('getInsiderApplications', {
      page: appPage.value,
      pageSize: 20,
    })
    if (result) {
      if (Array.isArray(result)) {
        if (reset) appList.value = result
        appHasMore.value = false
      } else {
        if (reset) appList.value = result.list || []
        else appList.value = [...appList.value, ...(result.list || [])]
        appHasMore.value = !!result.hasMore
        appPage.value++
      }
    } else {
      appHasMore.value = false
    }
  } catch (err) {
    console.error('[Workbench] fetch applications error:', err)
  } finally {
    appLoading.value = false
    appLoadingMore.value = false
    uni.stopPullDownRefresh()
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
        setTimeout(() => {
          if (isInsider.value) {
            fetchList()
            startTick()
          }
          if (isAdmin.value) {
            fetchApplications()
          }
        }, 300)
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
      <view :class="styles.headerRight">
        <view v-if="userStore.hasMultipleRoles" :class="styles.roleSwitchBtn" @tap="showRoleSwitcher">
          <text>切换角色</text>
        </view>
        <image
          v-if="userStore.user?.avatar"
          :class="styles.headerAvatar"
          :src="userStore.user.avatar"
          mode="aspectFill"
        />
        <view v-else :class="styles.headerAvatar">{{ (userStore.user?.nickname || '访')[0] }}</view>
      </view>
    </view>

    <!-- 快捷操作 -->
    <view :class="styles.card">
      <text :class="styles.cardTitle">快捷操作</text>
      <view :class="styles.quickGrid">
        <view :class="styles.quickItem" @tap="enableNotifications">
          <view :class="styles.quickIcon">🔔</view>
          <text :class="styles.quickLabel">开启通知</text>
        </view>
        <view v-if="isInsider" :class="styles.quickItem" @tap="goSupplement">
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

    <!-- 内部员工角色：访客预约审批 -->
    <view v-if="isInsider" :class="styles.card">
      <view :class="styles.cardHeader">
        <text :class="styles.cardTitle">预约管理</text>
        <view :class="styles.tabs">
          <view
            :class="[styles.tab, activeTab === 'pending' ? styles.tabActive : '']"
            @tap="activeTab = 'pending'"
          >
            待审批
          </view>
          <view
            :class="[styles.tab, activeTab === 'approved' ? styles.tabActive : '']"
            @tap="activeTab = 'approved'"
          >
            已批准
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
      <view v-if="loadingMore" :class="styles.loadingMore">加载中...</view>
      <view v-else-if="!hasMore && list.length > 0" :class="styles.noMore">没有更多了</view>
    </view>

    <!-- 管理员角色：员工申请管理 -->
    <view v-if="isAdmin" :class="styles.card">
      <view :class="styles.cardHeader">
        <text :class="styles.cardTitle">员工申请管理</text>
        <view :class="styles.tabs">
          <view
            :class="[styles.tab, appActiveTab === 'pending' ? styles.tabActive : '']"
            @tap="appActiveTab = 'pending'"
          >
            待审批
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
      <view v-if="appLoadingMore" :class="styles.loadingMore">加载中...</view>
      <view v-else-if="!appHasMore && appList.length > 0" :class="styles.noMore">没有更多了</view>
    </view>

    <view :class="styles.bottomSpace" />
  </view>
</template>
