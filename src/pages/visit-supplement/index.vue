<script setup lang="ts">
import { useUserStore } from '@/store/user'
import type { Insider, VisitStatus } from '@/types'
import { callFunction } from '@/services/cloud'
import { validatePhone, formatDate } from '@/utils'
import styles from './index.module.scss'

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

const padTwo = (n: number) => String(n).padStart(2, '0')
const currentDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`
}
const currentTime = () => {
  const d = new Date()
  return `${padTwo(d.getHours())}:${padTwo(d.getMinutes())}`
}
const datePart = ref(currentDate())
const timePart = ref(currentTime())
const composeVisitDate = () => {
  onChange('visitDate', datePart.value && timePart.value ? `${datePart.value} ${timePart.value}` : '')
}

const getNowStr = () => formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')

const loadInsiders = async () => {
  try {
    const list = await callFunction<Insider[]>('getInsiders', {})
    insiders.value = list || []
  } catch (err) {
    console.error('[VisitSupplement] load insiders error:', err)
  }
}

onMounted(async () => {
  await loadInsiders()
  composeVisitDate()
  const user = userStore.user
  if (user) {
    form.hostId = user._id || ''
    form.hostName = user.nickname
    const idx = insiders.value.findIndex(i => i._id === user._id)
    if (idx >= 0) hostIndex.value = idx
  }
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
  submitting.value = true
  uni.showLoading({ title: '提交中...' })
  try {
    const hostInfo = insiders.value.find(i => i._id === form.hostId)
    const now = getNowStr()
    const params = {
      ...form,
      hostName: hostInfo?.name || form.hostName,
      hostDepartment: hostInfo?.department,
      status: 'completed' as VisitStatus,
      signInTime: now,
      signOutTime: now,
    }
    await callFunction('createVisit', params)
    uni.hideLoading()
    uni.showModal({
      title: '补登成功',
      content: '访客记录已补登完成',
      showCancel: false,
      confirmText: '好的',
      success: () => {
        uni.navigateBack({ delta: 1 })
      },
    })
  } catch (err) {
    console.error('[VisitSupplement] submit error:', err)
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
const handleDateChange = (e: any) => {
  datePart.value = e.detail.value
  composeVisitDate()
}
const handleTimeChange = (e: any) => {
  timePart.value = e.detail.value
  composeVisitDate()
}
</script>

<template>
  <view :class="styles.page">
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
          <text :class="styles.label">随行人数</text>
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
          <picker mode="date" :value="datePart" @change="handleDateChange" :class="styles.pickerHalf">
            <view :class="styles.pickerInner">
              <text :class="styles.pickerPrefix">日期：</text>
              <text v-if="datePart" :class="styles.pickerValue">{{ datePart }}</text>
              <text v-else :class="styles.pickerPlaceholder">请选择</text>
            </view>
          </picker>
          <view :class="styles.pickerGap" />
          <picker mode="time" :value="timePart" @change="handleTimeChange" :class="styles.pickerHalf">
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
  </view>
</template>
