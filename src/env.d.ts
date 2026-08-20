/// <reference types="vite/client" />
/// <reference types="@dcloudio/types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.scss' {
  const content: { [className: string]: string }
  export default content
}

declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.jpeg' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.gif' {
  const src: string
  export default src
}

import type {
  Component,
  ComponentPublicInstance,
  ComputedRef,
  EffectScope,
  InjectionKey,
  PropType as _PropType,
  Ref,
  UnwrapRef,
  WritableComputedRef,
} from 'vue'

declare global {
  const uniCloud: any | undefined
  const __UNI_PLATFORM__: string | undefined

  const PropType: typeof _PropType
  const acceptHMRUpdate: any
  const computed: typeof import('vue').computed
  const createApp: typeof import('vue').createApp
  const customRef: typeof import('vue').customRef
  const defineAsyncComponent: typeof import('vue').defineAsyncComponent
  const defineComponent: typeof import('vue').defineComponent
  const effectScope: typeof import('vue').effectScope
  const getCurrentInstance: typeof import('vue').getCurrentInstance
  const getCurrentScope: typeof import('vue').getCurrentScope
  const h: typeof import('vue').h
  const inject: typeof import('vue').inject
  const isProxy: typeof import('vue').isProxy
  const isReactive: typeof import('vue').isReactive
  const isReadonly: typeof import('vue').isReadonly
  const isRef: typeof import('vue').isRef
  const markRaw: typeof import('vue').markRaw
  const nextTick: typeof import('vue').nextTick
  const onActivated: typeof import('vue').onActivated
  const onBeforeMount: typeof import('vue').onBeforeMount
  const onBeforeUnmount: typeof import('vue').onBeforeUnmount
  const onBeforeUpdate: typeof import('vue').onBeforeUpdate
  const onDeactivated: typeof import('vue').onDeactivated
  const onErrorCaptured: typeof import('vue').onErrorCaptured
  const onMounted: typeof import('vue').onMounted
  const onRenderTracked: typeof import('vue').onRenderTracked
  const onRenderTriggered: typeof import('vue').onRenderTriggered
  const onScopeDispose: typeof import('vue').onScopeDispose
  const onServerPrefetch: typeof import('vue').onServerPrefetch
  const onUnmounted: typeof import('vue').onUnmounted
  const onUpdated: typeof import('vue').onUpdated
  const provide: typeof import('vue').provide
  const reactive: typeof import('vue').reactive
  const readonly: typeof import('vue').readonly
  const ref: typeof import('vue').ref
  const resolveComponent: typeof import('vue').resolveComponent
  const resolveDirective: typeof import('vue').resolveDirective
  const shallowReactive: typeof import('vue').shallowReactive
  const shallowReadonly: typeof import('vue').shallowReadonly
  const shallowRef: typeof import('vue').shallowRef
  const toRaw: typeof import('vue').toRaw
  const toRef: typeof import('vue').toRef
  const toRefs: typeof import('vue').toRefs
  const toValue: typeof import('vue').toValue
  const triggerRef: typeof import('vue').triggerRef
  const unref: typeof import('vue').unref
  const useAttrs: typeof import('vue').useAttrs
  const useCssModule: typeof import('vue').useCssModule
  const useCssVars: typeof import('vue').useCssVars
  const useSlots: typeof import('vue').useSlots
  const watch: typeof import('vue').watch
  const watchEffect: typeof import('vue').watchEffect
  const watchPostEffect: typeof import('vue').watchPostEffect
  const watchSyncEffect: typeof import('vue').watchSyncEffect

  const defineStore: typeof import('pinia').defineStore
  const setActivePinia: typeof import('pinia').setActivePinia
  const createPinia: typeof import('pinia').createPinia
  const getActivePinia: typeof import('pinia').getActivePinia
  const storeToRefs: typeof import('pinia').storeToRefs

  const onAddToFavorites: typeof import('@dcloudio/uni-app').onAddToFavorites
  const onBackPress: typeof import('@dcloudio/uni-app').onBackPress
  const onError: typeof import('@dcloudio/uni-app').onError
  const onHide: typeof import('@dcloudio/uni-app').onHide
  const onLaunch: typeof import('@dcloudio/uni-app').onLaunch
  const onLoad: typeof import('@dcloudio/uni-app').onLoad
  const onPageScroll: typeof import('@dcloudio/uni-app').onPageScroll
  const onPullDownRefresh: typeof import('@dcloudio/uni-app').onPullDownRefresh
  const onReachBottom: typeof import('@dcloudio/uni-app').onReachBottom
  const onReady: typeof import('@dcloudio/uni-app').onReady
  const onShareAppMessage: typeof import('@dcloudio/uni-app').onShareAppMessage
  const onShareTimeline: typeof import('@dcloudio/uni-app').onShareTimeline
  const onShow: typeof import('@dcloudio/uni-app').onShow
  const onTabItemTap: typeof import('@dcloudio/uni-app').onTabItemTap
  const onThemeChange: typeof import('@dcloudio/uni-app').onThemeChange
  const onUnhandledRejection: typeof import('@dcloudio/uni-app').onUnhandledRejection
  const onUniNViewMessage: typeof import('@dcloudio/uni-app').onUniNViewMessage
}

export {}
