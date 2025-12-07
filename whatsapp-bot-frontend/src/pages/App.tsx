import { useEffect, useState } from 'react'
import { fetchStatus } from '../api/status'
import Header from '../components/Header'

export default function App () {
  const [apiStatus, setApiStatus] = useState<string>('Checking...')

  useEffect(() => {
    const check = async () => {
      try {
        const status = await fetchStatus()
        setApiStatus(`API reachable: ${status}`)
      } catch (error) {
        console.error(error)
        setApiStatus('API unreachable')
      }
    }
    check()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold mb-4">WhatsApp Bot Admin</h1>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-700">{apiStatus}</p>
        </div>
      </main>
    </div>
  )
}
