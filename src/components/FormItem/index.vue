<script setup lang="ts">
import styles from './index.module.scss'

const props = defineProps<{
  label: string
  required?: boolean
  error?: string
}>()
</script>

<template>
  <view :class="styles.wrap">
    <view :class="styles.labelRow">
      <text v-if="props.required" :class="styles.required">*</text>
      <text :class="styles.label">{{ props.label }}</text>
    </view>
    <view :class="styles.content">
      <slot />
    </view>
    <text v-if="props.error" :class="styles.error">{{ props.error }}</text>
  </view>
</template>
