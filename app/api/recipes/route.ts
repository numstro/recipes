import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function getIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

async function getUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data } = await supabase.auth.getUser(token)
  return data.user ?? null
}

async function isBanned(ip: string): Promise<boolean> {
  const { data } = await supabase
    .from('banned_ips')
    .select('id')
    .eq('ip_address', ip)
    .eq('is_active', true)
    .or('expires_at.is.null,expires_at.gt.now()')
    .maybeSingle()
  return !!data
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const tagsParam = searchParams.get('tags')
  const tags = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : []

  let query = supabase
    .from('recipes')
    .select('id,url,title,description,image_url,favicon_url,domain,notes,ingredients,steps,tags,servings,added_by,saved_at,updated_at')
    .is('deleted_at', null)
    .order('saved_at', { ascending: false })

  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,domain.ilike.%${q}%,notes.ilike.%${q}%`)
  }
  if (tags.length > 0) {
    // AND: recipes must contain every selected tag
    for (const tag of tags) {
      query = query.filter('tags', 'cs', JSON.stringify([tag]))
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach display_name for each recipe's added_by
  const userIds = [...new Set((data ?? []).map((r: any) => r.added_by).filter(Boolean))]
  let displayNames: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: users } = await supabase.auth.admin.listUsers()
    for (const u of users?.users ?? []) {
      displayNames[u.id] = u.user_metadata?.display_name ?? u.email ?? u.id
    }
  }

  const recipes = (data ?? []).map((r: any) => ({
    ...r,
    added_by_name: displayNames[r.added_by] ?? null,
  }))

  return NextResponse.json({ recipes })
}

export async function POST(req: NextRequest) {
  const ip = getIP(req)
  if (await isBanned(ip)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { url, title, description, image_url, favicon_url, domain, notes, ingredients, steps, tags, text_snapshot, servings } = body

  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('recipes')
    .insert({
      url,
      title: title || null,
      description: description || null,
      image_url: image_url || null,
      favicon_url: favicon_url || null,
      domain: domain || null,
      notes: notes || '',
      ingredients: ingredients || [],
      steps: steps || [],
      tags: tags || [],
      servings: servings ?? null,
      text_snapshot: text_snapshot || null,
      added_by: user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // Check if it's soft-deleted — if so, restore it
      const { data: existing } = await supabase
        .from('recipes')
        .select()
        .eq('url', url)
        .not('deleted_at', 'is', null)
        .single()

      if (existing) {
        const { data: restored, error: restoreError } = await supabase
          .from('recipes')
          .update({
            deleted_at: null,
            saved_at: new Date().toISOString(),
            title: title || existing.title,
            description: description || existing.description,
            image_url: image_url || existing.image_url,
            favicon_url: favicon_url || existing.favicon_url,
            domain: domain || existing.domain,
            ingredients: ingredients?.length ? ingredients : existing.ingredients,
            steps: steps?.length ? steps : existing.steps,
            servings: servings ?? existing.servings,
            added_by: user.id,
          })
          .eq('url', url)
          .select()
          .single()

        if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 })

        await supabase.from('recipe_logs').insert({
          recipe_id: restored.id,
          user_id: user.id,
          ip_address: ip,
          action: 'create',
        })

        return NextResponse.json({ recipe: restored }, { status: 201 })
      }

      return NextResponse.json({ error: 'Recipe already saved' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log the action
  await supabase.from('recipe_logs').insert({
    recipe_id: data.id,
    user_id: user.id,
    ip_address: ip,
    action: 'create',
  })

  return NextResponse.json({ recipe: data }, { status: 201 })
}
