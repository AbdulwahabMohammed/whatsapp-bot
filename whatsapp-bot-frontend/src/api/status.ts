import { apiClient } from './client'

export async function fetchStatus (): Promise<string> {
  const response = await apiClient.get('/health')
  if (typeof response.data === 'string') return response.data
  return response.data?.status || 'ok'
}
