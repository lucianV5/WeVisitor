<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { callFunction } from '@/services/cloud'
import { validatePhone, DEPARTMENT_OPTIONS } from '@/utils'
import styles from './index.module.scss'

const DEPARTMENTS = DEPARTMENT_OPTIONS.map(o => o.name)

const userStore = useUserStore()
const isEdit = ref(false)
const deptIndex = ref<number>(-1)
const ROLE_OPTIONS = [
  { value: 'insider', label: '员工' },
  { value: 'admin', label: '管理员' },
]
const form = reactive({
  id: '',
  name: '',
  phone: '',
  department: '',
  role: 'insider',
})
const roleLabels = ROLE_OPTIONS.map(r => r.label)
const roleIndex = computed(() => {
  const idx = ROLE_OPTIONS.findIndex(r => r.value === form.role)
  return idx >= 0 ? idx : 0
})
const handleRolePick = (e: any) => {
  form.role = ROLE_OPTIONS[Number(e.detail.value)].value
}
const errors = reactive<Record<string, string>>({})
const submitting = ref(false)

onLoad(async (q: any) => {
  const id = q?.id || ''
  if (id) {
    isEdit.value = true
    uni.setNavigationBarTitle({ title: '编辑内部人员' })
    form.id = id
    try {
      const list = await callFunction<any[]>('getInsiders', {})
      const found = (list || []).find(i => i._id === id)
      if (found) {
        form.name = found.name || ''
        form.phone = found.phone || ''
        form.department = found.department || ''
        form.role = found.role === 'admin' ? 'admin' : 'insider'
        const idx = DEPARTMENTS.indexOf(found.department)
        if (idx >= 0) deptIndex.value = idx
      } else {
        uni.showToast({ title: '内部人员不存在', icon: 'none' })
      }
    } catch (err) {
      console.error('[InsiderEdit] load error:', err)
      uni.showToast({ title: '加载数据失败', icon: 'none' })
    }
  }
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
  if (!userStore.user) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  if (!validate()) {
    uni.showToast({ title: '请完善信息', icon: 'none' })
    return
  }
  submitting.value = true
  uni.showLoading({ title: '保存中...' })
  try {
    const funcName = isEdit.value ? 'updateInsider' : 'createInsider'
    const params = isEdit.value
      ? {
          id: form.id,
          name: form.name.trim(),
          phone: form.phone.trim(),
          department: form.department,
          role: form.role,
        }
      : {
          name: form.name.trim(),
          phone: form.phone.trim(),
          department: form.department,
          role: form.role,
        }
    await callFunction(funcName, params)
    uni.hideLoading()
    uni.showToast({ title: isEdit.value ? '修改成功' : '添加成功', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 800)
  } catch (err) {
    console.error('[InsiderEdit] submit error:', err)
    uni.hideLoading()
    uni.showToast({ title: '保存失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

const onChange = (field: string, v: any) => {
  ;(form as any)[field] = v
  if (errors[field]) delete errors[field]
}

const onNameInput = (e: any) => onChange('name', e.detail.value)
const onPhoneInput = (e: any) => onChange('phone', e.detail.value)

const handleDeptPick = (e: any) => {
  const idx = Number(e.detail.value)
  deptIndex.value = idx
  onChange('department', DEPARTMENTS[idx])
}
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.formCard">
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
          <text>手 机：</text>
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
          :value="deptIndex >= 0 ? deptIndex : 0"
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

      <view :class="styles.formRow">
        <view :class="styles.formLabel">
          <text :class="styles.formLabelPlain">角 色：</text>
        </view>
        <picker
          mode="selector"
          :range="roleLabels"
          :value="roleIndex"
          @change="handleRolePick"
        >
          <view :class="styles.pickerRow">
            <text :class="styles.valueText">{{ ROLE_OPTIONS[roleIndex].label }}</text>
            <text :class="styles.arrow">›</text>
          </view>
        </picker>
      </view>
    </view>

    <view :class="styles.footerBar">
      <button
        :class="[styles.saveBtn, submitting ? styles.disabled : '']"
        :loading="submitting"
        :disabled="submitting"
        @click="handleSubmit"
      >
        保存
      </button>
    </view>
  </view>
</template>
