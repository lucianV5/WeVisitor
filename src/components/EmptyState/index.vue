<script setup lang="ts">
import styles from './index.module.scss'
const props = withDefaults(defineProps<{ text?: string; icon?: string }>(), {
  text: '暂无数据',
  icon: '📭',
})
</script>

<template>
  <view :class="styles.wrap">
    <text :class="styles.icon">{{ props.icon }}</text>
    <text :class="styles.text">{{ props.text }}</text>
  </view>
</template>
