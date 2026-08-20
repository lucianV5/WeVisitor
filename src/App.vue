<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'

onLaunch(() => {
  console.log('[App] Launch')
  try {
    const legacyUser = uni.getStorageSync('user')
    const legacyId = legacyUser && typeof legacyUser === 'object' ? (legacyUser as any)._id : undefined
    const legacyNick = legacyUser && typeof legacyUser === 'object' ? (legacyUser as any).nickname : undefined
    if (legacyId === 'user_001' || legacyNick === '王宇峰') {
      uni.removeStorageSync('user')
      uni.removeStorageSync('currentRole')
      console.log('[App] Cleared legacy mock user cache')
    }
  } catch (_) {}
})

onShow(() => {
  const store = useUserStore()
  if (store.user) {
    console.log('[App] onShow restored user:', store.user.nickname)
  }
})

onHide(() => {})
</script>

<style lang="scss">
@import '@/styles/variables.scss';
@import '@/styles/theme.scss';

page {
  background-color: $color-bg-page;
  color: $color-text-primary;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: $font-base;
  box-sizing: border-box;
}

/* #ifdef H5 */
*, *::before, *::after {
  box-sizing: border-box;
}
/* #endif */

view, text, image, input, textarea, button, scroll-view {
  box-sizing: border-box;
}
</style>
