'use client'

import { useState, useCallback } from 'react'

interface AdminUser {
  id: string
  email: string
  display_name: string | null
  created_at: string
  last_sign_in_at: string | null
}

interface DeletedRecipe {
  id: number
  url: string
  title: string | null
  domain: string | null
  image_url: string | null
  added_by: string
  added_by_name: string | null
  saved_at: string
  deleted_at: string
}

interface ActivityLog {
  id: number
  recipe_id: number | null
  user_id: string | null
  user_name: string | null
  ip_address: string | null
  action: string
  created_at: string
  recipes: { title: string | null; url: string } | null
}

interface BannedIP {
  id: number
  ip_address: string
  reason: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
}

type Tab = 'users' | 'deleted' | 'logs' | 'bans'

function fmt(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [users, setUsers] = useState<AdminUser[]>([])
  const [deletedRecipes, setDeletedRecipes] = useState<DeletedRecipe[]>([])
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [bannedIPs, setBannedIPs] = useState<BannedIP[]>([])
  const [tab, setTab] = useState<Tab>('users')

  // Ban form
  const [banIP, setBanIP] = useState('')
  const [banReason, setBanReason] = useState('')
  const [banDuration, setBanDuration] = useState('24')
  const [banLoading, setBanLoading] = useState(false)

  const adminHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-key': adminKey,
  }), [adminKey])

  async function loadData(key: string) {
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin', { headers: { 'x-admin-key': key } })
    setLoading(false)
    if (!res.ok) {
      setError('Wrong password.')
      return false
    }
    const data = await res.json()
    setUsers(data.users)
    setDeletedRecipes(data.deleted_recipes)
    setLogs(data.logs)
    setBannedIPs(data.banned_ips)
    return true
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const ok = await loadData(adminKey)
    if (ok) setAuthed(true)
  }

  async function handleRestore(id: number) {
    if (!confirm('Restore this recipe?')) return
    const res = await fetch(`/api/admin/recipes/${id}`, {
      method: 'PATCH',
      headers: adminHeaders(),
    })
    if (res.ok) {
      setDeletedRecipes(prev => prev.filter(r => r.id !== id))
    }
  }

  async function handleHardDelete(id: number) {
    if (!confirm('Permanently delete this recipe? This cannot be undone.')) return
    const res = await fetch(`/api/admin/recipes/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    if (res.ok) {
      setDeletedRecipes(prev => prev.filter(r => r.id !== id))
    }
  }

  async function handleBan(e: React.FormEvent) {
    e.preventDefault()
    setBanLoading(true)
    const expires_hours = banDuration === 'permanent' ? null : parseInt(banDuration)
    const res = await fetch('/api/admin/bans', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ ip_address: banIP, reason: banReason, expires_hours }),
    })
    setBanLoading(false)
    if (res.ok) {
      const { ban } = await res.json()
      setBannedIPs(prev => [ban, ...prev.filter(b => b.ip_address !== ban.ip_address)])
      setBanIP('')
      setBanReason('')
    }
  }

  async function handleDeleteUser(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    if (res.ok) {
      setUsers(prev => prev.filter(u => u.id !== id))
    } else {
      const body = await res.json().catch(() => ({}))
      alert(`Failed to delete user: ${body.error ?? res.status}`)
    }
  }

  async function handleUnban(ip: string) {
    const res = await fetch('/api/admin/bans', {
      method: 'DELETE',
      headers: adminHeaders(),
      body: JSON.stringify({ ip_address: ip }),
    })
    if (res.ok) {
      setBannedIPs(prev => prev.map(b => b.ip_address === ip ? { ...b, is_active: false } : b))
    }
  }

  if (!authed) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-title">Admin</div>
          <div className="auth-subtitle">Recipes admin dashboard</div>
          <form onSubmit={handleLogin}>
            <div className="auth-field">
              <label className="auth-label">Admin password</label>
              <input
                className="auth-input"
                type="password"
                value={adminKey}
                onChange={e => setAdminKey(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1rem', justifyContent: 'center', padding: '0.6rem' }}
              disabled={loading}
            >
              {loading ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'users', label: 'Users', count: users.length },
    { key: 'deleted', label: 'Deleted Recipes', count: deletedRecipes.length },
    { key: 'logs', label: 'Activity', count: logs.length },
    { key: 'bans', label: 'Banned IPs', count: bannedIPs.filter(b => b.is_active).length },
  ]

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <a className="site-title" href="/">Recipes</a>
          <span className="nav-user" style={{ fontWeight: 600 }}>Admin</span>
          <button
            className="btn btn-secondary"
            onClick={() => loadData(adminKey)}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </nav>

      <div className="page">
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.5rem 1rem',
                fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
                borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px',
                fontSize: '0.9rem',
              }}
            >
              {t.label}
              {t.count > 0 && (
                <span style={{
                  marginLeft: '0.375rem',
                  background: tab === t.key ? 'var(--accent)' : '#e5e1db',
                  color: tab === t.key ? 'white' : 'var(--text-muted)',
                  borderRadius: '999px',
                  fontSize: '0.75rem',
                  padding: '0 0.4rem',
                  fontWeight: 500,
                }}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Users */}
        {tab === 'users' && (
          <div className="recipe-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#faf9f7', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Display name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Joined</th>
                  <th style={thStyle}>Last sign in</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>{u.display_name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={tdStyle}><code style={{ fontSize: '0.8rem' }}>{u.email}</code></td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{fmtDate(u.created_at)}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                      {u.last_sign_in_at ? fmtDate(u.last_sign_in_at) : '—'}
                    </td>
                    <td style={tdStyle}>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: '0.775rem', padding: '0.2rem 0.5rem' }}
                        onClick={() => handleDeleteUser(u.id, u.email)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No users</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Deleted Recipes */}
        {tab === 'deleted' && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {deletedRecipes.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">🗑️</div>
                <div>No deleted recipes</div>
              </div>
            )}
            {deletedRecipes.map(r => (
              <div key={r.id} className="recipe-card" style={{ opacity: 0.85 }}>
                <div className="card-header">
                  {r.image_url
                    ? <img className="card-image" src={r.image_url} alt="" />
                    : <div className="card-image-placeholder">🍽️</div>}
                  <div className="card-meta">
                    <a className="card-title" href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.title || r.url}
                    </a>
                    {r.domain && <div className="card-domain">{r.domain}</div>}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Added by {r.added_by_name ?? 'unknown'} · Deleted {fmt(r.deleted_at)}
                    </div>
                  </div>
                </div>
                <div className="card-footer">
                  <div />
                  <div className="card-actions">
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={() => handleRestore(r.id)}>
                      Restore
                    </button>
                    <button className="btn btn-danger" onClick={() => handleHardDelete(r.id)}>
                      Delete forever
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Activity Logs */}
        {tab === 'logs' && (
          <div className="recipe-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#faf9f7', borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Recipe</th>
                  <th style={thStyle}>User</th>
                  <th style={thStyle}>IP</th>
                  <th style={thStyle}>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '0.15rem 0.45rem',
                        borderRadius: 4,
                        fontSize: '0.775rem',
                        fontWeight: 600,
                        background: l.action === 'create' ? '#dcfce7' : l.action === 'delete' ? '#fee2e2' : '#fef9c3',
                        color: l.action === 'create' ? '#166534' : l.action === 'delete' ? '#991b1b' : '#854d0e',
                      }}>
                        {l.action}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {l.recipes ? (
                        <a href={l.recipes.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                          {l.recipes.title || l.recipes.url}
                        </a>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>{l.user_name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={tdStyle}><code style={{ fontSize: '0.8rem' }}>{l.ip_address ?? '—'}</code></td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(l.created_at)}</td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No activity yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Banned IPs */}
        {tab === 'bans' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {/* Ban form */}
            <div className="recipe-card" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Ban an IP</div>
              <form onSubmit={handleBan} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label className="edit-label">IP address</label>
                  <input
                    className="edit-input"
                    style={{ width: 180 }}
                    value={banIP}
                    onChange={e => setBanIP(e.target.value)}
                    placeholder="1.2.3.4"
                    required
                  />
                </div>
                <div>
                  <label className="edit-label">Reason</label>
                  <input
                    className="edit-input"
                    style={{ width: 200 }}
                    value={banReason}
                    onChange={e => setBanReason(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="edit-label">Duration</label>
                  <select className="edit-input" style={{ width: 140 }} value={banDuration} onChange={e => setBanDuration(e.target.value)}>
                    <option value="24">24 hours</option>
                    <option value="168">1 week</option>
                    <option value="720">30 days</option>
                    <option value="permanent">Permanent</option>
                  </select>
                </div>
                <button className="btn btn-danger" type="submit" disabled={banLoading} style={{ marginBottom: '1px' }}>
                  {banLoading ? 'Banning…' : 'Ban IP'}
                </button>
              </form>
            </div>

            {/* Ban list */}
            <div className="recipe-card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#faf9f7', borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>IP</th>
                    <th style={thStyle}>Reason</th>
                    <th style={thStyle}>Expires</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bannedIPs.map(b => (
                    <tr key={b.id} style={{ borderBottom: '1px solid var(--border)', opacity: b.is_active ? 1 : 0.5 }}>
                      <td style={tdStyle}><code style={{ fontSize: '0.8rem' }}>{b.ip_address}</code></td>
                      <td style={tdStyle}>{b.reason ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                        {b.expires_at ? fmt(b.expires_at) : 'Permanent'}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: '0.15rem 0.45rem',
                          borderRadius: 4,
                          fontSize: '0.775rem',
                          fontWeight: 600,
                          background: b.is_active ? '#fee2e2' : '#f5f3f0',
                          color: b.is_active ? '#991b1b' : 'var(--text-muted)',
                        }}>
                          {b.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {b.is_active && (
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: '0.775rem', padding: '0.2rem 0.5rem' }}
                            onClick={() => handleUnban(b.ip_address)}
                          >
                            Unban
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {bannedIPs.length === 0 && (
                    <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No banned IPs</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const thStyle: React.CSSProperties = {
  padding: '0.6rem 1rem',
  textAlign: 'left',
  fontSize: '0.775rem',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const tdStyle: React.CSSProperties = {
  padding: '0.65rem 1rem',
  verticalAlign: 'middle',
}
