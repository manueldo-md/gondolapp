export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded w-24" />
                <div className="h-7 bg-gray-200 rounded w-16" />
              </div>
              <div className="w-10 h-10 bg-gray-200 rounded-xl" />
            </div>
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="h-4 bg-gray-200 rounded w-40 animate-pulse" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 animate-pulse">
            <div className="w-14 h-14 bg-gray-200 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-gray-200 rounded w-32" />
              <div className="h-3 bg-gray-200 rounded w-20" />
            </div>
            <div className="h-5 bg-gray-200 rounded-full w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
