import axios from 'axios'

declare global {
  interface Window {
    __APP_CONFIG?: {
      API_BASE_URL?: string
    }
  }
}

const runtimeBase = window.__APP_CONFIG?.API_BASE_URL
const sanitizedRuntime = runtimeBase && runtimeBase !== '__API_BASE_URL__' ? runtimeBase : undefined
const envBase = import.meta.env.VITE_API_BASE_URL

export const API_BASE_URL = sanitizedRuntime || envBase || 'http://localhost:3000'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true
})
