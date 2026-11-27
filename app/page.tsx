'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  servings: number | null
  prep_minutes: number | null
  cook_minutes: number | null
  total_minutes: number | null
  added_by: string
  added_by_name: string | null
  saved_at: string
  updated_at: string
}

function formatMinutes(m: number) {
  const h = Math.floor(m / 60)
  const min = m % 60
  return [h && `${h} hr`, min && `${min} min`].filter(Boolean).join(' ')
}

function timeParts(r: Recipe) {
  const total = r.total_minutes ?? (r.prep_minutes && r.cook_minutes ? r.prep_minutes + r.cook_minutes : null)
  const parts: [string, number | null][] = [['Prep', r.prep_minutes], ['Cook', r.cook_minutes], ['Total', total]]
  return parts.filter((p): p is [string, number] => p[1] != null)
}

const UNICODE_FRACS: Record<string, number> = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1/3, '⅔': 2/3,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}
const QTY_RE = /^(\d+)\s+(\d+)\/(\d+)|^(\d+)\/(\d+)|^(\d*\.?\d+)|^([¼½¾⅓⅔⅛⅜⅝⅞])/

function parseQty(s: string): { value: number; len: number } | null {
  const m = s.match(QTY_RE)
  if (!m) return null
  if (m[1] !== undefined) return { value: parseInt(m[1]) + parseInt(m[2]) / parseInt(m[3]), len: m[0].length }
  if (m[4] !== undefined) return { value: parseInt(m[4]) / parseInt(m[5]), len: m[0].length }
  if (m[6] !== undefined) { const v = parseFloat(m[6]); if (isNaN(v) || v === 0) return null; return { value: v, len: m[0].length } }
  if (m[7] !== undefined) return { value: UNICODE_FRACS[m[7]], len: 1 }
  return null
}

function formatQty(n: number): string {
  if (n <= 0) return '0'
  const whole = Math.floor(n)
  const frac = n - whole
  const FRACS: [number, string][] = [[1/8,'⅛'],[1/4,'¼'],[1/3,'⅓'],[3/8,'⅜'],[1/2,'½'],[5/8,'⅝'],[2/3,'⅔'],[3/4,'¾'],[7/8,'⅞']]
  for (const [v, sym] of FRACS) {
    if (Math.abs(frac - v) < 0.06) return whole > 0 ? `${whole}${sym}` : sym
  }
  if (frac < 0.06) return String(whole || 1)
  if (frac > 0.94) return String(whole + 1)
  return n.toFixed(1).replace(/\.0$/, '')
}

function scaleIngredient(text: string, factor: number): string {
  if (factor === 1 || text.startsWith('# ')) return text
  const parsed = parseQty(text)
  if (!parsed) return text
  return formatQty(parsed.value * factor) + text.slice(parsed.len)
}

const isManual = (r: Recipe) => r.url.startsWith('manual:')

interface DetailPanelProps {
  recipe: Recipe
  token: string
  allTags: string[]
  isNew: boolean
  onDiscardNew: () => void
  onClose: () => void
  onDeleted: (id: number) => void
  onUpdated: (recipe: Recipe) => void
  onTagClick: (tag: string) => void
  onNewTags: (tags: string[]) => void
}

function DetailPanel({ recipe, token, allTags, isNew, onDiscardNew, onClose, onDeleted, onUpdated, onTagClick, onNewTags }: DetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editTitle, setEditTitle] = useState(recipe.title ?? '')
  const [editNotes, setEditNotes] = useState(recipe.notes)
  const [editIngredients, setEditIngredients] = useState(recipe.ingredients.join('\n'))
  const [editSteps, setEditSteps] = useState(recipe.steps.join('\n\n'))
  const [editTags, setEditTags] = useState(recipe.tags.join(', '))
  const [editServings, setEditServings] = useState(recipe.servings?.toString() ?? '')
  const [editPrep, setEditPrep] = useState(recipe.prep_minutes?.toString() ?? '')
  const [editCook, setEditCook] = useState(recipe.cook_minutes?.toString() ?? '')
  const [editTotal, setEditTotal] = useState(recipe.total_minutes?.toString() ?? '')
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagInputSuggestions, setTagInputSuggestions] = useState<string[]>([])
  const [tagHighlightIndex, setTagHighlightIndex] = useState(-1)
  const [savingTags, setSavingTags] = useState(false)
  const [desiredServings, setDesiredServings] = useState<number | null>(recipe.servings)

  useEffect(() => {
    setDesiredServings(recipe.servings)
    setEditServings(recipe.servings?.toString() ?? '')
    if (isNew) startEdit()
    else setEditing(false)
  }, [recipe.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const scaleFactor = (recipe.servings && desiredServings && desiredServings > 0)
    ? desiredServings / recipe.servings
    : 1

  function startEdit() {
    setEditTitle(recipe.title ?? '')
    setEditNotes(recipe.notes)
    setEditIngredients(recipe.ingredients.join('\n'))
    setEditSteps(recipe.steps.join('\n\n'))
    setEditTags(recipe.tags.join(', '))
    setEditServings(recipe.servings?.toString() ?? '')
    setEditPrep(recipe.prep_minutes?.toString() ?? '')
    setEditCook(recipe.cook_minutes?.toString() ?? '')
    setEditTotal(recipe.total_minutes?.toString() ?? '')
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
      body: JSON.stringify({ title: editTitle, description: recipe.description, notes: editNotes, ingredients, steps, tags, servings: editServings ? parseInt(editServings) : null, prep_minutes: editPrep ? parseInt(editPrep) : null, cook_minutes: editCook ? parseInt(editCook) : null, total_minutes: editTotal ? parseInt(editTotal) : null }),
    })
    setSaving(false)
    if (res.ok) {
      const { recipe: updated } = await res.json()
      onUpdated(updated)
      setEditing(false)
    }
  }

  async function saveTagsInline(tags: string[]) {
    setSavingTags(true)
    const res = await fetch(`/api/recipes/${recipe.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: recipe.title, description: recipe.description, notes: recipe.notes, ingredients: recipe.ingredients, steps: recipe.steps, tags }),
    })
    setSavingTags(false)
    if (res.ok) {
      const { recipe: updated } = await res.json()
      onUpdated({ ...updated, added_by_name: recipe.added_by_name })
      const added = tags.filter(t => !allTags.includes(t))
      if (added.length > 0) onNewTags(added)
    }
  }

  function addTag(tag: string) {
    const cleaned = tag.trim().toLowerCase()
    if (!cleaned || recipe.tags.includes(cleaned)) return
    saveTagsInline([...recipe.tags, cleaned])
    setTagInput('')
    setTagInputSuggestions([])
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

  function handlePrint() {
    const panel = panelRef.current
    if (!panel) return
    document.body.classList.add('printing')
    panel.style.setProperty('--print-scale', '1')
    panel.classList.remove('print-long')
    const pageHeightPx = 10.2 * 96 * 0.88
    const scale = pageHeightPx / panel.scrollHeight
    if (scale < 0.6) panel.classList.add('print-long')
    panel.style.setProperty('--print-scale', String(Math.max(0.6, Math.min(1, scale))))
    const done = () => {
      document.body.classList.remove('printing')
      window.removeEventListener('afterprint', done)
      window.removeEventListener('pointerdown', done)
    }
    window.addEventListener('afterprint', done)
    window.print()
    setTimeout(() => window.addEventListener('pointerdown', done), 500)
  }

  const date = new Date(recipe.saved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="detail-panel" ref={panelRef}>
      <div className="detail-header">
        <div className="detail-header-meta">
          {recipe.image_url && <img className="detail-image" src={recipe.image_url} alt="" />}
          <div>
            {isManual(recipe) ? (
              <div className="detail-title">{recipe.title || 'Untitled recipe'}</div>
            ) : (
              <a className="detail-title" href={recipe.url} target="_blank" rel="noopener noreferrer">
                {recipe.title || recipe.url}
              </a>
            )}
            {(recipe.domain || isManual(recipe)) && (
              <div className="detail-domain">
                {recipe.favicon_url && <img className="card-favicon" src={recipe.favicon_url} alt="" />}
                {recipe.domain ?? 'Own recipe'} · {date}
              </div>
            )}
            {timeParts(recipe).length > 0 && (
              <div className="detail-times">
                {timeParts(recipe).map(([label, m]) => <span key={label}><strong>{label}</strong> {formatMinutes(m)}</span>)}
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
              <input className="edit-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Recipe name" autoFocus={isNew} style={{ fontSize: 15 }} />
            </div>


            <div className="detail-section">
              <div className="detail-section-label">Serves <span className="edit-hint">default serving size</span></div>
              <input className="edit-input" type="number" min={1} value={editServings} onChange={e => setEditServings(e.target.value)} placeholder="e.g. 4" style={{ fontSize: 15, width: '6rem' }} />
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Time <span className="edit-hint">minutes</span></div>
              <div className="edit-times">
                <label>Prep<input className="edit-input" type="number" min={0} value={editPrep} onChange={e => setEditPrep(e.target.value)} /></label>
                <label>Cook<input className="edit-input" type="number" min={0} value={editCook} onChange={e => setEditCook(e.target.value)} /></label>
                <label>Total<input className="edit-input" type="number" min={0} value={editTotal} onChange={e => setEditTotal(e.target.value)} placeholder={editPrep && editCook ? String(parseInt(editPrep) + parseInt(editCook)) : ''} /></label>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Notes</div>
              <textarea className="edit-input" rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Your notes…" style={{ fontSize: 15 }} />
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Ingredients <span className="edit-hint">one per line · <code># Section Name</code> for headers</span></div>
              <textarea className="edit-input" rows={8} value={editIngredients} onChange={e => setEditIngredients(e.target.value)} style={{ fontSize: 15 }} />
            </div>

            <div className="detail-section">
              <div className="detail-section-label">Steps <span className="edit-hint">blank line between steps · <code># Section Name</code> restarts numbering</span></div>
              <textarea className="edit-input" rows={10} value={editSteps} onChange={e => setEditSteps(e.target.value)} style={{ fontSize: 15 }} />
            </div>

            <div className="detail-actions">
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-secondary" onClick={() => isNew ? onDiscardNew() : setEditing(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            {recipe.notes && (
              <div className="detail-section section-notes">
                <div className="detail-section-label">Notes</div>
                <div className="detail-notes">{recipe.notes}</div>
              </div>
            )}

            {recipe.ingredients.length > 0 && (
              <div className="detail-section section-ingredients">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <div className="detail-section-label" style={{ marginBottom: 0 }}>Ingredients</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>Serves</span>
                    {recipe.servings != null ? (
                      <span className="print-only">{desiredServings ?? recipe.servings}</span>
                    ) : null}
                    {recipe.servings != null ? (
                      <select
                        className="print-hide"
                        value={desiredServings ?? recipe.servings}
                        onChange={e => setDesiredServings(parseInt(e.target.value))}
                        style={{ padding: '0.15rem 0.25rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '0.75rem', background: scaleFactor !== 1 ? '#fef3ee' : 'var(--bg)', cursor: 'pointer' }}
                      >
                        {Array.from({ length: recipe.servings * 2 }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontStyle: 'italic' }}>N/A</span>
                    )}
                  </div>
                </div>
                <div className="ingredients-list">
                  {recipe.ingredients.map((ing, i) =>
                    ing.startsWith('# ') ? (
                      <div key={i} className="recipe-section-header">{ing.slice(2)}</div>
                    ) : (
                      <div key={i} className="ingredient-item">
                        <span className="ingredient-bullet">·</span>{scaleIngredient(ing, scaleFactor)}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {recipe.steps.length > 0 && (
              <div className="detail-section section-steps">
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

            <div className="detail-section print-hide">
              <div className="detail-section-label">Tags</div>
              <div style={{ position: 'relative' }}>
                <div
                  className="edit-input"
                  style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center', padding: '0.4rem 0.5rem', cursor: 'text', minHeight: '2.25rem' }}
                  onClick={e => { if (e.target === e.currentTarget) (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus() }}
                >
                  {recipe.tags.map(tag => (
                    <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'var(--accent)', color: 'white', borderRadius: 99, padding: '0.15rem 0.5rem', fontSize: '0.75rem', fontWeight: 500 }}>
                      <span onClick={() => onTagClick(tag)} style={{ cursor: 'pointer' }}>{tag}</span>
                      <button
                        onClick={() => saveTagsInline(recipe.tags.filter(t => t !== tag))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: 0, fontSize: '0.65rem', lineHeight: 1, opacity: 0.8 }}
                      >✕</button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={e => {
                      const val = e.target.value
                      setTagInput(val)
                      setTagHighlightIndex(-1)
                      const partial = val.trim().toLowerCase()
                      setTagInputSuggestions(partial.length >= 1
                        ? allTags.filter(t => t.startsWith(partial) && !recipe.tags.includes(t) && t !== partial)
                        : [])
                    }}
                    onKeyDown={e => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setTagHighlightIndex(i => Math.min(i + 1, tagInputSuggestions.length - 1))
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setTagHighlightIndex(i => Math.max(i - 1, -1))
                      } else if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        if (tagHighlightIndex >= 0 && tagInputSuggestions[tagHighlightIndex]) {
                          addTag(tagInputSuggestions[tagHighlightIndex])
                        } else if (tagInput.trim()) {
                          addTag(tagInput.replace(',', ''))
                        }
                        setTagHighlightIndex(-1)
                      } else if (e.key === 'Escape') {
                        setTagInputSuggestions([])
                        setTagHighlightIndex(-1)
                      }
                    }}
                    onBlur={() => setTimeout(() => { setTagInputSuggestions([]); setTagHighlightIndex(-1) }, 150)}
                    placeholder={savingTags ? '…' : 'add tag…'}
                    disabled={savingTags}
                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', minWidth: '5rem', flex: 1, color: 'var(--text)', padding: '0.1rem 0.15rem' }}
                  />
                </div>
                {tagInputSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--border)', borderRadius: 6, padding: '0.25rem', zIndex: 10, display: 'flex', flexDirection: 'column', marginTop: '0.2rem', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {tagInputSuggestions.map((t, i) => (
                      <button
                        key={t}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); addTag(t) }}
                        onMouseEnter={() => setTagHighlightIndex(i)}
                        onMouseLeave={() => setTagHighlightIndex(-1)}
                        style={{ background: i === tagHighlightIndex ? '#f5f3f0' : 'none', border: 'none', cursor: 'pointer', padding: '0.35rem 0.6rem', fontSize: '0.875rem', textAlign: 'left', borderRadius: 4, color: 'var(--text)', fontWeight: i === tagHighlightIndex ? 500 : 400 }}
                      >{t}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!isManual(recipe) && (
              <div className="detail-section print-hide">
                <div className="detail-section-label">URL</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <a className="detail-url" href={recipe.url} target="_blank" rel="noopener noreferrer">{recipe.url}</a>
                </div>
              </div>
            )}

            <div className="detail-actions">
              <button className="btn btn-secondary" onClick={startEdit}>Edit</button>
              <button className="btn btn-secondary" onClick={handlePrint}>Print</button>
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
        <div className="row-title">{recipe.title || (isManual(recipe) ? 'Untitled recipe' : recipe.url)}</div>
        <div className="row-meta">
          {recipe.favicon_url && <img className="card-favicon" src={recipe.favicon_url} alt="" />}
          {(recipe.domain || isManual(recipe)) && <span>{recipe.domain ?? 'Own recipe'}</span>}
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
  const [newManualId, setNewManualId] = useState<number | null>(null)
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

  useEffect(() => {
    document.body.classList.toggle('detail-open', !!selected)
    return () => document.body.classList.remove('detail-open')
  }, [selected])

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

  async function handleAddManual() {
    setStatus('')
    setStatusError(false)
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ manual: true }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setStatus(err.error || 'Failed to create recipe.')
      setStatusError(true)
      return
    }
    const { recipe } = await res.json()
    const withName = { ...recipe, added_by_name: user?.user_metadata?.display_name ?? null }
    setRecipes(prev => [withName, ...prev])
    setNewManualId(recipe.id)
    setSelected(withName)
  }

  async function discardNewManual(id: number) {
    setNewManualId(null)
    setSelected(null)
    setRecipes(prev => prev.filter(x => x.id !== id))
    await fetch(`/api/recipes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
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
            <button className="btn btn-secondary" type="button" onClick={handleAddManual} disabled={scraping}>
              Write your own
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
                  {activeTags.length > 0 && (
                    <button className="tag-chip tag-chip-clear" onClick={() => { setActiveTags([]); fetchRecipes(token, query, []) }}>
                      ✕ Clear
                    </button>
                  )}
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
              allTags={allTags}
              isNew={selected.id === newManualId}
              onDiscardNew={() => discardNewManual(selected.id)}
              onClose={() => selected.id === newManualId ? discardNewManual(selected.id) : setSelected(null)}
              onDeleted={id => { setRecipes(prev => prev.filter(x => x.id !== id)); setSelected(null) }}
              onUpdated={updated => {
                if (updated.id === newManualId) setNewManualId(null)
                const withName = { ...updated, added_by_name: selected.added_by_name }
                setRecipes(prev => prev.map(x => x.id === updated.id ? withName : x))
                setSelected(withName)
              }}
              onTagClick={tag => handleTagClick(tag)}
              onNewTags={tags => setAllTags(prev => [...new Set([...prev, ...tags])].sort())}
            />
          )}
        </div>
      </div>
    </>
  )
}
