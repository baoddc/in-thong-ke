import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import Icon from './Icon'

export type ToastItem = { id: number; kind: 'success' | 'error'; message: string }
type Action = { type: 'add'; toast: ToastItem } | { type: 'remove'; id: number }

export const TOAST_MS = 4000
const MAX_TOASTS = 4

export function toastReducer(state: ToastItem[], a: Action): ToastItem[] {
  return a.type === 'add' ? [...state, a.toast].slice(-MAX_TOASTS) : state.filter((t) => t.id !== a.id)
}

type Api = { success: (message: string) => void; error: (message: string) => void }
const Ctx = createContext<Api | null>(null)

export function useToast(): Api {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast phải nằm trong <ToastProvider>')
  return api
}

function Item({ toast, dispatch }: { toast: ToastItem; dispatch: (a: Action) => void }) {
  const isError = toast.kind === 'error'
  const { id } = toast
  const onClose = () => dispatch({ type: 'remove', id })
  useEffect(() => {
    if (isError) return // lỗi không tự ẩn, người dùng phải đọc và đóng
    const t = setTimeout(() => dispatch({ type: 'remove', id }), TOAST_MS) // dispatch ổn định → hẹn giờ không bị đặt lại khi có toast khác
    return () => clearTimeout(t)
  }, [isError, id, dispatch])

  return (
    <div role={isError ? 'alert' : 'status'} data-testid={`toast-${toast.kind}`}
      className={`pointer-events-auto flex animate-slide-up items-start gap-2 rounded-card border-l-4 p-3 shadow-lg ring-1 ring-black/5 ${isError ? 'border-red-950 bg-danger text-white' : 'border-green-600 bg-white text-gray-900'}`}>
      <Icon name={isError ? 'alert' : 'check'} className={`mt-0.5 ${isError ? '' : 'text-green-700'}`} />
      <p className="flex-1 break-words">{toast.message}</p>
      <button type="button" onClick={onClose} aria-label="Đóng thông báo"
        className="-m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl leading-none transition-colors duration-150 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">×</button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, [])
  const nextId = useRef(0)
  const api = useMemo<Api>(() => {
    const add = (kind: ToastItem['kind']) => (message: string) => dispatch({ type: 'add', toast: { id: ++nextId.current, kind, message } })
    return { success: add('success'), error: add('error') }
  }, [])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col gap-2 sm:left-auto sm:w-96 print:hidden" data-testid="toast-region">
        {toasts.map((t) => <Item key={t.id} toast={t} dispatch={dispatch} />)}
      </div>
    </Ctx.Provider>
  )
}
