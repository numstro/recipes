'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Recipe {
  id: number
  url: string
  title: string | null
  description: string | null
  image_url: string | null
  favicon_url: string | null
  domain: string | null
  notes: string
  ingredients: string[]
  steps: string[]
  tags: string[]
  added_by: string
  added_by_name: string | null
  saved_at: string
  updated_at: string
}

interface DetailPanelProps {
  recipe: Recipe
  token: string
  onClose: () => void
  onDeleted: (id: number) => void
  onUpdated: (recipe: Recipe) => void
}

function DetailPanel({ recipe, token, onClose, onDeleted, onUpdated }: DetailPanelProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editTitle, setEditTitle] = useState(recipe.title ?? '')
  const [editNotes, setEditNotes] = useState(recipe.notes)
  const [editIngredients, setEditIngredients] = useState(recipe.ingredients.join('\n'))
  const [editSteps, setEditSteps] = useState(recipe.steps.join('\n\n'))
  const [editTags, setEditTags] = useState(recipe.tags.join(', '))

  function startEdit() {
    setEditTitle(recipe.title ?? '')
    setEditNotes(recipe.notes)
    setEditIngredients(recipe.ingredients.join('\n'))
    setEditSteps(recipe.steps.join('\n\n'))
    setEditTags(recipe.tags.join(', '))
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    const ingredients = editIngredients.split('\n').map(s => s.trim()).filter(Boolean)
    const steps = editSteps.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
    const tags = editTags.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

    const res = await fetch(`/api/recipes/${recipe.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: editTitle, description: recipe.description, notes: editNotes, ingredients, steps, tags }),
    })
    setSaving(false)
    if (res.ok) {
      const { recipe: updated } = await res.json()
      onUpdated(updated)
      setEditing(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this recipe?')) return
    const res = await fetch(`/api/recipes/${recipe.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      onDeleted(recipe.id)
      onClose()
    }
  }

  const date = new Date(recipe.saved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-header-meta">
          {recipe.image_url && <img className="detail-image" src={recipe.image_url} alt="" />}
          <div>
            <a className="detail-title" href={recipe.url} target="_blank" rel="noopener noreferrer">
              {recipe.title || recipe.url}
            </a>
            {recipe.domain && (
              <div className="detail-domain">
                {recipe.favicon_url && <img className="card-favicon" src={recipe.favicon_url} alt="" />}
                {recipe.domain} · {date}
              </div>
            )}
            <div className="detail-added-by">Added by {recipe.added_by_name ?? 'someone'}</div>
          </div>
        </div>
        <button className="detail-close" onClick={onClose}>✕</button>
      </div>

      <div className="detail-body">
        {editing ? (
          <>
            <div className="detail-section">
              <div className="detail-section-label">Title</div>
              <input className="edit-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ fontSize: 15 }} />
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Tags (comma-separated)</div>
              <input className="edit-input" value={editTags} onChange={e => setEditTags(e.target.value)} placeholder="e.g. asian, quick, chicken" style={{ fontSize: 15 }} />
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Notes</div>
              <textarea className="edit-input" rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Your notes…" style={{ fontSize: 15 }} />
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Ingredients (one per line)</div>
              <textarea className="edit-input" rows={8} value={editIngredients} onChange={e => setEditIngredients(e.target.value)} style={{ fontSize: 15 }} />
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Steps (blank line between steps)</div>
              <textarea className="edit-input" rows={10} value={editSteps} onChange={e => setEditSteps(e.target.value)} style={{ fontSize: 15 }} />
            </div>

            <div className="detail-actions">
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            {recipe.notes && (
              <div className="detail-section">
                <div className="detail-section-label">Notes</div>
                <div className="detail-notes">{recipe.notes}</div>
              </div>
            )}

            {recipe.ingredients.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-label">Ingredients</div>
                <div className="ingredients-list">
                  {recipe.ingredients.map((ing, i) =>
                    ing.startsWith('# ') ? (
                      <div key={i} className="recipe-section-header">{ing.slice(2)}</div>
                    ) : (
                      <div key={i} className="ingredient-item">
                        <span className="ingredient-bullet">·</span>{ing}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {recipe.steps.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-label">Steps</div>
                <div className="steps-list">
                  {(() => {
                    let n = 0
                    return recipe.steps.map((step, i) => {
                      if (step.startsWith('# ')) { n = 0; return <div key={i} className="recipe-section-header">{step.slice(2)}</div> }
                      n++
                      return (
                        <div key={i} className="step-item">
                          <span className="step-num">{n}</span>
                          <span>{step}</span>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            )}

            {recipe.tags.length > 0 && (
              <div className="detail-section">
                <div className="detail-section-label">Tags</div>
                <div className="card-tags">
                  {recipe.tags.map(tag => <span key={tag} className="tag-chip">{tag}</span>)}
                </div>
              </div>
            )}

            <div className="detail-section">
              <div className="detail-section-label">URL</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <a className="detail-url" href={recipe.url} target="_blank" rel="noopener noreferrer">{recipe.url}</a>
              </div>
            </div>

            <div className="detail-actions">
              <button className="btn btn-secondary" onClick={startEdit}>Edit</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RecipeRow({ recipe, selected, onClick, onTagClick }: {
  recipe: Recipe
  selected: boolean
  onClick: () => void
  onTagClick: (tag: string, e: React.MouseEvent) => void
}) {
  const date = new Date(recipe.saved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className={`recipe-row${selected ? ' selected' : ''}`} onClick={onClick}>
      {recipe.image_url ? (
        <img className="row-thumb" src={recipe.image_url} alt="" loading="lazy" />
      ) : (
        <div className="row-thumb row-thumb-placeholder">🍽️</div>
      )}
      <div className="row-body">
        <div className="row-title">{recipe.title || recipe.url}</div>
        <div className="row-meta">
          {recipe.favicon_url && <img className="card-favicon" src={recipe.favicon_url} alt="" />}
          {recipe.domain && <span>{recipe.domain}</span>}
          <span>·</span>
          <span>{date}</span>
          {recipe.tags.map(tag => (
            <button key={tag} className="tag-chip tag-chip-sm" onClick={e => onTagClick(tag, e)}>{tag}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState('')
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [statusError, setStatusError] = useState(false)
  const [url, setUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      const session = data.session
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      setToken(session.access_token)
    })

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      setToken(session.access_token)
    })

    return () => subscription.unsubscribe()
  }, [router])

  const fetchRecipes = useCallback(async (currentToken: string, q?: string, tags?: string[]) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (tags && tags.length > 0) params.set('tags', tags.join(','))
    const qs = params.toString()
    const res = await fetch(`/api/recipes${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    })
    if (res.ok) {
      const { recipes } = await res.json()
      setRecipes(recipes)
      if (!tags || tags.length === 0) {
        setAllTags(Array.from(new Set((recipes as Recipe[]).flatMap((r: Recipe) => r.tags))).sort() as string[])
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (token) fetchRecipes(token, query, activeTags)
  }, [token, fetchRecipes]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (searchTimeout) clearTimeout(searchTimeout)
    const t = setTimeout(() => fetchRecipes(token, q, activeTags), 300)
    setSearchTimeout(t)
  }

  function handleTagClick(tag: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    const next = activeTags.includes(tag)
      ? activeTags.filter(t => t !== tag)
      : [...activeTags, tag]
    setActiveTags(next)
    fetchRecipes(token, query, next)
  }

  async function handleAddUrl(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    setScraping(true)
    setStatus('Fetching recipe…')
    setStatusError(false)

    let scraped: Record<string, unknown> = { url: trimmed }

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      if (res.ok) scraped = await res.json()
    } catch {
      // scrape failed — save with just the URL
    }

    setStatus('Saving…')

    const saveRes = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(scraped),
    })

    setScraping(false)

    if (saveRes.status === 409) {
      setStatus('Already saved.')
      setStatusError(false)
      setUrl('')
      return
    }

    if (!saveRes.ok) {
      const err = await saveRes.json()
      setStatus(err.error || 'Failed to save.')
      setStatusError(true)
      return
    }

    const { recipe } = await saveRes.json()
    const withName = { ...recipe, added_by_name: user?.user_metadata?.display_name ?? null }
    setRecipes(prev => [withName, ...prev])
    setUrl('')
    setStatus('')
    setSelected(withName)
  }

  async function handleSignOut() {
    await supabaseClient.auth.signOut()
  }

  if (!user) return null

  const displayName = user.user_metadata?.display_name ?? user.email

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <span className="site-title">Recipes</span>
          <span className="nav-user">{displayName}</span>
          <button className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
        </div>
      </nav>

      <div className="page">
        <div className="toolbar">
          <form className="add-form" onSubmit={handleAddUrl}>
            <input
              className="url-input"
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Paste a recipe URL…"
              required
            />
            <button className="btn btn-primary" type="submit" disabled={scraping}>
              {scraping ? 'Saving…' : 'Add'}
            </button>
          </form>
          {status && (
            <div className={`status-bar${statusError ? ' error' : ''}`}>{status}</div>
          )}
        </div>

        <div className="list-detail-layout">
          <div className={`list-pane${selected ? ' has-detail' : ''}`}>
            <div className="list-controls">
              <input
                className="search-input"
                type="search"
                value={query}
                onChange={handleSearchChange}
                placeholder="Search…"
              />
              {allTags.length > 0 && (
                <div className="tag-filter-bar">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      className={`tag-chip${activeTags.includes(tag) ? ' tag-chip-active' : ''}`}
                      onClick={() => handleTagClick(tag)}
                    >{tag}</button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div className="empty-state">Loading…</div>
            ) : recipes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">{query || activeTags.length > 0 ? '🔍' : '🍳'}</div>
                <div>{query || activeTags.length > 0 ? 'No recipes match.' : 'No recipes yet.'}</div>
              </div>
            ) : (
              <div className="recipe-list">
                {recipes.map(r => (
                  <RecipeRow
                    key={r.id}
                    recipe={r}
                    selected={selected?.id === r.id}
                    onClick={() => setSelected(r)}
                    onTagClick={handleTagClick}
                  />
                ))}
              </div>
            )}
          </div>

          {selected && (
            <DetailPanel
              recipe={selected}
              token={token}
              onClose={() => setSelected(null)}
              onDeleted={id => { setRecipes(prev => prev.filter(x => x.id !== id)); setSelected(null) }}
              onUpdated={updated => {
                const withName = { ...updated, added_by_name: selected.added_by_name }
                setRecipes(prev => prev.map(x => x.id === updated.id ? withName : x))
                setSelected(withName)
              }}
            />
          )}
        </div>
      </div>
    </>
  )
}
