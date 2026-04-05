import { redirect } from 'next/navigation'

export default function DistriCampanaPage({ params }: { params: { id: string } }) {
  redirect(`/distribuidora/campanas/${params.id}/detalle`)
}
