<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { callFunction } from '@/services/cloud'
import { validatePhone, DEPARTMENT_OPTIONS } from '@/utils'
import styles from './index.module.scss'

const DEPARTMENTS = DEPARTMENT_OPTIONS.map(o => o.name)

const userStore = useUserStore()

const form = reactive({
  name: '',
  phone: '',
  department: '',
})
const errors = reactive<Record<string, string>>({})
const deptIndex = ref(0)
const status = ref('')
const loading = ref(true)
const submitting = ref(false)

const onNameInput = (e: any) => {
  form.name = e.detail.value
  if (errors.name) delete errors.name
}
const onPhoneInput = (e: any) => {
  form.phone = e.detail.value
  if (errors.phone) delete errors.phone
}
const handleDeptPick = (e: any) => {
  const idx = Number(e.detail.value)
  deptIndex.value = idx
  form.department = DEPARTMENTS[idx]
  if (errors.department) delete errors.department
}

const loadStatus = async () => {
  loading.value = true
  try {
    const app = await callFunction<any>('getMyInsiderApplication', {})
    status.value = app?.status || ''
    if (status.value === 'approved') {
      uni.showToast({ title: '您已是内部员工', icon: 'success' })
      setTimeout(() => uni.switchTab({ url: '/pages/workbench/index' }), 800)
      return
    }
    if (status.value === 'rejected') {
      // stay on form, let user re-apply
    }
  } catch (err) {
    console.error('[InsiderApply] load status error:', err)
  } finally {
    loading.value = false
  }
}

onLoad(() => {
  loadStatus()
})

const validate = () => {
  const newErrors: Record<string, string> = {}
  if (!form.name.trim()) newErrors.name = '请输入姓名'
  if (!form.phone.trim()) newErrors.phone = '请输入手机号'
  else if (!validatePhone(form.phone.trim())) newErrors.phone = '手机号格式不正确'
  if (!form.department) newErrors.department = '请选择部门'
  Object.keys(errors).forEach(k => delete errors[k])
  Object.assign(errors, newErrors)
  return Object.keys(newErrors).length === 0
}

const handleSubmit = async () => {
  if (!validate()) {
    uni.showToast({ title: '请完善申请信息', icon: 'none' })
    return
  }
  if (!userStore.user?.name?.trim() || !userStore.user?.phone?.trim()) {
    uni.showModal({
      title: '提示',
      content: '个人资料还未填写，请先完善真实姓名和手机号后再进行操作。',
      confirmText: '去填写',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) uni.navigateTo({ url: '/pages/profile-edit/index' })
      },
    })
    return
  }
  submitting.value = true
  uni.showLoading({ title: '提交中...' })
  try {
    await callFunction('applyInsider', {
      name: form.name.trim(),
      phone: form.phone.trim(),
      department: form.department,
    })
    uni.hideLoading()
    status.value = 'pending'
    uni.showToast({ title: '申请已提交', icon: 'success' })
  } catch (err: any) {
    console.error('[InsiderApply] submit error:', err)
    uni.hideLoading()
    uni.showToast({ title: err?.message || '提交失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

const goVisitorHome = () => {
  uni.switchTab({ url: '/pages/visits/index' })
}

const goLogin = () => {
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<template>
  <view :class="styles.page">
    <view v-if="!loading && status === 'pending'" :class="styles.statusCard">
      <text :class="styles.statusIcon">⏳</text>
      <text :class="styles.statusTitle">申请审核中</text>
      <text :class="styles.statusDesc">您的内部员工申请已提交，请等待管理员确认。审核通过后重新进入即可使用内部员工功能。</text>
      <view :class="styles.statusBtn" @tap="goVisitorHome">先以访客身份进入</view>
      <view :class="styles.linkBtn" @tap="goLogin">返回登录页</view>
    </view>

    <view v-else-if="!loading" :class="styles.formCard">
      <view v-if="status === 'rejected'" :class="styles.rejectedTip">
        您上次的申请未通过，如需申请请重新填写并提交。
      </view>
      <view :class="styles.tip">
        请填写与单位登记一致的信息，提交后由管理员审核确认。
      </view>

      <view :class="styles.formRow">
        <view :class="styles.formLabel">
          <text :class="styles.required">*</text>
          <text>姓 名：</text>
        </view>
        <input
          :class="styles.input"
          placeholder="请输入"
          :value="form.name"
          maxlength="20"
          @input="onNameInput"
        />
      </view>
      <text v-if="errors.name" :class="styles.error">{{ errors.name }}</text>

      <view :class="styles.formRow">
        <view :class="styles.formLabel">
          <text :class="styles.required">*</text>
          <text>手机号：</text>
        </view>
        <input
          :class="styles.input"
          type="number"
          placeholder="请输入"
          :value="form.phone"
          maxlength="11"
          @input="onPhoneInput"
        />
      </view>
      <text v-if="errors.phone" :class="styles.error">{{ errors.phone }}</text>

      <view :class="styles.formRow">
        <view :class="styles.formLabel">
          <text :class="styles.required">*</text>
          <text>部 门：</text>
        </view>
        <picker
          mode="selector"
          :range="DEPARTMENTS"
          :value="deptIndex"
          @change="handleDeptPick"
        >
          <view :class="styles.pickerRow">
            <text v-if="form.department" :class="styles.valueText">{{ form.department }}</text>
            <text v-else :class="styles.placeholder">请选择</text>
            <text :class="styles.arrow">›</text>
          </view>
        </picker>
      </view>
      <text v-if="errors.department" :class="styles.error">{{ errors.department }}</text>

      <button
        :class="[styles.submitBtn, submitting ? styles.disabled : '']"
        :disabled="submitting"
        @tap="handleSubmit"
      >
        提交申请
      </button>
      <view :class="styles.linkBtn" @tap="goVisitorHome">先以访客身份进入</view>
      <view :class="styles.linkBtn" @tap="goLogin">返回登录页</view>
    </view>
  </view>
</template>
