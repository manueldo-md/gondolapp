import { redirect } from 'next/navigation'

export default function RepoCampanaPage({ params }: { params: { id: string } }) {
  redirect(`/repositora/campanas/${params.id}/detalle`)
}
