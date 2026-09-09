'use server'

import { revalidatePath } from 'next/cache'
import {
  aprobarFoto as aprobarFotoBase,
  rechazarFoto as rechazarFotoBase,
} from '../../../../../(distribuidora)/distribuidora/gondolas/actions'

export async function aprobarFoto(fotoId: string) {
  await aprobarFotoBase(fotoId)
  revalidatePath('/repositora/gondolas')
}

export async function rechazarFoto(fotoId: string, motivoRechazo?: string) {
  await rechazarFotoBase(fotoId, motivoRechazo)
  revalidatePath('/repositora/gondolas')
}
