import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { MarcaShell } from './marca-shell'

export default async function MarcaLayout({
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
    .select('tipo_actor, marca_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.tipo_actor !== 'marca') redirect('/auth')

  let empresa = 'Mi marca'
  let tokensDisponibles = 0

  if (profile.marca_id) {
    const admin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: marca } = await admin
      .from('marcas')
      .select('razon_social, tokens_disponibles')
      .eq('id', profile.marca_id)
      .single()
    if (marca) {
      empresa = marca.razon_social ?? empresa
      tokensDisponibles = marca.tokens_disponibles ?? 0
    }
  }

  return (
    <MarcaShell empresa={empresa} tokensDisponibles={tokensDisponibles}>
      {children}
    </MarcaShell>
  )
}
