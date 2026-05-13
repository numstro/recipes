import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function checkAdmin(req: NextRequest) {
  const key = req.headers.get('x-admin-key')
  return key === process.env.ADMIN_KEY
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [usersRes, deletedRes, logsRes, bansRes] = await Promise.all([
    supabase.auth.admin.listUsers(),
    supabase
      .from('recipes')
      .select('id,url,title,description,image_url,favicon_url,domain,added_by,saved_at,deleted_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
    supabase
      .from('recipe_logs')
      .select('id,recipe_id,user_id,ip_address,action,created_at,recipes(title,url)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('banned_ips')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  const users = (usersRes.data?.users ?? []).map(u => ({
    id: u.id,
    email: u.email,
    display_name: u.user_metadata?.display_name ?? null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }))

  // Build user lookup for logs
  const userMap: Record<string, string> = {}
  for (const u of usersRes.data?.users ?? []) {
    userMap[u.id] = u.user_metadata?.display_name ?? u.email ?? u.id
  }

  const deletedRecipes = (deletedRes.data ?? []).map((r: any) => ({
    ...r,
    added_by_name: r.added_by ? (userMap[r.added_by] ?? null) : null,
  }))

  const logs = (logsRes.data ?? []).map((l: any) => ({
    ...l,
    user_name: l.user_id ? (userMap[l.user_id] ?? null) : null,
  }))

  return NextResponse.json({
    users,
    deleted_recipes: deletedRecipes,
    logs,
    banned_ips: bansRes.data ?? [],
  })
}
