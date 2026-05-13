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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description, notes, ingredients, steps, tags, servings } = body

  const update: Record<string, unknown> = { title, description, notes, ingredients, steps, tags }
  if ('servings' in body) update.servings = servings ?? null

  const { data, error } = await supabase
    .from('recipes')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('recipe_logs').insert({
    recipe_id: Number(id),
    user_id: user.id,
    ip_address: getIP(req),
    action: 'update',
  })

  return NextResponse.json({ recipe: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('recipes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('recipe_logs').insert({
    recipe_id: Number(id),
    user_id: user.id,
    ip_address: getIP(req),
    action: 'delete',
  })

  return NextResponse.json({ ok: true })
}
