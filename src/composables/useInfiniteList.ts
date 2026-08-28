import { ref } from 'vue'
import { callFunction } from '@/services/cloud'

interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export function useInfiniteList<T>(fnName: string, baseParams: Record<string, any> = {}, pageSize = 20) {
  const list = ref<T[]>([]) as any
  const loading = ref(false)
  const loadingMore = ref(false)
  const hasMore = ref(true)
  const total = ref(0)
  const page = ref(1)

  const fetchList = async (reset = false) => {
    if (reset) {
      page.value = 1
      hasMore.value = true
      list.value = []
    }
    if (!hasMore.value && !reset) return
    if (reset) loading.value = true
    else loadingMore.value = true
    try {
      const params = { ...baseParams, page: page.value, pageSize }
      const result = await callFunction<PageResult<T> | T[]>(fnName, params)
      if (result) {
        if (Array.isArray(result)) {
          if (reset) list.value = result
          else list.value = [...list.value, ...result]
          hasMore.value = false
          total.value = list.value.length
        } else {
          if (reset) list.value = result.list || []
          else list.value = [...list.value, ...(result.list || [])]
          total.value = result.total || 0
          hasMore.value = !!result.hasMore
          page.value++
        }
      } else {
        hasMore.value = false
      }
    } catch (err) {
      console.error(`[useInfiniteList:${fnName}] error:`, err)
      if (reset) {
        uni.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      loading.value = false
      loadingMore.value = false
      uni.stopPullDownRefresh?.()
    }
  }

  const loadMore = () => {
    if (loadingMore.value || !hasMore.value || loading.value) return
    fetchList(false)
  }

  const reset = () => fetchList(true)

  const setParams = (params: Record<string, any>) => {
    Object.keys(baseParams).forEach(k => delete baseParams[k])
    Object.assign(baseParams, params)
  }

  return {
    list,
    loading,
    loadingMore,
    hasMore,
    total,
    page,
    fetchList: reset,
    loadMore,
    reset,
    setParams,
  }
}
