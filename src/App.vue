<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getHostTmplId, getApplicantTmplId } from '@/services/cloud'

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
    // #ifdef MP-WEIXIN
    const hostId = getHostTmplId()
    const applicantId = getApplicantTmplId()
    if (hostId || applicantId) {
      const tmplIds = [hostId, applicantId].filter(Boolean) as string[]
      let count = 0
      let failed = 0
      const loop = (remaining: number) => {
        if (remaining <= 0) {
          console.log('[App] onShow subscribe quota accumulated:', count)
          return
        }
        uni.requestSubscribeMessage({
          tmplIds,
          success: () => {
            count++
            failed = 0
            setTimeout(() => loop(remaining - 1), 50)
          },
          fail: () => {
            failed++
            if (failed >= 2) {
              console.log('[App] onShow subscribe quota stopped at:', count)
              return
            }
            setTimeout(() => loop(remaining - 1), 50)
          },
        })
      }
      loop(49)
    }
    // #endif
  }
})

onHide(() => {})
</script>

<style lang="scss">
@use '@/styles/variables.scss' as *;
@use '@/styles/theme.scss' as *;

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
