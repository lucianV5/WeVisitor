<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import type { Insider } from '@/types'
import { callFunction } from '@/services/cloud'
import { validatePhone, syncTabBarActive } from '@/utils'
import { getApplicantTmplId } from '@/services/cloud'
import EmptyState from '@/components/EmptyState/index.vue'
import styles from './index.module.scss'

const instance = getCurrentInstance()
const userStore = useUserStore()

const form = reactive({
  visitorName: '',
  visitorPhone: '',
  visitorCount: 1,
  hostId: '',
  hostName: '',
  visitDate: '',
  purpose: '',
  remark: '',
})

const errors = reactive<Record<string, string>>({})
const insiders = ref<Insider[]>([])
const submitting = ref(false)
const hostIndex = ref<number>(-1)

const getToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const loadInsiders = async () => {
  try {
    const list = await callFunction<Insider[]>('getInsiders', {})
    insiders.value = list || []
  } catch (err) {
    console.error('[Appointment] load insiders error:', err)
  }
}

const prefillFromUser = () => {
  const user = userStore.user
  if (!user) return
  if (userStore.currentRole === 'visitor') {
    form.visitorName = user.name || ''
    form.visitorPhone = user.phone || ''
  } else {
    form.hostId = user._id || ''
    form.hostName = user.name || user.nickname || ''
    const idx = insiders.value.findIndex(i => i._id === user._id)
    if (idx >= 0) hostIndex.value = idx
  }
}

const resetForm = () => {
  form.visitorName = ''
  form.visitorPhone = ''
  form.visitorCount = 1
  form.hostId = ''
  form.hostName = ''
  form.visitDate = ''
  form.purpose = ''
  form.remark = ''
  datePart.value = ''
  timePart.value = ''
  hostIndex.value = -1
  Object.keys(errors).forEach(k => delete errors[k])
}

onMounted(async () => {
  await loadInsiders()
  prefillFromUser()
})

onShow(() => {
  syncTabBarActive(instance, '/pages/appointment/index')
  if (!userStore.user) {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  prefillFromUser()
})

const hostRange = computed(() => insiders.value.map(i => `${i.name} (${i.department})`))

const validate = () => {
  const newErrors: Record<string, string> = {}
  if (!form.visitorName.trim()) newErrors.visitorName = '请输入访客姓名'
  if (!form.visitorPhone.trim()) newErrors.visitorPhone = '请输入手机号'
  else if (!validatePhone(form.visitorPhone)) newErrors.visitorPhone = '手机号格式不正确'
  if (!form.visitorCount || form.visitorCount < 1) newErrors.visitorCount = '请输入随行人数'
  if (!form.hostId) newErrors.hostId = '请选择接待人'
  if (!form.visitDate) newErrors.visitDate = '请选择来访时间'
  if (!form.purpose.trim()) newErrors.purpose = '请输入来访事由'
  Object.keys(errors).forEach(k => delete errors[k])
  Object.assign(errors, newErrors)
  return Object.keys(newErrors).length === 0
}

const handleSubmit = async () => {
  if (!validate()) {
    uni.showToast({ title: '请完善表单信息', icon: 'none' })
    return
  }
  if (!userStore.user) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (!userStore.user.name?.trim() || !userStore.user.phone?.trim()) {
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
    const hostInfo = insiders.value.find(i => i._id === form.hostId)
    const params = {
      ...form,
      hostName: hostInfo?.name || form.hostName,
      hostDepartment: hostInfo?.department,
      submitterRole: userStore.currentRole || 'visitor',
    }

    // #ifdef MP-WEIXIN
    await new Promise<void>((resolve) => {
      uni.requestSubscribeMessage({
        tmplIds: [getApplicantTmplId()],
        success: () => resolve(),
        fail: () => resolve(),
      })
    })
    // #endif

    await callFunction('createVisit', params)
    uni.hideLoading()
    resetForm()
    uni.showModal({
      title: '提交成功',
      content: '预约信息已提交，请等待接待人确认',
      showCancel: false,
      confirmText: '好的',
      success: () => {
        uni.switchTab({ url: '/pages/visits/index' })
      },
    })
  } catch (err) {
    console.error('[Appointment] submit error:', err)
    uni.hideLoading()
    uni.showToast({ title: '提交失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

const onChange = (field: string, value: any) => {
  ;(form as any)[field] = value
  if (errors[field]) delete errors[field]
}

const onVisitorNameInput = (e: any) => onChange('visitorName', e.detail.value)
const onVisitorPhoneInput = (e: any) => onChange('visitorPhone', e.detail.value)
const onPurposeInput = (e: any) => onChange('purpose', e.detail.value)
const onRemarkInput = (e: any) => onChange('remark', e.detail.value)
const onCountInput = (e: any) => {
  const v = e.detail.value
  const num = v === '' || v == null ? '' : Number(v)
  onChange('visitorCount', isNaN(num as number) ? '' : num)
}
const handleHostSelect = (e: any) => {
  const idx = Number(e.detail.value)
  hostIndex.value = idx
  const sel = insiders.value[idx]
  if (sel) {
    form.hostId = sel._id || ''
    form.hostName = sel.name
    if (errors.hostId) delete errors.hostId
  }
}
const padTwo = (n: number) => String(n).padStart(2, '0')
const currentDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`
}
const currentTime = () => {
  const d = new Date()
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`
}
const datePart = ref('')
const timePart = ref('')
const datePickerValue = computed(() => datePart.value)
const timePickerValue = computed(() => timePart.value)
const composeVisitDate = () => {
  onChange('visitDate', datePart.value && timePart.value ? `${datePart.value} ${timePart.value}` : '')
}
const handleDateChange = (e: any) => {
  datePart.value = e.detail.value
  composeVisitDate()
}
const handleTimeChange = (e: any) => {
  timePart.value = e.detail.value
  composeVisitDate()
}
const handleDateTap = () => {
  if (!datePart.value) datePart.value = currentDate()
}
const handleTimeTap = () => {
  if (!timePart.value) timePart.value = currentTime()
}
</script>

<template>
  <view :class="styles.page">
    <template v-if="userStore.user">
    <view :class="styles.form">
      <view :class="styles.field">
        <view :class="styles.labelRow">
          <text :class="styles.required">*</text>
          <text :class="styles.label">访客姓名</text>
        </view>
        <view :class="styles.inputWrap">
          <input
            :class="styles.input"
            placeholder="请输入"
            :value="form.visitorName"
            @input="onVisitorNameInput"
          />
        </view>
        <text v-if="errors.visitorName" :class="styles.error">{{ errors.visitorName }}</text>
      </view>

      <view :class="styles.field">
        <view :class="styles.labelRow">
          <text :class="styles.required">*</text>
          <text :class="styles.label">手机号码</text>
        </view>
        <view :class="styles.inputWrap">
          <input
            :class="styles.input"
            type="number"
            placeholder="请输入"
            :value="form.visitorPhone"
            maxlength="11"
            @input="onVisitorPhoneInput"
          />
        </view>
        <text v-if="errors.visitorPhone" :class="styles.error">{{ errors.visitorPhone }}</text>
      </view>

      <view :class="styles.field">
        <view :class="styles.labelRow">
          <text :class="styles.label">来访人数</text>
        </view>
        <view :class="styles.inputWrap">
          <input
            :class="styles.input"
            type="number"
            placeholder="请输入"
            :value="form.visitorCount"
            @input="onCountInput"
          />
        </view>
        <text v-if="errors.visitorCount" :class="styles.error">{{ errors.visitorCount }}</text>
      </view>

      <view :class="styles.field">
        <view :class="styles.labelRow">
          <text :class="styles.required">*</text>
          <text :class="styles.label">来访时间</text>
        </view>
        <view :class="styles.inputWrap">
          <picker mode="date" :start="getToday()" :value="datePickerValue" @change="handleDateChange" @click="handleDateTap" :class="styles.pickerHalf">
            <view :class="styles.pickerInner">
              <text :class="styles.pickerPrefix">日期：</text>
              <text v-if="datePart" :class="styles.pickerValue">{{ datePart }}</text>
              <text v-else :class="styles.pickerPlaceholder">请选择</text>
            </view>
          </picker>
          <view :class="styles.pickerGap" />
          <picker mode="time" :value="timePickerValue" @change="handleTimeChange" @click="handleTimeTap" :class="styles.pickerHalf">
            <view :class="styles.pickerInner">
              <text :class="styles.pickerPrefix">时间：</text>
              <text v-if="timePart" :class="styles.pickerValue">{{ timePart }}</text>
              <text v-else :class="styles.pickerPlaceholder">请选择</text>
            </view>
          </picker>
        </view>
        <text v-if="errors.visitDate" :class="styles.error">{{ errors.visitDate }}</text>
      </view>

      <view :class="styles.field">
        <view :class="styles.labelRow">
          <text :class="styles.required">*</text>
          <text :class="styles.label">接待人</text>
        </view>
        <picker
          mode="selector"
          :range="hostRange"
          :value="hostIndex >= 0 ? hostIndex : 0"
          @change="handleHostSelect"
        >
          <view :class="styles.inputWrap">
            <template v-if="form.hostName">
              <text :class="styles.valueText">{{ form.hostName }}</text>
            </template>
            <template v-else>
              <text :class="styles.placeholder">请选择</text>
            </template>
            <text :class="styles.arrow">›</text>
          </view>
        </picker>
        <text v-if="errors.hostId" :class="styles.error">{{ errors.hostId }}</text>
      </view>

      <view :class="styles.field">
        <view :class="styles.labelRow">
          <text :class="styles.required">*</text>
          <text :class="styles.label">来访事由</text>
        </view>
        <view :class="styles.textareaWrap">
          <textarea
            :class="styles.textarea"
            placeholder="请输入"
            :value="form.purpose"
            :maxlength="500"
            @input="onPurposeInput"
          />
        </view>
        <text v-if="errors.purpose" :class="styles.error">{{ errors.purpose }}</text>
      </view>

      <view :class="styles.field">
        <view :class="styles.labelRow">
          <text :class="styles.label">备注</text>
        </view>
        <view :class="styles.textareaWrap">
          <textarea
            :class="styles.textarea"
            placeholder="如有特殊需求请说明"
            :value="form.remark"
            maxlength="200"
            @input="onRemarkInput"
          />
        </view>
      </view>
    </view>

    <view :class="styles.footerBar">
      <button
        :class="[styles.submitBtn, submitting ? styles.disabled : '']"
        :loading="submitting"
        :disabled="submitting"
        @click="handleSubmit"
      >
        提交
      </button>
    </view>
    </template>
    <EmptyState v-else text="请先登录" icon="🔒" />
  </view>
</template>
