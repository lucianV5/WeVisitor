<script setup lang="ts">
import type { Visit } from '@/types'
import { getCountdownText } from '@/utils'
import StatusTag from '@/components/StatusTag/index.vue'
import styles from './index.module.scss'

const props = defineProps<{
  visit: Visit
  role: 'visitor' | 'insider'
  now?: number
}>()

const countdown = computed(() =>
  props.visit.status === 'approved'
    ? getCountdownText(props.visit.visitDate, props.now || Date.now())
    : ''
)

const emit = defineEmits<{
  (e: 'click', visit: Visit): void
  (e: 'edit', visit: Visit): void
  (e: 'delete', visit: Visit): void
  (e: 'approve', visit: Visit): void
  (e: 'reject', visit: Visit): void
  (e: 'signIn', visit: Visit): void
}>()

const onClick = () => emit('click', props.visit)
const stop = (e: Event) => e.stopPropagation && e.stopPropagation()
const onEdit = (e: Event) => {
  stop(e)
  emit('edit', props.visit)
}
const onDelete = (e: Event) => {
  stop(e)
  emit('delete', props.visit)
}
const onApprove = (e: Event) => {
  stop(e)
  emit('approve', props.visit)
}
const onReject = (e: Event) => {
  stop(e)
  emit('reject', props.visit)
}
const onSignIn = (e: Event) => {
  stop(e)
  emit('signIn', props.visit)
}

const hostLine = computed(() => `${props.visit.hostName} 接待`)
const visitDateTime = computed(() => props.visit.visitDate || '')
const purpose = computed(() => props.visit.purpose || '')
const applicant = computed(() => props.visit.visitorName || '')
const rejectReason = computed(() => props.visit.rejectReason || '')
</script>

<template>
  <view :class="styles.card" @tap="onClick">
    <view :class="styles.header">
      <view :class="styles.headerLeft">
        <view :class="styles.avatar">
          <text :class="styles.avatarText">{{ hostLine.charAt(0) }}</text>
        </view>
        <text :class="styles.hostName">{{ hostLine }}</text>
      </view>
      <StatusTag :status="visit.status" size="sm" />
    </view>

    <view :class="styles.info">
      <view :class="styles.row">
        <text :class="styles.label">来访时间：</text>
        <text :class="styles.value">{{ visitDateTime }}</text>
      </view>
      <view v-if="countdown" :class="styles.row">
        <text :class="styles.label">距离到访：</text>
        <text :class="styles.countdown">{{ countdown }}</text>
      </view>
      <view :class="styles.row">
        <text :class="styles.label">来访事由：</text>
        <text :class="styles.value">{{ purpose }}</text>
      </view>
      <view :class="styles.row">
        <text :class="styles.label">所在公司：</text>
        <text :class="styles.value">{{ visit.company || '—' }}</text>
      </view>
      <view :class="styles.row">
        <text :class="styles.label">申 请 人：</text>
        <text :class="styles.value">{{ applicant }}</text>
      </view>
      <view v-if="visit.status === 'rejected' && rejectReason" :class="styles.row">
        <text :class="styles.label">拒绝原因：</text>
        <text :class="styles.value">{{ rejectReason }}</text>
      </view>
    </view>

    <view :class="styles.actions">
      <!-- Visitor view actions -->
      <template v-if="role === 'visitor'">
        <view :class="styles.actionBtn" @tap.stop="onEdit">详情/修改</view>
        <view v-if="visit.status === 'pending'" :class="styles.actionBtn" @tap.stop="onDelete">撤销</view>
      </template>
      <!-- Insider view actions -->
      <template v-else>
        <template v-if="visit.status === 'pending'">
          <view :class="[styles.actionBtn, styles.actionBtnPrimary]" @tap.stop="onApprove">✓ 确认</view>
          <view :class="styles.actionBtn" @tap.stop="onReject">× 拒绝</view>
        </template>
        <template v-else-if="visit.status === 'approved'">
          <view :class="[styles.actionBtn, styles.actionBtnMuted]" @tap.stop="onSignIn">已来访</view>
        </template>
        <template v-else-if="visit.status === 'completed'">
          <view :class="[styles.actionBtn, styles.actionBtnMuted]">已到访</view>
        </template>
      </template>
    </view>
  </view>
</template>
