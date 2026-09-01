export type UserRole = 'visitor' | 'insider' | 'admin'

export interface User {
  _id?: string
  _openid?: string
  nickname: string
  avatar: string
  phone: string
  role: UserRole
  department?: string
  createTime?: string
  updateTime?: string
}

export type VisitStatus = 'pending' | 'approved' | 'completed' | 'rejected'

export interface Visit {
  _id?: string
  _openid?: string
  visitorName: string
  visitorPhone: string
  visitorCount: number
  company: string
  hostId: string
  hostName: string
  hostDepartment?: string
  visitDate: string
  purpose: string
  remark?: string
  qrCode?: string
  status: VisitStatus
  rejectReason?: string
  signInTime?: string
  signOutTime?: string
  createTime?: string
  updateTime?: string
  extra?: Record<string, any>
}

export interface Insider {
  _id?: string
  name: string
  phone: string
  department: string
  departmentCode?: string
  role?: 'insider' | 'admin'
  createTime?: string
}
