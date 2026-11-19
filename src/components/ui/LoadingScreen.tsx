import { useLayoutEffect } from 'react'

let active = 0 // số LoadingScreen đang gắn; chuyển giữa các màn chờ (gỡ rồi gắn lại ngay) không được tính là "vào app"

function enter(boot: HTMLElement) {
  boot.getAnimations({ subtree: true }).forEach((a) => { if (a instanceof Animation && !(a instanceof CSSAnimation)) a.cancel() })
  boot.classList.remove('leaving')
  boot.style.opacity = '1'
  boot.style.pointerEvents = 'auto'
}

/** Vào app: nền màn chờ mờ đi, logo giữa màn bay lên vị trí logo thanh menu rồi ẩn (không có logo thanh menu, ví dụ trang đăng nhập → chỉ mờ đi). */
function leave(boot: HTMLElement) {
  boot.style.pointerEvents = 'none'
  const img = boot.querySelector('.ring img')
  const to = document.querySelector('[data-testid="brand"] img')?.getBoundingClientRect()
  const from = img?.getBoundingClientRect()
  const fade = () => { boot.style.opacity = '0' }
  if (!img || !from || !to || to.width < 4 || matchMedia('(prefers-reduced-motion: reduce)').matches) return fade()
  boot.classList.add('leaving')
  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  img.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})` }], { duration: 550, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' }).onfinish = fade
}

/** Màn chờ là #boot trong index.html (nằm ngoài React, nên animation không bị dựng lại giữa các lần chờ). Component này chỉ bật/tắt nó. */
export default function LoadingScreen() {
  useLayoutEffect(() => {
    const boot = document.getElementById('boot')
    if (!boot) return
    active++
    enter(boot)
    return () => { active--; requestAnimationFrame(() => { if (active === 0) leave(boot) }) }
  }, [])
  return null
}
