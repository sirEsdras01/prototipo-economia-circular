// DATOS SINTÉTICOS DE DEMOSTRACIÓN.
// Todos los restaurantes, promociones, usuarios y transacciones de este archivo son ficticios.
// No representan establecimientos reales, participantes confirmados ni resultados de campo.

import { COMMISSION_RATE, round2 } from './utils.js';

export const DEMO_USER = { id: 'u-demo', name: 'Ana', role: 'Estudiante (perfil de demostración)' };

export const RESTAURANTS = [
  { id: 'r1', name: 'Cocina Ceiba', cuisine: 'Comida corrida', walk: '4 min', pin: '1111',
    accepts: 'Recipiente rígido con tapa hermética, mínimo 1 L' },
  { id: 'r2', name: 'Bowl Norte', cuisine: 'Bowls y ensaladas', walk: '6 min', pin: '2222',
    accepts: 'Recipiente rígido con tapa, mínimo 750 ml' },
  { id: 'r3', name: 'Taquería El Andén', cuisine: 'Tacos', walk: '3 min', pin: '3333',
    accepts: 'Recipiente con tapa; separadores opcionales' },
  { id: 'r4', name: 'Café Lumbre', cuisine: 'Café y panadería', walk: '5 min', pin: '4444',
    accepts: 'Termo o vaso con tapa, 350–500 ml' },
  { id: 'r5', name: 'Wok 27', cuisine: 'Asiática', walk: '8 min', pin: '5555',
    accepts: 'Recipiente apto para alimentos calientes, con tapa' },
  { id: 'r6', name: 'La Parrilla del Patio', cuisine: 'Parrilla', walk: '7 min', pin: '6666',
    accepts: 'Recipiente rígido con tapa hermética, mínimo 1 L' },
];

export const PROMOTIONS = [
  { id: 'p1', restaurantId: 'r1', title: 'Comida corrida del día', product: 'Sopa, guisado, arroz y agua',
    price: 120, discount: 15, foodCost: 50, days: 'Lun–Vie', hours: '15:00–17:30', dailyCap: 20, perUser: '1 por persona al día',
    conditions: ['Recipiente limpio, seco y sin olores', 'Tapa hermética', 'Aplica solo para llevar'], active: true },
  { id: 'p7', restaurantId: 'r1', title: 'Sopa del día', product: 'Porción de 500 ml',
    price: 55, discount: 6, foodCost: 20, days: 'Lun–Vie', hours: '12:00–17:30', dailyCap: 15, perUser: '1 por persona al día',
    conditions: ['Recipiente apto para líquidos calientes', 'Tapa hermética'], active: true },
  { id: 'p2', restaurantId: 'r2', title: 'Bowl de pollo o tofu', product: 'Base, proteína y 3 toppings',
    price: 145, discount: 18, foodCost: 58, days: 'Lun–Jue', hours: '16:00–19:00', dailyCap: 15, perUser: '1 por persona al día',
    conditions: ['Recipiente de al menos 750 ml', 'Aderezo se sirve aparte si el cliente lo trae'], active: true },
  { id: 'p3', restaurantId: 'r3', title: 'Orden de 4 tacos', product: 'Pastor, bistec o mixtos',
    price: 95, discount: 12, foodCost: 38, days: 'Lun–Jue', hours: '14:00–17:00', dailyCap: 25, perUser: '1 por persona al día',
    conditions: ['Recipiente con tapa', 'Salsas en recipiente propio o sin salsa'], active: true },
  { id: 'p4', restaurantId: 'r4', title: 'Americano o té en termo', product: '12 oz',
    price: 45, discount: 8, foodCost: 12, days: 'Lun–Vie', hours: '07:00–11:00', dailyCap: 40, perUser: '2 por persona al día',
    conditions: ['Termo limpio con tapa', 'Capacidad 350–500 ml'], active: true },
  { id: 'p5', restaurantId: 'r5', title: 'Arroz frito con proteína', product: 'Pollo, res o tofu',
    price: 130, discount: 15, foodCost: 52, days: 'Lun–Vie', hours: '15:30–18:30', dailyCap: 15, perUser: '1 por persona al día',
    conditions: ['Recipiente apto para calor', 'Tapa hermética'], active: true },
  { id: 'p6', restaurantId: 'r6', title: 'Plato de arrachera', product: 'Con arroz y frijoles',
    price: 175, discount: 20, foodCost: 78, days: 'Mar–Jue', hours: '16:00–18:30', dailyCap: 10, perUser: '1 por persona al día',
    conditions: ['Recipiente de al menos 1 L', 'Tapa hermética', 'Salsas aparte'], active: true },
];

export const CUISINES = ['Todas', ...Array.from(new Set(RESTAURANTS.map((r) => r.cuisine)))];

// Generador pseudoaleatorio determinista (mulberry32) para que la demo sea reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SYNTH_USERS = 160; // usuarios sintéticos registrados

export function buildSeed(now = Date.now()) {
  const r = rng(20261118);
  const tx = [];
  const codes = [];
  const weeks = 8;
  const DAY = 86400000;
  const weights = { p1: 6, p7: 2, p2: 4, p3: 5, p4: 5, p5: 3, p6: 2 };
  const bag = Object.entries(weights).flatMap(([id, w]) => Array(w).fill(id));
  let n = 0;
  for (let w = weeks - 1; w >= 0; w--) {
    const count = Math.round(22 + (weeks - 1 - w) * 6 + r() * 8); // rampa suave, sintética
    for (let i = 0; i < count; i++) {
      const pick = bag[Math.floor(r() * bag.length)];
      const promo = PROMOTIONS.find((p) => p.id === pick);
      const ts = now - w * 7 * DAY - Math.floor(r() * 5) * DAY - Math.floor(r() * 8 * 3600000) - 3600000;
      const userId = i % 9 === 0 && w < 6 ? 'u-demo-x' : `u-${String(1 + Math.floor(r() * SYNTH_USERS)).padStart(3, '0')}`;
      const accepted = r() > 0.07;
      const substitution = accepted ? (r() > 0.13 ? 'confirmada' : 'no') : 'no_aplica';
      const paid = accepted ? promo.price - promo.discount : promo.price;
      const code = `DT-S${String(++n).padStart(3, '0')}-SY`;
      codes.push({ code, promoId: promo.id, restaurantId: promo.restaurantId, userId, createdAt: ts - 600000,
        status: accepted ? 'validado' : 'rechazado', synthetic: true });
      tx.push({
        id: `TX-S${String(n).padStart(4, '0')}`, code, folio: null, promoId: promo.id, restaurantId: promo.restaurantId,
        userId, createdAt: ts, status: accepted ? 'verificada' : 'rechazada', containerAccepted: accepted, substitution,
        listPrice: promo.price, discount: accepted ? promo.discount : 0, paid,
        commission: accepted ? round2(paid * COMMISSION_RATE) : 0,
        validationSeconds: Math.round(14 + r() * 30), channel: 'qr', synthetic: true,
        note: accepted ? '' : 'Recipiente no adecuado: venta sin promoción',
      });
    }
  }
  // Historial del usuario de demostración (sintético): reasignamos algunas operaciones a "Ana".
  tx.filter((t) => t.userId === 'u-demo-x').slice(-7).forEach((t) => { t.userId = 'u-demo'; });
  tx.forEach((t) => { if (t.userId === 'u-demo-x') t.userId = 'u-001'; });
  const byCode = new Map(tx.map((t) => [t.code, t.userId]));
  codes.forEach((c) => { c.userId = byCode.get(c.code) || c.userId; });

  return {
    version: 3,
    online: true,
    promotions: PROMOTIONS.map((p) => ({ ...p })),
    codes,
    transactions: tx.sort((a, b) => b.createdAt - a.createdAt),
    reminders: { enabled: true, days: ['Mar', 'Jue'] },
    lastCode: null,
    restaurantSession: null,
  };
}
