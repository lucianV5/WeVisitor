<script setup lang="ts">
import { getCurrentInstance } from 'vue'
import { onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app'
import type { Insider } from '@/types'
import { useUserStore } from '@/store/user'
import { callFunction } from '@/services/cloud'
import { syncTabBarActive } from '@/utils'
import { useInfiniteList } from '@/composables/useInfiniteList'
import EmptyState from '@/components/EmptyState/index.vue'
import styles from './index.module.scss'

const instance = getCurrentInstance()
const userStore = useUserStore()
const keyword = ref('')
const isAdmin = computed(() => userStore.user?.role === 'admin')

const { list, loading, loadingMore, hasMore, fetchList, loadMore, setParams } = useInfiniteList<Insider>('getInsiders', {})

const loadList = async () => {
  if (!userStore.user) {
    uni.stopPullDownRefresh()
    return
  }
  setParams({ keyword: keyword.value })
  await fetchList(true)
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
const onKeywordInput = (e: any) => {
  keyword.value = e.detail.value
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadList(), 300)
}

const onSearch = () => loadList()
const onClear = () => {
  keyword.value = ''
  loadList()
}

onShow(() => {
  syncTabBarActive(instance, '/pages/insiders/index')
  loadList()
})
onPullDownRefresh(() => loadList())
onReachBottom(() => loadMore())

const handleAdd = () => {
  if (!isAdmin.value) {
    uni.showToast({ title: '仅管理员可添加人员', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/pages/insider-edit/index' })
}
const handleEdit = (item: Insider, e?: Event) => {
  e?.stopPropagation && e.stopPropagation()
  if (!isAdmin.value) return
  uni.navigateTo({ url: `/pages/insider-edit/index?id=${item._id || ''}` })
}
const handleDelete = (item: Insider, e: Event) => {
  e.stopPropagation && e.stopPropagation()
  if (!isAdmin.value) return
  if (!item._id) return
  uni.showModal({
    title: '提示',
    content: `确定要删除内部人员【${item.name}】吗？`,
    success: async (res: any) => {
      if (!res.confirm) return
      try {
        uni.showLoading({ title: '删除中...' })
        await callFunction('deleteInsider', { id: item._id })
        uni.hideLoading()
        const idx = list.value.findIndex(i => i._id === item._id)
        if (idx >= 0) list.value.splice(idx, 1)
        uni.showToast({ title: '已删除', icon: 'success' })
      } catch (err) {
        console.error('[Insiders] delete error:', err)
        uni.hideLoading()
        uni.showToast({ title: '删除失败', icon: 'none' })
      }
    },
  })
}
</script>

<template>
  <view :class="styles.page">
    <view :class="styles.searchBar">
      <view :class="styles.searchInput">
        <text :class="styles.searchIcon">🔍</text>
        <input
          :class="styles.input"
          placeholder="搜索姓名, 手机号"
          :value="keyword"
          confirm-type="search"
          @input="onKeywordInput"
          @confirm="onSearch"
        />
        <text v-if="keyword" :class="styles.clearIcon" @tap="onClear">×</text>
      </view>
      <view v-if="isAdmin" :class="styles.addBtn" @tap="handleAdd">添加人员</view>
    </view>

    <view :class="styles.listWrap">
      <EmptyState v-if="list.length === 0 && !loading" text="暂无内部人员" icon="👥" />
      <view
        v-for="item in list"
        :key="item._id"
        :class="styles.card"
        @tap="handleEdit(item)"
      >
        <view :class="styles.cardTop">
          <view :class="styles.avatar">
            <text :class="styles.avatarText">{{ (item.name || '员')[0] }}</text>
          </view>
          <text :class="styles.name">{{ item.name }}</text>
          <text v-if="item.role === 'admin'" :class="styles.roleTag">管理员</text>
        </view>
        <view :class="styles.cardInfo">
          <text :class="styles.infoLabel">所属部门：</text>
          <text :class="styles.infoValue">{{ item.department || '—' }}</text>
        </view>
        <view :class="styles.cardInfo">
          <text :class="styles.infoLabel">手 机 号：</text>
          <text :class="styles.infoValue">{{ item.phone || '—' }}</text>
        </view>
        <view v-if="isAdmin" :class="styles.cardActions">
          <view :class="styles.actionBtn" @tap="handleEdit(item, $event)">编辑</view>
          <view :class="styles.actionBtn" @tap="handleDelete(item, $event)">删除</view>
        </view>
      </view>
      <view v-if="loadingMore" :class="styles.loadingMore">加载中...</view>
      <view v-else-if="!hasMore && list.length > 0" :class="styles.noMore">没有更多了</view>
    </view>
  </view>
</template>
