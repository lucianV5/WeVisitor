<script setup lang="ts">
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import { callFunction } from '@/services/cloud'
import styles from './index.module.scss'

const qrSrc = ref('')
const loading = ref(true)
const errorMsg = ref('')

onLoad(() => {
  fetchQRCode()
})

onShareAppMessage(() => ({
  title: '访客预约系统',
  path: '/pages/index/index?role=visitor',
}))

const fetchQRCode = async () => {
  loading.value = true
  errorMsg.value = ''
  try {
    const result = await callFunction<string>('getVisitQRCode', {})
    if (result && typeof result === 'string' && result.startsWith('data:image')) {
      qrSrc.value = result
    } else {
      errorMsg.value = '生成二维码失败，请稍后重试'
    }
  } catch (err: any) {
    console.error('[QRCode] fetch error:', err)
    errorMsg.value = err?.message || '生成二维码失败'
  } finally {
    loading.value = false
  }
}

const handleSave = () => {
  if (!qrSrc.value) return
  // #ifdef MP-WEIXIN
  uni.showLoading({ title: '保存中...' })
  const base64Data = qrSrc.value.replace(/^data:image\/\w+;base64,/, '')
  const fs = uni.getFileSystemManager()
  const filePath = `${wx.env.USER_DATA_PATH}/qrcode_${Date.now()}.png`
  fs.writeFile({
    filePath,
    data: base64Data,
    encoding: 'base64',
    success: () => {
      uni.saveImageToPhotosAlbum({
        filePath,
        success: () => {
          uni.hideLoading()
          uni.showToast({ title: '已保存到相册', icon: 'success' })
        },
        fail: (err: any) => {
          uni.hideLoading()
          if (err.errMsg && err.errMsg.includes('auth deny')) {
            uni.showToast({ title: '请授权保存到相册', icon: 'none' })
          } else {
            uni.showToast({ title: '保存失败，请检查相册权限', icon: 'none' })
          }
        },
      })
    },
    fail: () => {
      uni.hideLoading()
      uni.showToast({ title: '保存失败', icon: 'none' })
    },
  })
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title: '请长按图片保存', icon: 'none' })
  // #endif
}
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.card">
      <text :class="styles.title">访客预约二维码</text>
      <text :class="styles.desc">访客扫描此二维码即可进入小程序，以访客身份进行预约操作</text>

      <view v-if="loading" :class="styles.loading">生成中...</view>
      <text v-else-if="errorMsg" :class="styles.errorTip">{{ errorMsg }}</text>
      <image
        v-else
        :class="styles.qrImage"
        :src="qrSrc"
        mode="aspectFit"
        :show-menu-by-longpress="true"
      />

      <button
        v-if="qrSrc"
        :class="styles.saveBtn"
        @tap="handleSave"
      >
        保存到相册
      </button>

      <button
        :class="styles.shareBtn"
        open-type="share"
      >
        分享给微信好友
      </button>

      <text :class="styles.hint">提示：访客扫码或点击分享卡片后，将以访客身份进入预约页面</text>
    </view>
  </view>
</template>
