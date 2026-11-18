// Pruebas del módulo de impacto ambiental (reglas de cálculo y flujo de estado).
import { describe, it, expect } from 'vitest';
import {
  summarize, series, progress, sanitizeSubstitution, confirmedSubstitutions, massGramsOf, periodStart, emissionsEstimate, MAX_SUBSTITUTED,
} from './impact.js';
import { reducer, freshState } from './store.jsx';
import { newCode } from './utils.js';
import { PROMOTIONS } from './seed.js';

const DAY = 86400000;
const NOW = Date.now();
const tx = (o = {}) => ({
  id: `T${Math.random()}`, userId: 'u1', restaurantId: 'r1', status: 'verificada', containerAccepted: true,
  substitution: 'confirmada', substitutedCount: 1, discount: 15, createdAt: NOW - DAY, validatedAt: NOW - DAY, packagingRef: null, ...o,
});

// Estado limpio para probar el flujo real del reducer.
function base() {
  const s = freshState();
  return { ...s, transactions: [], codes: [], staff: 'Mariana' };
}
function studentGenerates(s, promoId = 'p1', userId = 'u1') {
  const code = newCode(PROMOTIONS.findIndex((p) => p.id === promoId));
  return [reducer(s, { type: 'GENERATE_CODE', promoId, userId, alias: 'Luis', code }), code];
}
function restaurantValidates(s, code, extra = {}) {
  const promo = PROMOTIONS.find((p) => p.id === s.codes.find((c) => c.code === code).promoId);
  return reducer(s, { type: 'VALIDATE', payload: { code, restaurantId: promo.restaurantId, containerAccepted: true, substitution: 'confirmada', substitutedCount: 1, listPrice: promo.price, discount: promo.discount, ...extra } });
}

describe('1. Usuario sin compras', () => {
  it('no muestra impacto ni masa, sin ceros engañosos de masa', () => {
    const m = summarize([], { userId: 'u1' });
    expect(m.substituted).toBe(0);
    expect(m.topperPurchases).toBe(0);
    expect(m.massKg).toBeNull();
    expect(m.confirmedRate).toBeNull();
  });
});

describe('2. Primera compra con sustitución confirmada', () => {
  it('cuenta 1 recipiente y 1 compra con topper', () => {
    let s = base(); let code;
    [s, code] = studentGenerates(s);
    s = restaurantValidates(s, code);
    const m = summarize(s.transactions, { userId: 'u1' });
    expect(m.topperPurchases).toBe(1);
    expect(m.substituted).toBe(1);
    expect(progress(m.substituted).achieved).toEqual([1]);
    expect(s.transactions[0].audit[0].by).toBe('Mariana');
  });
});

describe('3. Compra con topper sin sustitución confirmada', () => {
  it('"No" y "No se puede determinar" no suman recipientes', () => {
    const list = [tx({ substitution: 'no', substitutedCount: 0 }), tx({ substitution: 'indeterminado', substitutedCount: 0 })];
    const m = summarize(list);
    expect(m.topperPurchases).toBe(2);
    expect(m.substituted).toBe(0);
    expect(m.indeterminate).toBe(1);
  });
  it('una respuesta desconocida nunca se convierte en sustitución', () => {
    expect(sanitizeSubstitution({ containerAccepted: true, substitution: undefined, substitutedCount: 3 })).toEqual({ substitution: 'indeterminado', substitutedCount: 0 });
    expect(sanitizeSubstitution({ containerAccepted: true, substitution: 'algo', substitutedCount: 3 })).toEqual({ substitution: 'indeterminado', substitutedCount: 0 });
    expect(sanitizeSubstitution({ containerAccepted: false, substitution: 'confirmada', substitutedCount: 3 })).toEqual({ substitution: 'no_aplica', substitutedCount: 0 });
  });
});

describe('4. Compra cancelada / rechazada / pendiente', () => {
  it('no genera impacto', () => {
    const list = [tx({ status: 'rechazada', containerAccepted: false }), tx({ status: 'pendiente' }), tx({ status: 'duplicada' })];
    expect(summarize(list).substituted).toBe(0);
    expect(summarize(list).pending).toBe(1);
  });
  it('un código cancelado no se puede validar', () => {
    let s = base(); let code;
    [s, code] = studentGenerates(s);
    s = reducer(s, { type: 'CANCEL_CODE', code });
    s = restaurantValidates(s, code);
    expect(s.transactions).toHaveLength(0);
  });
});

describe('5. QR duplicado', () => {
  it('validar el mismo código dos veces no duplica la transacción ni el impacto', () => {
    let s = base(); let code;
    [s, code] = studentGenerates(s);
    s = restaurantValidates(s, code);
    s = restaurantValidates(s, code);
    expect(s.transactions).toHaveLength(1);
    expect(summarize(s.transactions).substituted).toBe(1);
  });
});

describe('6. Varias sustituciones en una compra', () => {
  it('suma la cantidad confirmada y la limita en el servidor', () => {
    let s = base(); let code;
    [s, code] = studentGenerates(s);
    s = restaurantValidates(s, code, { substitutedCount: 3 });
    expect(summarize(s.transactions).substituted).toBe(3);
    expect(sanitizeSubstitution({ containerAccepted: true, substitution: 'confirmada', substitutedCount: 999 }).substitutedCount).toBe(MAX_SUBSTITUTED);
    expect(sanitizeSubstitution({ containerAccepted: true, substitution: 'confirmada', substitutedCount: 0 }).substitution).toBe('no');
    expect(sanitizeSubstitution({ containerAccepted: true, substitution: 'confirmada', substitutedCount: 2.7 }).substitutedCount).toBe(2);
  });
});

describe('7. Transacción revertida', () => {
  it('deja de contabilizarse, queda auditada y es idempotente', () => {
    let s = base(); let code;
    [s, code] = studentGenerates(s);
    s = restaurantValidates(s, code, { substitutedCount: 2 });
    const id = s.transactions[0].id;
    s = reducer(s, { type: 'REVERT_TX', id, reason: 'Error de registro' });
    const again = reducer(s, { type: 'REVERT_TX', id, reason: 'otra' });
    expect(again).toBe(s);
    expect(s.transactions[0].status).toBe('revertida');
    expect(s.transactions[0].audit.map((a) => a.action)).toEqual(['verificada', 'revertida']);
    expect(summarize(s.transactions).substituted).toBe(0);
    expect(summarize(s.transactions).reverted).toBe(1);
  });
});

describe('8. Historial acumulado', () => {
  it('acumula varias compras y calcula ahorro sin confundirlo con impacto', () => {
    const list = [tx({ substitutedCount: 2 }), tx(), tx({ substitution: 'no', substitutedCount: 0, discount: 10 })];
    const m = summarize(list);
    expect(m.substituted).toBe(3);
    expect(m.topperPurchases).toBe(3);
    expect(m.savings).toBe(40);
  });
});

describe('9. Cambio de rango de fechas', () => {
  it('filtra por 7, 30, 90 días e histórico', () => {
    const list = [tx({ validatedAt: NOW - 2 * DAY }), tx({ validatedAt: NOW - 20 * DAY }), tx({ validatedAt: NOW - 60 * DAY }), tx({ validatedAt: NOW - 200 * DAY })];
    expect(summarize(list, { since: periodStart('7d', NOW) }).substituted).toBe(1);
    expect(summarize(list, { since: periodStart('30d', NOW) }).substituted).toBe(2);
    expect(summarize(list, { since: periodStart('90d', NOW) }).substituted).toBe(3);
    expect(summarize(list, { since: periodStart('all', NOW) }).substituted).toBe(4);
    const ser = series(list, { period: '30d', now: NOW });
    expect(ser.points.reduce((n, p) => n + p.substituted, 0)).toBe(2);
  });
});

describe('10. Peso de envase no configurado', () => {
  it('la masa queda pendiente y no se inventa', () => {
    const m = summarize([tx({ substitutedCount: 2 })]);
    expect(m.massKg).toBeNull();
    expect(m.massCoverage).toEqual({ withRef: 0, withoutRef: 2 });
    expect(massGramsOf(tx())).toBeNull();
  });
  it('con referencia configurada usa la copia guardada en la transacción', () => {
    let s = base();
    s = reducer(s, { type: 'SAVE_PKG_REF', ref: { id: 'plastico', grams: 20, source: 'Pesaje propio' } });
    let code;
    [s, code] = studentGenerates(s, 'p1');
    s = restaurantValidates(s, code, { substitutedCount: 2, packagingTypeId: 'plastico' });
    // cambiar después la referencia no altera el histórico
    s = reducer(s, { type: 'SAVE_PKG_REF', ref: { id: 'plastico', grams: 35, source: 'Ficha técnica' } });
    const m = summarize(s.transactions);
    expect(m.massKg).toBeCloseTo(0.04);
    expect(s.transactions[0].packagingRef).toMatchObject({ grams: 20, version: 1 });
    expect(s.packagingRefs.find((r) => r.id === 'plastico')).toMatchObject({ grams: 35, version: 2 });
  });
  it('rechaza pesos no válidos', () => {
    const s = reducer(base(), { type: 'SAVE_PKG_REF', ref: { id: 'carton', grams: -5, source: 'x' } });
    expect(s.packagingRefs.find((r) => r.id === 'carton').grams).toBeNull();
  });
});

describe('11. Acceso a datos de otro usuario', () => {
  it('el resumen individual solo incluye transacciones del usuario', () => {
    const list = [tx({ userId: 'u1' }), tx({ userId: 'u2', substitutedCount: 4 })];
    expect(summarize(list, { userId: 'u1' }).substituted).toBe(1);
    expect(summarize(list, { userId: 'u2' }).substituted).toBe(4);
    expect(summarize(list, { userId: 'u3' }).substituted).toBe(0);
  });
});

describe('12. Cálculo agregado institucional', () => {
  it('participantes, recurrentes, restaurantes activos y % confirmado', () => {
    const list = [
      tx({ userId: 'a', restaurantId: 'r1' }), tx({ userId: 'a', restaurantId: 'r2', substitution: 'no', substitutedCount: 0 }),
      tx({ userId: 'b', restaurantId: 'r1', substitutedCount: 2 }), tx({ userId: 'c', status: 'revertida' }),
      tx({ userId: 'd', synthetic: true }),
    ];
    const m = summarize(list, { includeSynthetic: false });
    expect(m.participants).toBe(2);
    expect(m.recurrent).toBe(1);
    expect(m.activeRestaurants).toBe(2);
    expect(m.substituted).toBe(3);
    expect(m.confirmedRate).toBeCloseTo(2 / 3);
    expect(summarize(list, { restaurantId: 'r2' }).substituted).toBe(0);
  });
});

describe('13. Actualización de indicadores tras una compra', () => {
  it('el impacto sube al validar y el progreso avanza', () => {
    let s = base(); let code;
    const before = summarize(s.transactions, { userId: 'u1' }).substituted;
    [s, code] = studentGenerates(s);
    expect(summarize(s.transactions, { userId: 'u1' }).substituted).toBe(before); // generar QR no suma
    s = restaurantValidates(s, code, { substitutedCount: 4 });
    const after = summarize(s.transactions, { userId: 'u1' }).substituted;
    expect(after).toBe(before + 4);
    expect(progress(after)).toMatchObject({ next: 5, remaining: 1 });
  });
  it('una operación pendiente solo cuenta al sincronizar', () => {
    let s = base(); let code;
    [s, code] = studentGenerates(s);
    s = reducer(s, { type: 'REGISTER_PENDING', payload: { code, folio: 'PEND-1', restaurantId: 'r1', promoId: 'p1', containerAccepted: true, substitution: 'confirmada', substitutedCount: 1, listPrice: 120, discount: 15 } });
    expect(summarize(s.transactions).substituted).toBe(0);
    s = reducer(s, { type: 'SYNC_PENDING', restaurantId: 'r1' });
    expect(summarize(s.transactions).substituted).toBe(1);
  });
});

describe('Otras reglas', () => {
  it('no se calcula CO₂e sin metodología', () => {
    expect(emissionsEstimate()).toMatchObject({ available: false, value: null });
  });
  it('registros previos sin cantidad cuentan 1 y se marcan como incompletos', () => {
    const legacy = tx(); delete legacy.substitutedCount;
    expect(confirmedSubstitutions(legacy)).toBe(1);
    expect(summarize([legacy]).legacyCount).toBe(1);
  });
});
