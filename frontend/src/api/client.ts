import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('onenav_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return body
  },
  (err) => {
    const msg = err.response?.data?.message || err.message || '网络错误'
    if (err.response?.status === 401) {
      localStorage.removeItem('onenav_token')
      if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/init')) {
        // 前台可匿名访问，仅后台跳转登录
        if (location.pathname.startsWith('/admin')) {
          location.href = '/login'
        }
      }
    }
    return Promise.reject(new Error(msg))
  },
)

export default api

export type ApiResp<T = unknown> = {
  code: number
  message: string
  data: T
}
