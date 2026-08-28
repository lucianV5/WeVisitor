<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import styles from './index.module.scss'

const type = ref<'service' | 'privacy'>('service')

onLoad((options: any) => {
  if (options?.type === 'privacy') {
    type.value = 'privacy'
    uni.setNavigationBarTitle({ title: '隐私政策' })
  } else {
    type.value = 'service'
    uni.setNavigationBarTitle({ title: '用户服务协议' })
  }
})
</script>

<template>
  <scroll-view :class="styles.page" scroll-y>
    <view v-if="type === 'service'" :class="styles.content">
      <text :class="styles.h1">用户服务协议</text>
      <text :class="styles.updateTime">更新日期：2026年8月28日</text>

      <text :class="styles.h2">一、服务说明</text>
      <text :class="styles.p">"小派的访客预约"（以下简称"本服务"）是一款为用户提供访客预约、内部人员管理等功能的微信小程序。用户使用本服务即表示同意本协议。</text>

      <text :class="styles.h2">二、用户注册与登录</text>
      <text :class="styles.p">1. 用户通过微信授权登录本服务，系统将获取用户的微信昵称、头像等基本信息。</text>
      <text :class="styles.p">2. 首次登录时，用户需填写真实姓名和手机号码用于身份验证。</text>
      <text :class="styles.p">3. 用户应确保填写的信息真实、准确，因信息不实导致的后果由用户自行承担。</text>

      <text :class="styles.h2">三、用户行为规范</text>
      <text :class="styles.p">1. 用户不得利用本服务从事任何违法违规活动。</text>
      <text :class="styles.p">2. 用户不得干扰本服务的正常运行或侵犯其他用户的合法权益。</text>
      <text :class="styles.p">3. 用户应合理使用本服务，不得恶意提交虚假预约信息。</text>

      <text :class="styles.h2">四、服务变更与终止</text>
      <text :class="styles.p">1. 本服务有权根据业务需要调整服务内容，并提前公告。</text>
      <text :class="styles.p">2. 用户违反本协议的，本服务有权限制或终止向该用户提供服务。</text>

      <text :class="styles.h2">五、免责声明</text>
      <text :class="styles.p">1. 本服务不保证所有功能的绝对稳定性和安全性。</text>
      <text :class="styles.p">2. 因不可抗力或第三方原因导致的服务中断，本服务不承担责任。</text>

      <text :class="styles.h2">六、协议修改</text>
      <text :class="styles.p">本服务有权随时修改本协议，修改后的协议自发布之日起生效，用户继续使用本服务即视为同意修改后的协议。</text>
    </view>

    <view v-else :class="styles.content">
      <text :class="styles.h1">隐私政策</text>
      <text :class="styles.updateTime">更新日期：2026年8月28日</text>

      <text :class="styles.h2">一、信息收集</text>
      <text :class="styles.p">本服务在用户登录和使用过程中会收集以下信息：</text>
      <text :class="styles.p">1. 微信授权信息：包括微信昵称、头像、OpenID。</text>
      <text :class="styles.p">2. 用户填写信息：真实姓名、手机号码。</text>
      <text :class="styles.p">3. 预约信息：访客姓名、手机号、来访时间、来访事由、接待人等。</text>

      <text :class="styles.h2">二、信息使用</text>
      <text :class="styles.p">收集的信息将用于以下用途：</text>
      <text :class="styles.p">1. 身份验证与用户管理。</text>
      <text :class="styles.p">2. 访客预约的创建、审批与通知。</text>
      <text :class="styles.p">3. 内部人员管理与权限分配。</text>
      <text :class="styles.p">4. 服务通知的发送（微信订阅消息）。</text>

      <text :class="styles.h2">三、信息存储与保护</text>
      <text :class="styles.p">1. 用户信息存储于安全的云服务器中，采取合理的安全措施保护用户信息。</text>
      <text :class="styles.p">2. 仅授权管理人员可在管理后台查看用户信息，并严格遵守保密义务。</text>
      <text :class="styles.p">3. 用户信息不会出售或提供给任何第三方。</text>

      <text :class="styles.h2">四、信息删除</text>
      <text :class="styles.p">1. 用户可联系管理员删除其账户及相关数据。</text>
      <text :class="styles.p">2. 管理员删除内部人员时，相关用户记录将被物理删除。</text>

      <text :class="styles.h2">五、未成年人保护</text>
      <text :class="styles.p">本服务不面向未满14周岁的未成年人。如发现未成年人使用本服务，将采取措施删除相关信息。</text>

      <text :class="styles.h2">六、用户权利</text>
      <text :class="styles.p">1. 用户有权查询、更正自己的个人信息。</text>
      <text :class="styles.p">2. 用户有权要求删除自己的个人信息。</text>
      <text :class="styles.p">3. 用户有权撤回授权，退出使用本服务。</text>

      <text :class="styles.h2">七、政策修改</text>
      <text :class="styles.p">本隐私政策可能适时更新，更新后将在小程序内展示，用户继续使用即视为同意更新后的政策。</text>
    </view>
  </scroll-view>
</template>
