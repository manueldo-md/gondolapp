/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Verifica y desbloquea logros para un gondolero.
 * Llamar después de cada aprobación de foto.
 * @returns claves de los logros nuevos desbloqueados.
 */
export async function verificarLogros(
  gondoleroId: string,
  adminClient: any,
  fotosAprobadas: number,
  campanaId?: string | null
): Promise<string[]> {
  try {
    // 1. Logros ya desbloqueados
    const { data: yaDesbloqueados } = await adminClient
      .from('gondolero_logros')
      .select('logro_clave')
      .eq('gondolero_id', gondoleroId)

    const clavesDesbloqueadas = new Set<string>(
      (yaDesbloqueados ?? []).map((l: any) => l.logro_clave as string)
    )

    // Si ya tiene todos los logros posibles (excepto podio que puede repetirse), salir rápido
    const clavesSinPodio = ['primera_foto', 'velocista', 'racha_7_dias', 'explorador', 'perfeccion', 'primera_campana', 'decacampeon']
    const todosDesbloqueados = clavesSinPodio.every(c => clavesDesbloqueadas.has(c)) && clavesDesbloqueadas.has('podio')
    if (todosDesbloqueados) return []

    // 2. Queries en paralelo para checks complejos
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const hace6Dias = new Date(hoy)
    hace6Dias.setDate(hoy.getDate() - 5) // 6 días incluyendo hoy

    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)

    const [
      participacionesRes,
      comerciosRes,
      fotosHoyRes,
      fotosStreakRes,
      fotosCampanaRes,
      fotosEsteMesRes,
    ] = await Promise.all([
      // campanasCompletadas
      adminClient
        .from('participaciones')
        .select('*', { count: 'exact', head: true })
        .eq('gondolero_id', gondoleroId)
        .eq('estado', 'completada'),

      // comercios distintos visitados
      adminClient
        .from('fotos')
        .select('comercio_id')
        .eq('gondolero_id', gondoleroId)
        .eq('estado', 'aprobada'),

      // fotos enviadas hoy (velocista: 10 en un día)
      adminClient
        .from('fotos')
        .select('*', { count: 'exact', head: true })
        .eq('gondolero_id', gondoleroId)
        .gte('created_at', hoy.toISOString()),

      // fotos últimos 6 días (racha)
      adminClient
        .from('fotos')
        .select('created_at')
        .eq('gondolero_id', gondoleroId)
        .gte('created_at', hace6Dias.toISOString()),

      // fotos por campaña (perfección: 100% aprobadas)
      adminClient
        .from('fotos')
        .select('campana_id, estado')
        .eq('gondolero_id', gondoleroId),

      // fotos este mes (para podio)
      adminClient
        .from('fotos')
        .select('*', { count: 'exact', head: true })
        .eq('gondolero_id', gondoleroId)
        .eq('estado', 'aprobada')
        .gte('created_at', inicioMes.toISOString()),
    ])

    const campanasCompletadas  = participacionesRes.count ?? 0
    const comerciosVisitados   = new Set(
      (comerciosRes.data ?? []).map((f: any) => f.comercio_id as string)
    ).size
    const fotosHoy             = fotosHoyRes.count ?? 0
    const fotosEsteMesCount    = fotosEsteMesRes.count ?? 0

    // Verificar racha de 6 días consecutivos
    const diasConActividad = new Set<string>(
      (fotosStreakRes.data ?? []).map((f: any) => (f.created_at as string).split('T')[0])
    )
    const tieneRacha = checkRacha(diasConActividad, 6)

    // Perfección: alguna campaña con 100% fotos aprobadas (mínimo 3)
    const campanaMap = new Map<string, { total: number; aprobadas: number }>()
    for (const f of fotosCampanaRes.data ?? []) {
      const fo = f as { campana_id: string; estado: string }
      if (!campanaMap.has(fo.campana_id)) {
        campanaMap.set(fo.campana_id, { total: 0, aprobadas: 0 })
      }
      const s = campanaMap.get(fo.campana_id)!
      s.total++
      if (fo.estado === 'aprobada') s.aprobadas++
    }
    const tienePerfeccion = [...campanaMap.values()].some(
      s => s.total >= 3 && s.total === s.aprobadas
    )

    // Podio: solo comprobar si tiene >= 3 fotos este mes y no lo tiene aún
    let esPodio = false
    if (fotosEsteMesCount >= 3 && !clavesDesbloqueadas.has('podio')) {
      const { data: allFotos } = await adminClient
        .from('fotos')
        .select('gondolero_id')
        .eq('estado', 'aprobada')
        .gte('created_at', inicioMes.toISOString())

      const cuentas = new Map<string, number>()
      for (const f of allFotos ?? []) {
        const id = (f as { gondolero_id: string }).gondolero_id
        cuentas.set(id, (cuentas.get(id) ?? 0) + 1)
      }
      const top3 = [...cuentas.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id)
      esPodio = top3.includes(gondoleroId)
    }

    // 3. Candidatos a desbloquear
    const candidatos: Array<{ clave: string; cumple: boolean }> = [
      { clave: 'primera_foto',    cumple: fotosAprobadas >= 1 },
      { clave: 'velocista',       cumple: fotosHoy >= 10 },
      { clave: 'racha_7_dias',    cumple: tieneRacha },
      { clave: 'explorador',      cumple: comerciosVisitados >= 10 },
      { clave: 'perfeccion',      cumple: tienePerfeccion },
      { clave: 'podio',           cumple: esPodio },
      { clave: 'primera_campana', cumple: campanasCompletadas >= 1 },
      { clave: 'decacampeon',     cumple: campanasCompletadas >= 10 },
    ]

    const nuevos = candidatos.filter(c => c.cumple && !clavesDesbloqueadas.has(c.clave))
    if (!nuevos.length) return []

    // 4. Frases de los logros nuevos
    const { data: logrosData } = await adminClient
      .from('logros')
      .select('clave, frases')
      .in('clave', nuevos.map(n => n.clave))

    const logrosMap = new Map<string, string[]>()
    for (const l of logrosData ?? []) {
      logrosMap.set(l.clave as string, l.frases as string[] ?? [])
    }

    // 5. Desbloquear + notificar
    const clavesDesbloqueadasAhora: string[] = []
    for (const logro of nuevos) {
      const frases = logrosMap.get(logro.clave) ?? []
      const frase  = frases.length
        ? frases[Math.floor(Math.random() * frases.length)]
        : '¡Lograste un nuevo badge!'

      const { error } = await adminClient
        .from('gondolero_logros')
        .upsert({
          gondolero_id:   gondoleroId,
          logro_clave:    logro.clave,
          frase_mostrada: frase,
        }, { onConflict: 'gondolero_id,logro_clave', ignoreDuplicates: true })

      if (!error) {
        clavesDesbloqueadasAhora.push(logro.clave)
        await adminClient.from('notificaciones').insert({
          gondolero_id: gondoleroId,
          tipo:         'foto_aprobada',
          titulo:       '🏅 ¡Nuevo logro desbloqueado!',
          mensaje:      frase,
          campana_id:   campanaId ?? null,
        })
      }
    }

    return clavesDesbloqueadasAhora
  } catch (err) {
    console.error('verificarLogros error:', err)
    return []
  }
}

/**
 * Comprueba si hay N días consecutivos con actividad hasta hoy.
 */
function checkRacha(days: Set<string>, streak: number): boolean {
  if (days.size < streak) return false
  const hoy = new Date()
  for (let i = 0; i < streak; i++) {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() - i)
    const key = d.toISOString().split('T')[0]
    if (!days.has(key)) return false
  }
  return true
}
