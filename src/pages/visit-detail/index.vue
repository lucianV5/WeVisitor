<script setup lang="ts">
import { onLoad, onShow } from '@dcloudio/uni-app'
import type { Visit, VisitStatus } from '@/types'
import { useUserStore } from '@/store/user'
import { callFunction } from '@/services/cloud'
import { formatDate, formatTime } from '@/utils'
import styles from './index.module.scss'

const userStore = useUserStore()
const loading = ref(false)

const fallBackVisit: Visit = {
  _id: 'visit_001',
  visitorName: '赵雪',
  visitorPhone: '16873750989',
  visitorCount: 2,
  hostId: 'user_001',
  hostName: '张华山',
  hostDepartment: '综合管理部',
  visitDate: '2026-08-11 10:00',
  purpose: '商务洽谈合作',
  remark: '无',
  status: 'pending',
  createTime: '2026-08-10 09:30:00',
}

const visit = ref<Visit>(fallBackVisit)

const visitId = ref('')

const loadVisit = async () => {
  if (!visitId.value) return
  try {
    loading.value = true
    const role = userStore.currentRole
    const uid = userStore.user?._id || ''
    const list = await callFunction<Visit[]>('getVisits', { role, userId: uid })
    const found = (list || []).find(v => v._id === visitId.value)
    if (found) {
      visit.value = found
    }
  } catch (err) {
    console.error('[VisitDetail] load error:', err)
  } finally {
    loading.value = false
  }
}

onLoad((q: any) => {
  visitId.value = q?.id || ''
  loadVisit()
})

onShow(() => {
  if (visitId.value) loadVisit()
})

const isHost = computed(() => userStore.currentRole !== 'visitor')
const showFooter = computed(() => !!userStore.user)
const canApprove = computed(
  () => isHost.value && visit.value.status === 'pending' && !!visit.value._id
)

const handleStatus = async (status: VisitStatus, extra?: Record<string, any>) => {
  if (!userStore.user) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  loading.value = true
  uni.showLoading({ title: '处理中...' })
  try {
    await callFunction('updateVisitStatus', {
      visitId: visit.value._id,
      newStatus: status,
      ...(extra || {}),
    })
    uni.hideLoading()
    uni.showToast({
      title:
        status === 'approved' ? '已确认' : status === 'rejected' ? '已拒绝' : '操作成功',
      icon: 'success',
    })
    setTimeout(() => uni.navigateBack(), 600)
  } catch (err) {
    console.error('[VisitDetail] status error:', err)
    uni.hideLoading()
    uni.showToast({ title: '操作失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

const handleApprove = () => handleStatus('approved')
const handleReject = () => {
  uni.showModal({
    title: '拒绝预约',
    editable: true,
    placeholderText: '请输入拒绝原因（选填）',
    success: (res: any) => {
      if (res.confirm) {
        handleStatus('rejected', { rejectReason: res.content || '暂不接受此预约' })
      }
    },
  })
}

const visitDateOnly = computed(() => {
  const d = visit.value.visitDate || ''
  return d.split(' ')[0] || d
})
const visitTimeOnly = computed(() => {
  const d = visit.value.visitDate || ''
  return d.split(' ')[1] || ''
})
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.form">
      <view :class="styles.field">
        <text :class="styles.label">访客姓名</text>
        <view :class="styles.valueWrap">
          <text :class="styles.value">{{ visit.visitorName || '—' }}</text>
        </view>
      </view>

      <view :class="styles.field">
        <text :class="styles.label">手机号码</text>
        <view :class="styles.valueWrap">
          <text :class="styles.value">{{ visit.visitorPhone || '—' }}</text>
        </view>
      </view>

      <view :class="styles.fieldRow">
        <view :class="styles.field">
          <text :class="styles.label">随行人数</text>
          <view :class="styles.valueWrap">
            <text :class="styles.value">{{ visit.visitorCount || '—' }}</text>
          </view>
        </view>
        <view :class="styles.field">
          <text :class="styles.label">来访时间</text>
          <view :class="styles.valueWrap">
            <text :class="styles.value" v-if="visitTimeOnly">
              {{ visitDateOnly }} {{ visitTimeOnly }}
            </text>
            <text :class="styles.value" v-else>{{ visitDateOnly || '—' }}</text>
          </view>
        </view>
      </view>

      <view :class="styles.field">
        <text :class="styles.label">接待人</text>
        <view :class="styles.valueWrap">
          <text :class="styles.value">{{ visit.hostName || '—' }}</text>
        </view>
      </view>

      <view :class="styles.field">
        <text :class="styles.label">来访事由</text>
        <view :class="styles.textareaWrap">
          <text :class="styles.value">{{ visit.purpose || '—' }}</text>
        </view>
      </view>

      <view :class="styles.field">
        <text :class="styles.label">备注</text>
        <view :class="styles.textareaWrap">
          <text :class="styles.value">{{ visit.remark || '无' }}</text>
        </view>
      </view>
    </view>

    <view v-if="canApprove" :class="styles.footerBar">
      <button :class="[styles.btn, styles.btnApprove]" :loading="loading" @click="handleApprove">
        ✓ 确认
      </button>
      <button :class="[styles.btn, styles.btnReject]" :loading="loading" @click="handleReject">
        × 拒绝
      </button>
    </view>
  </view>
</template>
