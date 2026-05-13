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

interface RecipeCardProps {
  recipe: Recipe
  currentUserId: string
  token: string
  onDeleted: (id: number) => void
  onUpdated: (recipe: Recipe) => void
}

function RecipeCard({ recipe, currentUserId, token, onDeleted, onUpdated }: RecipeCardProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showIngredients, setShowIngredients] = useState(recipe.ingredients.length > 0)
  const [showSteps, setShowSteps] = useState(recipe.steps.length > 0)

  const [editTitle, setEditTitle] = useState(recipe.title ?? '')
  const [editDescription, setEditDescription] = useState(recipe.description ?? '')
  const [editNotes, setEditNotes] = useState(recipe.notes)
  const [editIngredients, setEditIngredients] = useState(recipe.ingredients.join('\n'))
  const [editSteps, setEditSteps] = useState(recipe.steps.join('\n\n'))

  const isOwner = recipe.added_by === currentUserId

  function startEdit() {
    setEditTitle(recipe.title ?? '')
    setEditDescription(recipe.description ?? '')
    setEditNotes(recipe.notes)
    setEditIngredients(recipe.ingredients.join('\n'))
    setEditSteps(recipe.steps.join('\n\n'))
    setEditing(true)
    // Scroll into view on mobile
    setTimeout(() => {
      document.getElementById(`card-${recipe.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  async function saveEdit() {
    setSaving(true)
    const ingredients = editIngredients.split('\n').map(s => s.trim()).filter(Boolean)
    const steps = editSteps.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)

    const res = await fetch(`/api/recipes/${recipe.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: editTitle,
        description: editDescription,
        notes: editNotes,
        ingredients,
        steps,
        tags: recipe.tags,
      }),
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
    if (res.ok) onDeleted(recipe.id)
  }

  const date = new Date(recipe.saved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="recipe-card" id={`card-${recipe.id}`}>
      <div className="card-header">
        {recipe.image_url ? (
          <img className="card-image" src={recipe.image_url} alt="" loading="lazy" />
        ) : (
          <div className="card-image-placeholder">🍽️</div>
        )}
        <div className="card-meta">
          <a className="card-title" href={recipe.url} target="_blank" rel="noopener noreferrer">
            {recipe.title || recipe.url}
          </a>
          {recipe.domain && (
            <div className="card-domain">
              {recipe.favicon_url && (
                <img className="card-favicon" src={recipe.favicon_url} alt="" />
              )}
              {recipe.domain}
            </div>
          )}
          {recipe.description && (
            <div className="card-description">{recipe.description}</div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="edit-form">
          <label className="edit-label">Title</label>
          <input
            className="edit-input"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            style={{ fontSize: 16 }}
          />

          <label className="edit-label">Description</label>
          <textarea
            className="edit-input"
            rows={2}
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
            style={{ fontSize: 16 }}
          />

          <label className="edit-label">Notes</label>
          <textarea
            className="edit-input"
            rows={3}
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="Your notes about this recipe…"
            style={{ fontSize: 16 }}
          />

          <label className="edit-label">Ingredients (one per line)</label>
          <textarea
            className="edit-input"
            rows={6}
            value={editIngredients}
            onChange={e => setEditIngredients(e.target.value)}
            style={{ fontSize: 16 }}
          />

          <label className="edit-label">Steps (blank line between steps)</label>
          <textarea
            className="edit-input"
            rows={8}
            value={editSteps}
            onChange={e => setEditSteps(e.target.value)}
            style={{ fontSize: 16 }}
          />

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="card-body">
          {recipe.notes && <div className="notes-view">{recipe.notes}</div>}

          {recipe.ingredients.length > 0 && (
            <>
              <button className="section-toggle" onClick={() => setShowIngredients(v => !v)}>
                {showIngredients ? '▼' : '▶'} Ingredients ({recipe.ingredients.length})
              </button>
              {showIngredients && (
                <div className="section-content">
                  <ul className="ingredients-list">
                    {recipe.ingredients.map((ing, i) => <li key={i}>{ing}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}

          {recipe.steps.length > 0 && (
            <>
              <button className="section-toggle" onClick={() => setShowSteps(v => !v)}>
                {showSteps ? '▼' : '▶'} Steps ({recipe.steps.length})
              </button>
              {showSteps && (
                <div className="section-content">
                  <ol className="steps-list">
                    {recipe.steps.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="card-footer">
        <div className="card-added-by">
          Added by {recipe.added_by_name ?? 'someone'} · {date}
        </div>
        {isOwner && !editing && (
          <div className="card-actions">
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }} onClick={startEdit}>
              Edit
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              Delete
            </button>
          </div>
        )}
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
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      const session = data.session
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)
      setToken(session.access_token)
    })

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)
      setToken(session.access_token)
    })

    return () => subscription.unsubscribe()
  }, [router])

  const fetchRecipes = useCallback(async (currentToken: string, q?: string) => {
    const params = q ? `?q=${encodeURIComponent(q)}` : ''
    const res = await fetch(`/api/recipes${params}`, {
      headers: { Authorization: `Bearer ${currentToken}` },
    })
    if (res.ok) {
      const { recipes } = await res.json()
      setRecipes(recipes)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (token) fetchRecipes(token)
  }, [token, fetchRecipes])

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    if (searchTimeout) clearTimeout(searchTimeout)
    const t = setTimeout(() => fetchRecipes(token, q), 300)
    setSearchTimeout(t)
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
      if (res.ok) {
        scraped = await res.json()
      }
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
            {scraping ? 'Saving…' : 'Add Recipe'}
          </button>
          {status && (
            <div className={`status-bar${statusError ? ' error' : ''}`} style={{ width: '100%', marginTop: 0 }}>
              {status}
            </div>
          )}
        </form>

        <div className="search-bar">
          <input
            className="search-input"
            type="search"
            value={query}
            onChange={handleSearchChange}
            placeholder="Search recipes…"
          />
        </div>

        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : recipes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">{query ? '🔍' : '🍳'}</div>
            <div>{query ? 'No recipes match your search.' : 'No recipes yet. Add the first one!'}</div>
          </div>
        ) : (
          <div className="recipe-grid">
            {recipes.map(r => (
              <RecipeCard
                key={r.id}
                recipe={r}
                currentUserId={user.id}
                token={token}
                onDeleted={id => setRecipes(prev => prev.filter(x => x.id !== id))}
                onUpdated={updated => setRecipes(prev => prev.map(x => x.id === updated.id ? { ...updated, added_by_name: x.added_by_name } : x))}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
