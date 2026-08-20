import type { VisitStatus } from '@/types'

export const formatDate = (
  date: string | Date,
  formatStr: string = 'YYYY-MM-DD HH:mm'
): string => {
  if (!date) return ''
  const d = new Date(typeof date === 'string' ? date.replace(/-/g, '/') : date)
  if (isNaN(d.getTime())) return String(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const h = pad(d.getHours())
  const min = pad(d.getMinutes())
  const s = pad(d.getSeconds())
  return formatStr
    .replace('YYYY', String(y))
    .replace('MM', m)
    .replace('DD', day)
    .replace('HH', h)
    .replace('mm', min)
    .replace('ss', s)
}

export const formatTime = (
  date: string | Date,
  formatStr: string = 'HH:mm'
): string => {
  return formatDate(date, formatStr)
}

export const getStatusText = (status: VisitStatus): string => {
  const map: Record<VisitStatus, string> = {
    pending: '待确认',
    approved: '已确认待到访',
    completed: '已到访',
    rejected: '已拒绝',
  }
  return map[status] || status
}

export const validatePhone = (phone: string): boolean => {
  return /^1[3-9]\d{9}$/.test(phone || '')
}

export const generateQRCode = (id: string): string => {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(id || '')}`
}

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

export const DEPARTMENT_OPTIONS = [
  { code: '300001', name: '高管' },
  { code: '300002', name: '研究部' },
  { code: '300003', name: '固定收益部' },
  { code: '300004', name: '项目投资部' },
  { code: '300006', name: '集中交易室' },
  { code: '300007', name: '产品管理部' },
  { code: '300009', name: '风险管理部' },
  { code: '300010', name: '信用评审部' },
  { code: '300011', name: '法律合规部' },
  { code: '300012', name: '运营管理部' },
  { code: '300013', name: '金融科技部' },
  { code: '300014', name: '资金财务部' },
  { code: '300015', name: '综合管理部' },
  { code: '300016', name: '党委组织部' },
  { code: '300017', name: '审计部' },
  { code: '300018', name: '科技专家' },
  { code: '300019', name: '风险专家' },
  { code: '300022', name: '首席投资官' },
  { code: '300023', name: '多资产配置部' },
  { code: '300025', name: '战略客户部' },
  { code: '300026', name: '渠道拓展部' },
  { code: '300027', name: '纪委办公室' },
]

export const parseVisitTime = (s: string): number => {
  if (!s || typeof s !== 'string') return NaN
  let str = s.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) str += ' 23:59'
  return new Date(str.replace(/-/g, '/')).getTime()
}

export const getCountdownText = (visitDate: string, now: number = Date.now()): string => {
  const target = parseVisitTime(visitDate)
  if (isNaN(target)) return ''
  const diff = target - now
  if (diff <= 0) return ''
  const DAY = 86400000
  if (diff > DAY) return `还有${Math.ceil(diff / DAY)}天`
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  return `还有${hours}小时${minutes}分`
}

export const syncTabBarActive = (instance: any, path: string) => {
  try {
    const proxy: any = instance?.proxy || instance
    const candidates = [proxy?.$scope, proxy?.$mp?.page, proxy?.$mp?.component, proxy]
    for (const scope of candidates) {
      if (scope && typeof scope.getTabBar === 'function') {
        const bar = scope.getTabBar()
        if (bar && typeof bar.setData === 'function') {
          if (typeof bar.sync === 'function') bar.sync(path)
          else bar.setData({ active: path })
          return
        }
      }
    }
  } catch (_) {}
}
