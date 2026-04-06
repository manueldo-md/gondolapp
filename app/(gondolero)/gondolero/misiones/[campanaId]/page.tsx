import { redirect } from 'next/navigation'

export default function MisionDetallePage({
  params,
}: {
  params: { campanaId: string }
}) {
  redirect(`/gondolero/campanas/${params.campanaId}`)
}
