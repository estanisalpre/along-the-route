import { describe, expect, it } from 'vitest'
import { DAY_STYLE, NIGHT_STYLE, getMapStyleUrl, getSunTint } from './timeOfDay'

function atHour(hour: number, minute = 0): Date {
  const d = new Date(2026, 0, 1, 0, 0, 0, 0)
  d.setHours(hour, minute, 0, 0)
  return d
}

function alphaOf(rgba: string): number {
  return Number(rgba.match(/[\d.]+\)$/)![0].replace(')', ''))
}

describe('getMapStyleUrl', () => {
  it('usa el estilo de noche de madrugada y a la noche', () => {
    expect(getMapStyleUrl(atHour(2))).toBe(NIGHT_STYLE)
    expect(getMapStyleUrl(atHour(23))).toBe(NIGHT_STYLE)
  })

  it('usa el estilo de día durante el día', () => {
    expect(getMapStyleUrl(atHour(12))).toBe(DAY_STYLE)
  })
})

describe('getSunTint', () => {
  it('es transparente en pleno día y en plena noche', () => {
    expect(alphaOf(getSunTint(atHour(12)))).toBe(0)
    expect(alphaOf(getSunTint(atHour(2)))).toBe(0)
  })

  it('es transparente justo en el momento exacto en que cambia el estilo (6:00 y 19:00) — nunca se mezcla con el estilo del lado equivocado', () => {
    expect(alphaOf(getSunTint(atHour(6)))).toBe(0)
    expect(alphaOf(getSunTint(atHour(19)))).toBe(0)
  })

  it('el naranja aparece a media mañana y media tarde, siempre con el estilo de día ya puesto', () => {
    expect(alphaOf(getSunTint(atHour(6, 30)))).toBeGreaterThan(0)
    expect(alphaOf(getSunTint(atHour(18, 30)))).toBeGreaterThan(0)
    expect(getMapStyleUrl(atHour(6, 30))).toBe(DAY_STYLE)
    expect(getMapStyleUrl(atHour(18, 30))).toBe(DAY_STYLE)
  })

  it('es un efecto sutil, no un tinte fuerte', () => {
    expect(alphaOf(getSunTint(atHour(6, 30)))).toBeLessThan(0.2)
  })

  it('sube y baja de forma gradual, no de golpe', () => {
    const early = alphaOf(getSunTint(atHour(6, 10)))
    const peak = alphaOf(getSunTint(atHour(6, 30)))
    const late = alphaOf(getSunTint(atHour(6, 50)))
    expect(early).toBeGreaterThan(0)
    expect(early).toBeLessThan(peak)
    expect(late).toBeGreaterThan(0)
    expect(late).toBeLessThan(peak)
  })
})
