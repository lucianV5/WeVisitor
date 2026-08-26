# WeVisitor 访客预约小程序

## 项目配置说明

以下 3 个文件中包含项目专属 ID，更换项目时**必须手动修改**：

### 1. `src/manifest.json`

| 字段 | 说明 |
|------|------|
| `spaceId` | uniCloud 服务空间 ID（在 uniCloud 控制台获取） |
| `clientSecret` | uniCloud 客户端密钥（在 uniCloud 控制台获取） |
| `appid` | 微信小程序 AppID（在 mp.weixin.qq.com 获取） |

### 2. `project.config.json`

| 字段 | 说明 |
|------|------|
| `appid` | 微信小程序 AppID（与 manifest.json 中的保持一致） |

### 3. `src/services/cloud.ts`

| 字段 | 说明 |
|------|------|
| `clientAppid` fallback | 微信小程序 AppID（与 manifest.json 中的保持一致） |

## 云函数共享配置（uni-config-center）

模板 ID、AppID 等不常变的非敏感配置存储在配置文件中；**密钥和发布状态等需要动态切换的配置通过环境变量管理**。

### 配置文件（非敏感，不常改）

```
uniCloud-alipay/cloudfunctions/common/uni-config-center/wevisitor/config.json
```

```json
{
  "wx": {
    "appid": ""           ← 填入微信小程序 AppID
  },
  "templates": {
    "host": "yjIQuTyaTAHd0NHnhEcP4FSROEJGWKWvUPrI9CTjddc",      ← 接待人通知模板 ID
    "applicant": "ezMBbwj4xLjjtHNBL0keqQOMS6CtMZr4JFOP6KfGH9w"   ← 申请人通知模板 ID
  }
}
```

> 修改 config.json 后需重新上传 `common/uni-config-center` 云公共模块。

### 环境变量（敏感/需动态切换）

在 **uniCloud 控制台 → 云函数 → 环境变量** 中为 4 个云函数（`user`、`insider`、`visit`、`notify`）分别配置：

| 变量名 | 必填 | 说明 |
|--------|:---:|------|
| `WX_SECRET` | 是 | 微信小程序密钥（mp.weixin.qq.com → 开发管理 → 开发设置 → AppSecret） |
| `MINIPROGRAM_STATE` | 否 | `trial`（体验版，默认）/ `formal`（正式版）。发正式版时改为 `formal` 即可，无需改代码 |

> 密钥不放 config.json 是为了避免提交到 Git 仓库泄露；`MINIPROGRAM_STATE` 放环境变量是因为发版时只需在控制台改一个值，不用重新上传代码。

## 云函数架构（4 个域名云函数）

17 个旧云函数已合并为 4 个域名云函数 + 2 个公共模块：

| 新云函数 | 包含的旧 action | 说明 |
|----------|----------------|------|
| `user` | login, getUser, getUserInfo, updateUser | 用户登录与资料管理 |
| `insider` | getInsiders, createInsider, updateInsider, deleteInsider, applyInsider, getMyInsiderApplication, getInsiderApplications, handleInsiderApplication | 内部员工管理 |
| `visit` | getVisits, createVisit, updateVisitStatus | 访客预约管理 |
| `notify` | getMyNotifications, markNotificationsRead | 消息通知 |

| 公共模块 | 说明 |
|----------|------|
| `common/uni-config-center` | 共享配置（密钥、模板 ID） |
| `common/wevisitor-shared` | 共享工具（日期格式化、事件标准化、微信通知发送、部门映射） |

前端调用层（`src/services/cloud.ts`）内置了旧名 → 新函数+action 的映射，**前端代码无需改动**。

## 部署步骤

### 1. 配置共享配置

编辑 `uniCloud-alipay/cloudfunctions/common/uni-config-center/wevisitor/config.json`，填入 `wx.appid`、`wx.secret`、`templates.applicant`。

### 2. 上传公共模块

在 HBuilderX 中：
1. 右键 `cloudfunctions/common/uni-config-center` → 上传公共模块
2. 右键 `cloudfunctions/common/wevisitor-shared` → 上传公共模块

### 3. 上传 4 个新云函数

依次右键以下目录 → 上传部署（云端安装依赖）：
1. `cloudfunctions/user`
2. `cloudfunctions/insider`
3. `cloudfunctions/visit`
4. `cloudfunctions/notify`

### 4. 重新编译小程序

在 HBuilderX 中重新编译运行小程序。

### 5. 验证

测试以下功能是否正常：
- 登录（含角色选择）
- 访客发起预约
- 接待人审批预约（含微信通知）
- 内部员工申请与管理
- 消息通知列表

### 6. 清理旧云函数（可选）

验证通过后，在 uniCloud 控制台删除以下 17 个旧云函数：

```
login, getUser, getUserInfo, updateUser,
getInsiders, createInsider, updateInsider, deleteInsider,
applyInsider, getMyInsiderApplication, getInsiderApplications, handleInsiderApplication,
getVisits, createVisit, updateVisitStatus,
getMyNotifications, markNotificationsRead
```

同时可删除本地旧云函数目录（`cloudfunctions/` 下除 `common/`、`user/`、`insider/`、`visit/`、`notify/` 之外的文件夹）。
