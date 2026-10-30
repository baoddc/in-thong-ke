import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'

export default function WorkflowPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Luồng công việc"
        description="Sơ đồ quy trình nghiệp vụ & luồng dữ liệu hệ thống Thống kê vận chuyển"
      >
        <a
          href="/luong-cong-viec.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center"
        >
          <Button variant="primary" icon="expand">
            Mở toàn màn hình
          </Button>
        </a>
      </PageHeader>

      <div className="overflow-hidden rounded-card border border-stone-200 bg-white shadow-card">
        <iframe
          src="/luong-cong-viec.html"
          title="Sơ đồ luồng công việc"
          className="h-[calc(100vh-12rem)] min-h-[640px] w-full border-0"
        />
      </div>
    </div>
  )
}

