<script setup lang="ts">
import { useUserStore } from '@/store/user'
import { validatePhone, DEPARTMENT_OPTIONS } from '@/utils'
import styles from './index.module.scss'

const userStore = useUserStore()
const user = computed(() => userStore.user)
const isInternal = computed(() => user.value?.role === 'insider' || user.value?.role === 'admin')

const DEPARTMENTS = DEPARTMENT_OPTIONS.map(o => o.name)

const avatarUrl = ref(user.value?.avatar || '')
const nickname = ref(user.value?.nickname || '')
const name = ref(user.value?.name || '')
const phone = ref(user.value?.phone || '')
const department = ref(user.value?.department || '')
const saving = ref(false)

const deptIndex = computed(() => {
  const idx = DEPARTMENTS.indexOf(department.value)
  return idx >= 0 ? idx : 0
})
const handleDeptPick = (e: any) => {
  department.value = DEPARTMENTS[Number(e.detail.value)]
}

const onChooseAvatar = (e: any) => {
  if (e.detail.avatarUrl) {
    avatarUrl.value = e.detail.avatarUrl
  }
}

const onNameInput = (e: any) => {
  name.value = e.detail.value
}
const onPhoneInput = (e: any) => {
  phone.value = e.detail.value
}
const onNicknameInput = (e: any) => {
  nickname.value = e.detail.value
}

watch(user, () => {
  avatarUrl.value = user.value?.avatar || ''
  nickname.value = user.value?.nickname || ''
  name.value = user.value?.name || ''
  phone.value = user.value?.phone || ''
  department.value = user.value?.department || ''
})

const handleSave = async () => {
  if (!name.value.trim()) {
    uni.showToast({ title: '请输入真实姓名', icon: 'none' })
    return
  }
  if (!phone.value.trim()) {
    uni.showToast({ title: '请输入手机号', icon: 'none' })
    return
  }
  if (!validatePhone(phone.value.trim())) {
    uni.showToast({ title: '手机号格式不正确', icon: 'none' })
    return
  }
  saving.value = true
  uni.showLoading({ title: '保存中...' })
  try {
    const payload: Record<string, any> = {
      name: name.value.trim(),
      phone: phone.value.trim(),
    }
    if (nickname.value) payload.nickname = nickname.value.trim()
    if (avatarUrl.value) payload.avatar = avatarUrl.value
    if (isInternal.value) payload.department = department.value
    const result = await userStore.updateUser(payload)
    uni.hideLoading()
    if (result) {
      uni.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 1000)
    } else {
      uni.showToast({ title: '保存失败', icon: 'none' })
    }
  } catch (err) {
    console.error('[ProfileEdit] save error:', err)
    uni.hideLoading()
    uni.showToast({ title: '保存失败', icon: 'none' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.avatarRow">
      <button :class="styles.avatarBtn" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
        <image v-if="avatarUrl" :class="styles.avatarImg" :src="avatarUrl" mode="aspectFill" />
        <view v-else :class="styles.avatarPlaceholder">
          <text>+</text>
        </view>
      </button>
    </view>
    <view :class="styles.formCard">
      <view :class="styles.formRow">
        <view :class="styles.formLabel">
          <text>昵称：</text>
        </view>
        <input
          :class="styles.input"
          type="nickname"
          placeholder="点击选择微信昵称"
          :value="nickname"
          @input="onNicknameInput"
        />
      </view>
      <view :class="styles.formRow">
        <view :class="styles.formLabel">
          <text :class="styles.required">*</text>
          <text>真实姓名：</text>
        </view>
        <input
          :class="styles.input"
          type="text"
          placeholder="请输入真实姓名"
          :value="name"
          maxlength="20"
          @input="onNameInput"
        />
      </view>
      <view :class="styles.formRow">
        <view :class="styles.formLabel">
          <text :class="styles.required">*</text>
          <text>手 机：</text>
        </view>
        <input
          :class="styles.input"
          type="number"
          placeholder="请输入"
          :value="phone"
          maxlength="11"
          @input="onPhoneInput"
        />
      </view>
      <view v-if="isInternal" :class="styles.formRow">
        <view :class="styles.formLabel">
          <text>部 门：</text>
        </view>
        <picker
          mode="selector"
          :range="DEPARTMENTS"
          :value="deptIndex"
          @change="handleDeptPick"
        >
          <view :class="styles.pickerRow">
            <text v-if="department" :class="styles.valueText">{{ department }}</text>
            <text v-else :class="styles.placeholder">请选择</text>
            <text :class="styles.arrow">›</text>
          </view>
        </picker>
      </view>
    </view>

    <view :class="styles.footerBar">
      <button
        :class="styles.saveBtn"
        :loading="saving"
        :disabled="saving"
        @click="handleSave"
      >
        保存
      </button>
    </view>
  </view>
</template>
