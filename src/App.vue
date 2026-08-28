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

onShow(async () => {
  const store = useUserStore()
  if (store.user) {
    uni.showLoading({ title: '验证中...', mask: true })
    console.log('[App] onShow validating user:', store.user.nickname)
    const result = await store.refreshUser()
    uni.hideLoading()
    console.log('[App] onShow refreshUser result:', result)
    if (result === null) {
      console.log('[App] onShow user invalid (deleted?), redirecting to login')
      store.logout()
      uni.reLaunch({ url: '/pages/index/index' })
      return
    }
    if (result === true) {
      console.log('[App] onShow user data changed, role:', store.user?.role)
      const role = store.user?.role
      if (role !== 'insider' && role !== 'admin') {
        const currentPages = getCurrentPages()
        const currentPage = currentPages[currentPages.length - 1]
        const currentRoute = currentPage ? '/' + currentPage.route : ''
        if (currentRoute === '/pages/workbench/index' || currentRoute === '/pages/insiders/index') {
          uni.switchTab({ url: '/pages/visits/index' })
        }
      }
    }
    // #ifdef MP-WEIXIN
    if (uni.getStorageSync('wevisitor_notify_authorized')) {
      const hostId = getHostTmplId()
      const applicantId = getApplicantTmplId()
      if (hostId || applicantId) {
        const tmplIds = [hostId, applicantId].filter(Boolean) as string[]
        let failed = 0
        const loop = (remaining: number) => {
          if (remaining <= 0) return
          uni.requestSubscribeMessage({
            tmplIds,
            success: () => { failed = 0; setTimeout(() => loop(remaining - 1), 50) },
            fail: () => { failed++; if (failed >= 2) return; setTimeout(() => loop(remaining - 1), 50) },
          })
        }
        loop(49)
      }
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
