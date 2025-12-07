import { API_BASE_URL } from '../api/client'

export default function Header () {
  return (
    <header className="w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <p className="text-lg font-semibold text-slate-900">WhatsApp Bot Admin</p>
          <p className="text-sm text-slate-500">Backend: {API_BASE_URL}</p>
        </div>
      </div>
    </header>
  )
}
