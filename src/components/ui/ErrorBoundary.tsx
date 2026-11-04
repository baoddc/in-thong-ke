import { Component, type ReactNode } from 'react'

/** Lỗi khi vẽ phần phụ (presence...) không được làm sập cả ứng dụng: lỗi thì hiện fallback (mặc định không hiện gì). */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) { console.error('ErrorBoundary', err) }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children }
}
