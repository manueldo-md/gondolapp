// ── Helpers para relaciones gondolero ↔ distribuidora ────────────────────────
// Fuente de verdad: gondolero_distri_solicitudes (no profiles.distri_id)
// - estado = 'aprobada'  → vinculado actualmente
// - estado = 'terminada' → desvinculado (histórico)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getGondolerosDeDistri(
  distriId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  incluyeHistorico: boolean = true
): Promise<string[]> {
  const estados = incluyeHistorico ? ['aprobada', 'terminada'] : ['aprobada']

  const { data } = await adminClient
    .from('gondolero_distri_solicitudes')
    .select('gondolero_id')
    .eq('distri_id', distriId)
    .in('estado', estados)

  return (data ?? []).map((d: { gondolero_id: string }) => d.gondolero_id)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getDistrisDeGondolero(
  gondoleroId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any
): Promise<string[]> {
  const { data } = await adminClient
    .from('gondolero_distri_solicitudes')
    .select('distri_id')
    .eq('gondolero_id', gondoleroId)
    .eq('estado', 'aprobada')

  return (data ?? []).map((d: { distri_id: string }) => d.distri_id)
}
