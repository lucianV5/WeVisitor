const INSIDERS_ICON =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM4NjkwOUMiIHN0cm9rZS13aWR0aD0iMi4yIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xNiAyMXYtMmE0IDQgMCAwIDAtNC00SDZhNCA0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iOSIgY3k9IjciIHI9IjQiLz48cGF0aCBkPSJNMjIgMjF2LTJhNCA0IDAgMCAwLTMtMy44NyIvPjxwYXRoIGQ9Ik0xNiAzLjEzYTQgNCAwIDAgMSAwIDcuNzUiLz48L3N2Zz4='
const INSIDERS_ICON_ACTIVE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiMxNjc3RkYiIHN0cm9rZS13aWR0aD0iMi4yIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xNiAyMXYtMmE0IDQgMCAwIDAtNC00SDZhNCA0IDAgMCAwLTQgNHYyIi8+PGNpcmNsZSBjeD0iOSIgY3k9IjciIHI9IjQiLz48cGF0aCBkPSJNMjIgMjF2LTJhNCA0IDAgMCAwLTMtMy44NyIvPjxwYXRoIGQ9Ik0xNiAzLjEzYTQgNCAwIDAgMSAwIDcuNzUiLz48L3N2Zz4='

const visitorTabs = [
  {
    pagePath: '/pages/visits/index',
    text: '记录',
    icon: '/static/tabbar/visits.png',
    iconActive: '/static/tabbar/visits-selected.png',
  },
  {
    pagePath: '/pages/appointment/index',
    text: '预约',
    icon: '/static/tabbar/appointment.png',
    iconActive: '/static/tabbar/appointment-selected.png',
  },
  {
    pagePath: '/pages/profile/index',
    text: '我的',
    icon: '/static/tabbar/profile.png',
    iconActive: '/static/tabbar/profile-selected.png',
  },
]

const adminTabs = [
  {
    pagePath: '/pages/workbench/index',
    text: '首页',
    icon: '/static/tabbar/home.png',
    iconActive: '/static/tabbar/home-selected.png',
  },
  {
    pagePath: '/pages/insiders/index',
    text: '内部人员',
    icon: INSIDERS_ICON,
    iconActive: INSIDERS_ICON_ACTIVE,
  },
  {
    pagePath: '/pages/profile/index',
    text: '我的',
    icon: '/static/tabbar/profile.png',
    iconActive: '/static/tabbar/profile-selected.png',
  },
]

const employeeTabs = [
  {
    pagePath: '/pages/workbench/index',
    text: '首页',
    icon: '/static/tabbar/home.png',
    iconActive: '/static/tabbar/home-selected.png',
  },
  {
    pagePath: '/pages/profile/index',
    text: '我的',
    icon: '/static/tabbar/profile.png',
    iconActive: '/static/tabbar/profile-selected.png',
  },
]

Component({
  data: {
    active: '',
    tabs: visitorTabs,
  },

  lifetimes: {
    attached() {
      this._syncRole()
      this._syncActive()
    },
  },

  pageLifetimes: {
    show() {
      this._syncRole()
      this._syncActive()
    },
  },

  methods: {
    _syncRole() {
      let role = ''
      try {
        role = wx.getStorageSync('wevisitor_active_role') || ''
        if (!role) {
          const user = wx.getStorageSync('wevisitor_user')
          role = (user && user.role) || ''
        }
      } catch (e) {}
      const tabs = role === 'admin' ? adminTabs : role === 'insider' ? employeeTabs : visitorTabs
      if (this.data.tabs !== tabs) this.setData({ tabs })
    },

    _syncActive() {
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (current && current.route) {
        const path = '/' + current.route
        if (path !== this.data.active) this.setData({ active: path })
      }
    },

    switchTab(e) {
      const url = e.currentTarget.dataset.url
      if (!url) return
      this.setData({ active: url })
      const pages = getCurrentPages()
      const current = pages[pages.length - 1]
      if (!current || '/' + current.route !== url) {
        wx.switchTab({ url })
      }
    },

    sync(path) {
      this._syncRole()
      if (typeof path === 'string' && path) this.setData({ active: path })
    },
  },
})
