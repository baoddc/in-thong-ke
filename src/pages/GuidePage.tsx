/** Hướng dẫn sử dụng: trang HTML tĩnh (public/tai-lieu-huong-dan) nhúng vào khung nội dung, giữ nguyên menu như các trang khác. */
export default function GuidePage() {
  return (
    <div className="-m-3 flex min-h-[640px] flex-1 flex-col overflow-hidden bg-white md:-m-6">
      <h1 className="sr-only">Hướng dẫn sử dụng</h1>
      <iframe src="/tai-lieu-huong-dan/index.html" title="Hướng dẫn sử dụng" className="w-full flex-1 border-0" />
    </div>
  )
}
