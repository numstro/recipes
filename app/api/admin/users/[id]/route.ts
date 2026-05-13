import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function checkAdmin(req: NextRequest) {
  return req.headers.get('x-admin-key') === process.env.ADMIN_KEY
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
