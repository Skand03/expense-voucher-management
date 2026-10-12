import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import api from './services/api'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProtectedRoute from './components/ProtectedRoute'

function Unauthorized() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="rounded-xl bg-white p-8 text-center shadow">
        <h1 className="text-2xl font-bold text-slate-900">Access denied</h1>
        <p className="mt-2 text-slate-600">Your account does not have permission to access this page.</p>
        <a href="/login" className="mt-4 inline-block text-blue-600 hover:underline">Return to login</a>
      </section>
    </main>
  )
}

function HomeRedirect() {
  const token = localStorage.getItem('token')
  let user = null
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    localStorage.removeItem('user')
  }
  if (!token || !user) return <Navigate to="/login" replace />
  const destinations = { EMPLOYEE: '/employee/dashboard', DIRECTOR: '/director/dashboard', ACCOUNTS: '/accounts/dashboard' }
  return <Navigate to={destinations[user.role] || '/login'} replace />
}

function SessionGate({ children }) {
  const [checking, setChecking] = useState(true)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!localStorage.getItem('token')) {
      setChecking(false)
      return
    }
    api.get('/auth/me')
      .then(({ data }) => {
        if (!data.user?.role) throw new Error('Invalid session response.')
        localStorage.setItem('user', JSON.stringify(data.user))
      })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      })
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">Verifying session...</main>
  }
  return children
}

export default function App() {
  return (
    <SessionGate>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route element={<ProtectedRoute allowedRoles={['EMPLOYEE']} />}>
          <Route path="/employee/dashboard" element={<Dashboard role="EMPLOYEE" />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['DIRECTOR']} />}>
          <Route path="/director/dashboard" element={<Dashboard role="DIRECTOR" />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['ACCOUNTS']} />}>
          <Route path="/accounts/dashboard" element={<Dashboard role="ACCOUNTS" />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionGate>
  )
}
