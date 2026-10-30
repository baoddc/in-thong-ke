import { assertEquals } from 'jsr:@std/assert@1'
import { makeUsername, nextFreeUsername } from './username.ts'

Deno.test('makeUsername theo D-013', () => {
  assertEquals(makeUsername('Lê Thái Bão'), 'bao.lt')
  assertEquals(makeUsername('Lê Thái Quốc'), 'quoc.lt')
  assertEquals(makeUsername('Nguyễn Văn Đức'), 'duc.nv')
  assertEquals(makeUsername('Bão'), 'bao')
  assertEquals(makeUsername('  Đỗ   Thị  Hồng  '), 'hong.dt')
  assertEquals(makeUsername('???'), '')
})

Deno.test('nextFreeUsername thêm số khi trùng', () => {
  assertEquals(nextFreeUsername('bao.lt', []), 'bao.lt')
  assertEquals(nextFreeUsername('bao.lt', ['bao.lt']), 'bao.lt2')
  assertEquals(nextFreeUsername('bao.lt', ['BAO.LT', 'bao.lt2']), 'bao.lt3')
})
