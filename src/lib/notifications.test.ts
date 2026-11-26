import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('fillParams', () => {
  it('reemplaza las variables conocidas y deja las desconocidas', async () => {
    const { fillParams } = await import('./notifications')
    const vars = { '{nombre}': 'Ana', '{saldo}': 'RD$1,500.00' }
    expect(fillParams(['Hola {nombre}', 'Debes {saldo}', '{otra} fija'], vars)).toEqual(['Hola Ana', 'Debes RD$1,500.00', '{otra} fija'])
  })

  it('reemplaza varias veces la misma variable', async () => {
    const { fillParams } = await import('./notifications')
    expect(fillParams(['{nombre} {nombre}'], { '{nombre}': 'Luis' })).toEqual(['Luis Luis'])
  })
})
