import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_KEY
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ip_address, reason, expires_hours } = await req.json()
  if (!ip_address) return NextResponse.json({ error: 'ip_address required' }, { status: 400 })

  const expires_at = expires_hours
    ? new Date(Date.now() + expires_hours * 3600 * 1000).toISOString()
    : null

  const { data, error } = await supabase
    .from('banned_ips')
    .upsert({ ip_address, reason: reason || null, expires_at, is_active: true }, { onConflict: 'ip_address' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ban: data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ip_address } = await req.json()
  const { error } = await supabase
    .from('banned_ips')
    .update({ is_active: false })
    .eq('ip_address', ip_address)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
