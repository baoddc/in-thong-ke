export default function WorkflowPage() {
  return (
    <div className="-m-3 flex min-h-[640px] flex-1 flex-col overflow-hidden bg-[#050b18] md:-m-6">
      <h1 className="sr-only">Luồng công việc</h1>
      <iframe src="/luong-cong-viec.html" title="Sơ đồ luồng công việc" className="w-full flex-1 border-0" />
    </div>
  )
}
