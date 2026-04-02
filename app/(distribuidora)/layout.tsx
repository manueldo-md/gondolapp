import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DistriShell } from './distri-shell'

export default async function DistriLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: profile } = await db
    .from('profiles')
    .select('tipo_actor, distri_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.tipo_actor !== 'distribuidora') {
    redirect('/auth')
  }

  let empresa = 'Mi distribuidora'
  if (profile.distri_id) {
    const { data: distri } = await db
      .from('distribuidoras')
      .select('razon_social')
      .eq('id', profile.distri_id)
      .single()
    if (distri?.razon_social) empresa = distri.razon_social
  }

  return <DistriShell empresa={empresa}>{children}</DistriShell>
}
