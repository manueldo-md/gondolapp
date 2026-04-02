import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// Cliente de Supabase para uso en el browser (Client Components)
// Usar SOLO en componentes con 'use client'
// Para Server Components usar el client de server.ts

let client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  // Singleton para evitar múltiples instancias en el browser
  if (!client) {
    client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}
