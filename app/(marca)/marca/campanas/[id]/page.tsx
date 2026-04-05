import { redirect } from 'next/navigation'

export default function MarcaCampanaPage({ params }: { params: { id: string } }) {
  redirect(`/marca/campanas/${params.id}/detalle`)
}
