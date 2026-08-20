<script setup lang="ts">
import type { VisitStatus } from '@/types'
import { getStatusText } from '@/utils'
import styles from './index.module.scss'

const props = defineProps<{
  status: VisitStatus
  size?: 'sm' | 'md'
}>()

const statusClass = computed(() => [
  styles.tag,
  styles[props.status],
  props.size === 'sm' ? styles.sm : '',
])
</script>

<template>
  <view :class="statusClass">
    <text :class="styles.text">{{ getStatusText(props.status) }}</text>
  </view>
</template>
