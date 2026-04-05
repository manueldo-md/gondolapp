import { redirect } from 'next/navigation'

export default function AdminCampanaPage({ params }: { params: { id: string } }) {
  redirect(`/admin/campanas/${params.id}/detalle`)
}
