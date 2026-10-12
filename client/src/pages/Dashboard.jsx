import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const emptyForm = {
  voucherDate: new Date().toISOString().slice(0, 10), expenseDate: '',
  department: '', expenseTitle: '', expenseCategory: '',
  expenseDescription: '', amount: '',
}

const statusStyles = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
}

function Stat({ label, value }) {
  return <div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></div>
}

function SignatureImage({ voucherId, kind, label }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let objectUrl
    api.get(`/vouchers/${voucherId}/signatures/${kind}`, { responseType: 'blob' })
      .then(({ data }) => { objectUrl = URL.createObjectURL(data); setSrc(objectUrl) })
      .catch(() => setSrc(''))
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [kind, voucherId])
  return src ? <img src={src} alt={label} className="mt-1 h-12 max-w-40 object-contain" /> : <span className="text-slate-500">Not uploaded</span>
}

function DetailsModal({ voucher, onClose }) {
  if (!voucher) return null
  const fields = [
    ['Voucher number', voucher.voucherNumber],
    ['Voucher date', voucher.voucherDate?.slice(0, 10)],
    ['Expense date', voucher.expenseDate?.slice(0, 10)],
    ['Department', voucher.department],
    ['Expense title', voucher.expenseTitle],
    ['Category', voucher.expenseCategory],
    ['Description', voucher.expenseDescription || '—'],
    ['Amount', `₹${voucher.amount.toFixed(2)}`],
    ['Employee', `${voucher.employee?.name || '—'}${voucher.employee?.employeeCode ? ` (${voucher.employee.employeeCode})` : ''}`],
    ['Status', voucher.status],
    ['Approval date', voucher.approvalDate ? new Date(voucher.approvalDate).toLocaleString() : '—'],
    ['Created', voucher.createdAt ? new Date(voucher.createdAt).toLocaleString() : '—'],
    ['Last updated', voucher.updatedAt ? new Date(voucher.updatedAt).toLocaleString() : '—'],
  ]
  return <div className="fixed inset-0 z-10 overflow-y-auto bg-slate-900/50 p-4" role="dialog" aria-modal="true">
    <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Voucher details</h2><button onClick={onClose} className="rounded border px-3 py-1">Close</button></div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt><dd className="mt-1 text-sm text-slate-900">{value}</dd></div>)}</dl>
      {voucher.rejectionReason && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700"><b>Rejection reason:</b> {voucher.rejectionReason}</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase text-slate-500">Employee signature</p>{voucher.employeeSignature && <SignatureImage voucherId={voucher.id} kind="employee" label="Employee signature" />}</div><div><p className="text-xs font-semibold uppercase text-slate-500">Director signature</p>{voucher.directorSignature && <SignatureImage voucherId={voucher.id} kind="director" label="Director signature" />}</div></div>
    </div>
  </div>
}

function RecentSection({ title, vouchers }) {
  return <section className="rounded-xl bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">{title}</h2>{vouchers.length === 0 ? <p className="mt-3 text-sm text-slate-500">No records available.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">Voucher</th><th className="p-2">Employee</th><th className="p-2">Department</th><th className="p-2">Amount</th><th className="p-2">Status</th><th className="p-2">Activity date</th></tr></thead><tbody>{vouchers.map((voucher) => <tr key={voucher.id} className="border-b"><td className="p-2">{voucher.voucherNumber}</td><td className="p-2">{voucher.employee?.name}</td><td className="p-2">{voucher.department}</td><td className="p-2">₹{voucher.amount.toFixed(2)}</td><td className="p-2">{voucher.status}</td><td className="p-2">{new Date(voucher.approvalDate || voucher.updatedAt || voucher.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>
}

export default function Dashboard({ role }) {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const [vouchers, setVouchers] = useState([])
  const [recentVouchers, setRecentVouchers] = useState([])
  const [statistics, setStatistics] = useState({})
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 })
  const [form, setForm] = useState(emptyForm)
  const [employeeSignature, setEmployeeSignature] = useState(null)
  const [directorSignature, setDirectorSignature] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [filters, setFilters] = useState({ search: '', department: '', category: '', status: '', from: '', to: '', minAmount: '', maxAmount: '', sort: 'createdAt', direction: 'DESC' })
  const [selectedVoucher, setSelectedVoucher] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadVouchers = useCallback(async (page = 1) => {
    const params = { ...filters, page, pageSize: 25 }
    Object.keys(params).forEach((key) => { if (params[key] === '') delete params[key] })
    try {
      const [response, recent] = await Promise.all([
        api.get('/vouchers', { params }),
        role === 'EMPLOYEE'
          ? Promise.resolve({ data: { vouchers: [] } })
          : api.get('/vouchers', { params: { sort: 'createdAt', direction: 'DESC', page: 1, pageSize: 5, ...(role === 'ACCOUNTS' ? { status: 'APPROVED' } : {}) } }),
      ])
      setVouchers(response.data.vouchers)
      setStatistics(response.data.statistics || {})
      setPagination(response.data.pagination || { page: 1, totalPages: 1 })
      setRecentVouchers(recent.data.vouchers || [])
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load vouchers.')
    }
  }, [filters, role])

  useEffect(() => { loadVouchers(1) }, [loadVouchers])

  const stats = useMemo(() => ({
    total: statistics.total ?? vouchers.length,
    drafts: statistics.drafts ?? vouchers.filter((v) => v.status === 'DRAFT').length,
    pending: statistics.pending ?? vouchers.filter((v) => v.status === 'PENDING_APPROVAL').length,
    approved: statistics.approved ?? vouchers.filter((v) => v.status === 'APPROVED').length,
    rejected: statistics.rejected ?? vouchers.filter((v) => v.status === 'REJECTED').length,
    amount: statistics.amount ?? vouchers.reduce((sum, v) => sum + v.amount, 0),
    pendingAmount: statistics.pendingAmount ?? vouchers.filter((v) => v.status === 'PENDING_APPROVAL').reduce((sum, v) => sum + v.amount, 0),
    approvedAmount: statistics.approvedAmount ?? vouchers.filter((v) => v.status === 'APPROVED').reduce((sum, v) => sum + v.amount, 0),
    approvedToday: statistics.approvedToday ?? 0,
    rejectedToday: statistics.rejectedToday ?? 0,
  }), [statistics, vouchers])

  function updateFilter(event) { setFilters((current) => ({ ...current, [event.target.name]: event.target.value })) }
  function logout() { localStorage.clear(); navigate('/login', { replace: true }) }
  async function viewVoucher(id) {
    try { const { data } = await api.get(`/vouchers/${id}`); setSelectedVoucher(data.voucher) }
    catch (err) { setError(err.response?.data?.message || 'Unable to load voucher details.') }
  }
  async function saveDraft(event) {
    event.preventDefault(); setLoading(true); setError(''); setMessage('')
    try {
      const body = new FormData()
      Object.entries(form).forEach(([key, value]) => body.append(key, value))
      if (employeeSignature) body.append('employeeSignature', employeeSignature)
      const id = editingId
      await api[id ? 'put' : 'post'](id ? `/vouchers/${id}` : '/vouchers', body, { headers: { 'Content-Type': 'multipart/form-data' } })
      setForm(emptyForm); setEmployeeSignature(null); setEditingId(null); event.target.reset()
      setMessage(id ? 'Draft updated.' : 'Draft saved. Add a signature before submitting.')
      await loadVouchers(1)
    } catch (err) { setError(err.response?.data?.message || 'Unable to save draft.') }
    finally { setLoading(false) }
  }
  async function runAction(action, successMessage) {
    setError('')
    try { await action(); setMessage(successMessage); await loadVouchers(1) }
    catch (err) { setError(err.response?.data?.message || 'The request could not be completed.') }
  }
  function editVoucher(voucher) {
    setEditingId(voucher.id)
    setForm({ voucherDate: voucher.voucherDate?.slice(0, 10) || '', expenseDate: voucher.expenseDate?.slice(0, 10) || '', department: voucher.department, expenseTitle: voucher.expenseTitle, expenseCategory: voucher.expenseCategory, expenseDescription: voucher.expenseDescription || '', amount: voucher.amount })
    setMessage('Draft loaded for editing.')
  }
  async function approveVoucher(id) {
    if (!directorSignature) { setError('Choose a director signature image before approving.'); return }
    const body = new FormData(); body.append('directorSignature', directorSignature)
    await runAction(() => api.post(`/vouchers/${id}/approve`, body, { headers: { 'Content-Type': 'multipart/form-data' } }), 'Voucher approved.')
    setDirectorSignature(null)
  }
  async function rejectVoucher(id) {
    if (!rejectionReason.trim()) { setError('Enter a rejection reason before rejecting.'); return }
    await runAction(() => api.post(`/vouchers/${id}/reject`, { rejectionReason }), 'Voucher rejected.')
    setRejectionReason('')
  }

  const title = role === 'EMPLOYEE' ? 'Employee dashboard' : role === 'DIRECTOR' ? 'Director dashboard' : 'Accounts dashboard'
  return <main className="min-h-screen bg-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-4 bg-white px-6 py-4 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">PSPL Expense Desk</p><h1 className="text-xl font-bold text-slate-900">{title}</h1><p className="text-sm text-slate-500">{user?.fullName} · {role}</p></div><button onClick={logout} className="rounded-lg border px-4 py-2 text-sm">Log out</button></header>
    <section className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {role === 'EMPLOYEE' ? <><Stat label="Total vouchers" value={stats.total} /><Stat label="Draft vouchers" value={stats.drafts} /><Stat label="Pending approval" value={stats.pending} /><Stat label="Approved vouchers" value={stats.approved} /><Stat label="Rejected vouchers" value={stats.rejected} /><Stat label="Total amount claimed" value={`₹${stats.amount.toFixed(2)}`} /></>
          : role === 'DIRECTOR' ? <><Stat label="Pending approval" value={stats.pending} /><Stat label="Approved today" value={stats.approvedToday} /><Stat label="Rejected today" value={stats.rejectedToday} /><Stat label="Pending amount" value={`₹${stats.pendingAmount.toFixed(2)}`} /><Stat label="Total vouchers" value={stats.total} /></>
            : <><Stat label="Total vouchers" value={stats.total} /><Stat label="Pending approval" value={stats.pending} /><Stat label="Approved" value={stats.approved} /><Stat label="Rejected" value={stats.rejected} /><Stat label="Approved amount" value={`₹${stats.approvedAmount.toFixed(2)}`} /></>}
      </div>
      {role === 'EMPLOYEE' && <form onSubmit={saveDraft} className="rounded-xl bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">{editingId ? 'Edit expense voucher draft' : 'Create expense voucher'}</h2><div className="mt-4 grid gap-4 md:grid-cols-2">{[['voucherDate', 'Voucher date', 'date'], ['expenseDate', 'Expense date', 'date'], ['department', 'Department', 'text'], ['expenseTitle', 'Expense title', 'text'], ['expenseCategory', 'Expense category', 'text'], ['amount', 'Amount', 'number']].map(([name, label, type]) => <label key={name} className="text-sm font-medium">{label}<input required={name !== 'voucherDate'} min={type === 'number' ? '0.01' : undefined} step={type === 'number' ? '0.01' : undefined} name={name} type={type} value={form[name]} onChange={(e) => setForm({ ...form, [e.target.name]: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>)}<label className="text-sm font-medium md:col-span-2">Description<textarea name="expenseDescription" value={form.expenseDescription} onChange={(e) => setForm({ ...form, expenseDescription: e.target.value })} className="mt-1 min-h-20 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium md:col-span-2">Employee signature<input type="file" accept="image/*" onChange={(e) => setEmployeeSignature(e.target.files[0])} className="mt-1 block text-sm" /></label></div><button disabled={loading} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">{loading ? 'Saving...' : editingId ? 'Update draft' : 'Save draft'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm) }} className="ml-3 rounded-lg border px-4 py-2">Cancel</button>}</form>}
      <section className="rounded-xl bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">{role === 'EMPLOYEE' ? 'My vouchers' : 'Voucher register'}</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input name="search" value={filters.search} onChange={updateFilter} placeholder="Voucher number or employee" className="rounded border px-3 py-2" /><input name="department" value={filters.department} onChange={updateFilter} placeholder="Department" className="rounded border px-3 py-2" /><input name="category" value={filters.category} onChange={updateFilter} placeholder="Category" className="rounded border px-3 py-2" /><select name="status" value={filters.status} onChange={updateFilter} className="rounded border px-3 py-2"><option value="">All statuses</option>{Object.keys(statusStyles).map((status) => <option key={status}>{status}</option>)}</select><input name="from" type="date" value={filters.from} onChange={updateFilter} className="rounded border px-3 py-2" /><input name="to" type="date" value={filters.to} onChange={updateFilter} className="rounded border px-3 py-2" /><input name="minAmount" type="number" min="0" value={filters.minAmount} onChange={updateFilter} placeholder="Minimum amount" className="rounded border px-3 py-2" /><input name="maxAmount" type="number" min="0" value={filters.maxAmount} onChange={updateFilter} placeholder="Maximum amount" className="rounded border px-3 py-2" /><select name="sort" value={filters.sort} onChange={updateFilter} className="rounded border px-3 py-2"><option value="createdAt">Created date</option><option value="voucherDate">Voucher date</option><option value="expenseDate">Expense date</option><option value="amount">Amount</option><option value="status">Status</option></select><select name="direction" value={filters.direction} onChange={updateFilter} className="rounded border px-3 py-2"><option>DESC</option><option>ASC</option></select></div>
        {vouchers.length === 0 ? <p className="mt-6 text-sm text-slate-500">No vouchers match the selected filters.</p> : <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">Voucher</th><th className="p-2">Employee</th><th className="p-2">Department</th><th className="p-2">Amount</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead><tbody>{vouchers.map((voucher) => <tr key={voucher.id} className="border-b"><td className="p-2">{voucher.voucherNumber}</td><td className="p-2">{voucher.employee?.name}</td><td className="p-2">{voucher.department}</td><td className="p-2">₹{voucher.amount.toFixed(2)}</td><td className="p-2"><span className={`rounded-full px-2 py-1 text-xs ${statusStyles[voucher.status]}`}>{voucher.status}</span></td><td className="flex flex-wrap gap-2 p-2"><button onClick={() => viewVoucher(voucher.id)} className="text-blue-600">Details</button>{role === 'EMPLOYEE' && voucher.status === 'DRAFT' && <><button onClick={() => editVoucher(voucher)} className="text-blue-600">Edit</button><button onClick={() => runAction(() => api.delete(`/vouchers/${voucher.id}`), 'Draft deleted.')} className="text-red-600">Delete</button><button onClick={() => runAction(() => api.post(`/vouchers/${voucher.id}/submit`), 'Voucher submitted for approval.')} className="text-amber-700">Submit</button></>}{role === 'DIRECTOR' && voucher.status === 'PENDING_APPROVAL' && <><input type="file" accept="image/*" onChange={(e) => setDirectorSignature(e.target.files[0])} /><button onClick={() => approveVoucher(voucher.id)} className="text-emerald-700">Approve</button><input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Rejection reason" className="w-36 rounded border px-2" /><button onClick={() => rejectVoucher(voucher.id)} className="text-red-600">Reject</button></>}</td></tr>)}</tbody></table></div>}
        <div className="mt-4 flex items-center justify-between text-sm"><button disabled={pagination.page <= 1} onClick={() => loadVouchers(pagination.page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><span>Page {pagination.page} of {pagination.totalPages}</span><button disabled={pagination.page >= pagination.totalPages} onClick={() => loadVouchers(pagination.page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div>
      </section>
      {role === 'DIRECTOR' && <RecentSection title="Recent voucher activity" vouchers={recentVouchers} />}
      {role === 'ACCOUNTS' && <RecentSection title="Recent approved vouchers" vouchers={recentVouchers} />}
    </section>
    <DetailsModal voucher={selectedVoucher} onClose={() => setSelectedVoucher(null)} />
  </main>
}
