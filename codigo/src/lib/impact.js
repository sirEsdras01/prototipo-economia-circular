// Módulo de impacto ambiental de RePack.
//
// Toda métrica se deriva de los registros persistentes de transacciones. Reglas:
//  1. Solo cuentan transacciones en estado `verificada` con recipiente propio aceptado.
//  2. Un QR escaneado no es una sustitución: la sustitución la confirma el restaurante.
//  3. Pendientes, rechazadas, duplicadas y revertidas no generan impacto.
//  4. Una respuesta "no se puede determinar" nunca se convierte en sustitución.
//  5. La masa solo se estima con el peso de referencia guardado en la propia transacción
//     (copia auditable), nunca con valores supuestos.
//  6. No se calculan emisiones de CO₂e: no hay una metodología de ciclo de vida validada.

export const MAX_SUBSTITUTED = 10; // límite por compra; mayor cantidad requiere revisión
export const MILESTONES = [1, 5, 10, 25, 50, 100];
export const SUBSTITUTION = { CONFIRMED: 'confirmada', NO: 'no', UNKNOWN: 'indeterminado', NA: 'no_aplica' };
export const PERIODS = [
  { value: '7d', label: '7 días', days: 7 },
  { value: '30d', label: '30 días', days: 30 },
  { value: '90d', label: '90 días', days: 90 },
  { value: 'all', label: 'Histórico', days: null },
];

// Tipos de envase desechable. Los pesos NO están configurados: deben capturarse con una
// fuente verificable (medición propia, ficha técnica del proveedor, etc.).
export const DEFAULT_PACKAGING = [
  { id: 'plastico', type: 'Envase plástico', grams: null, source: '', measuredAt: '', validUntil: '', notes: '', version: 0 },
  { id: 'carton', type: 'Envase de cartón', grams: null, source: '', measuredAt: '', validUntil: '', notes: '', version: 0 },
  { id: 'fibra', type: 'Envase de fibra vegetal', grams: null, source: '', measuredAt: '', validUntil: '', notes: '', version: 0 },
  { id: 'vaso', type: 'Vaso desechable con tapa', grams: null, source: '', measuredAt: '', validUntil: '', notes: '', version: 0 },
  { id: 'otro', type: 'Otro envase', grams: null, source: '', measuredAt: '', validUntil: '', notes: '', version: 0 },
];

const DAY = 86400000;

export function periodStart(period, now = Date.now()) {
  const p = PERIODS.find((x) => x.value === period);
  return p && p.days ? now - p.days * DAY : 0;
}

// Cantidad de envases sustituidos registrada. Registros anteriores a este módulo solo
// guardaban sí/no: se interpretan como 1 y se marcan como cantidad heredada.
export function substitutedCountOf(t) {
  if (!t) return 0;
  if (Number.isInteger(t.substitutedCount)) return Math.max(0, Math.min(MAX_SUBSTITUTED, t.substitutedCount));
  return t.substitution === SUBSTITUTION.CONFIRMED ? 1 : 0;
}
export const isLegacyCount = (t) => t.substitution === SUBSTITUTION.CONFIRMED && !Number.isInteger(t.substitutedCount);

export const isTopperPurchase = (t) => !!t && t.status === 'verificada' && !!t.containerAccepted;
export const isConfirmedSubstitution = (t) => isTopperPurchase(t) && t.substitution === SUBSTITUTION.CONFIRMED && substitutedCountOf(t) > 0;
export const confirmedSubstitutions = (t) => (isConfirmedSubstitution(t) ? substitutedCountOf(t) : 0);

// Gramos estimados de una transacción, o null si falta una referencia de peso válida.
export function massGramsOf(t) {
  const n = confirmedSubstitutions(t);
  if (!n) return 0;
  const g = t.packagingRef && Number(t.packagingRef.grams);
  return Number.isFinite(g) && g > 0 ? n * g : null;
}

// Normaliza y valida lo que captura el restaurante (equivalente a validación de servidor).
export function sanitizeSubstitution({ containerAccepted, substitution, substitutedCount }) {
  if (!containerAccepted) return { substitution: SUBSTITUTION.NA, substitutedCount: 0 };
  if (substitution === SUBSTITUTION.CONFIRMED) {
    const n = Math.floor(Number(substitutedCount));
    if (!Number.isFinite(n) || n < 1) return { substitution: SUBSTITUTION.NO, substitutedCount: 0 };
    return { substitution: SUBSTITUTION.CONFIRMED, substitutedCount: Math.min(n, MAX_SUBSTITUTED) };
  }
  if (substitution === SUBSTITUTION.NO) return { substitution: SUBSTITUTION.NO, substitutedCount: 0 };
  return { substitution: SUBSTITUTION.UNKNOWN, substitutedCount: 0 };
}

// Copia auditable de la referencia vigente al momento de validar.
export function snapshotRef(ref) {
  if (!ref) return null;
  const { id, type, grams, source, measuredAt, version } = ref;
  return { id, type, grams: Number(grams) > 0 ? Number(grams) : null, source: source || '', measuredAt: measuredAt || '', version: version || 0 };
}

function filterTx(txs, { userId, restaurantId, since = 0, until = Infinity, includeSynthetic = true } = {}) {
  return txs.filter((t) => {
    if (!t) return false;
    if (!includeSynthetic && t.synthetic) return false;
    if (userId && t.userId !== userId) return false;
    if (restaurantId && t.restaurantId !== restaurantId) return false;
    const ts = t.validatedAt || t.createdAt;
    return ts >= since && ts < until;
  });
}

export function summarize(txs, opts = {}) {
  const list = filterTx(txs, opts);
  const topper = list.filter(isTopperPurchase);
  const confirmed = topper.filter(isConfirmedSubstitution);
  const substituted = confirmed.reduce((s, t) => s + confirmedSubstitutions(t), 0);
  let grams = 0; let withRef = 0; let withoutRef = 0;
  confirmed.forEach((t) => { const g = massGramsOf(t); if (g == null) withoutRef += confirmedSubstitutions(t); else { grams += g; withRef += confirmedSubstitutions(t); } });
  const users = new Map();
  topper.forEach((t) => users.set(t.userId, (users.get(t.userId) || 0) + 1));
  return {
    topperPurchases: topper.length,
    substituted,
    substitutionTx: confirmed.length,
    massKg: withRef ? grams / 1000 : null,
    massCoverage: { withRef, withoutRef },
    savings: topper.reduce((s, t) => s + (Number(t.discount) || 0), 0),
    pending: list.filter((t) => t.status === 'pendiente').length,
    reverted: list.filter((t) => t.status === 'revertida').length,
    rejected: list.filter((t) => t.status === 'rechazada').length,
    duplicates: list.filter((t) => t.status === 'duplicada').length,
    indeterminate: topper.filter((t) => t.substitution === SUBSTITUTION.UNKNOWN).length,
    noSubstitution: topper.filter((t) => t.substitution === SUBSTITUTION.NO).length,
    legacyCount: confirmed.filter(isLegacyCount).length,
    incomplete: topper.filter((t) => t.substitution === SUBSTITUTION.UNKNOWN || isLegacyCount(t) || (isConfirmedSubstitution(t) && massGramsOf(t) == null)).length,
    participants: users.size,
    recurrent: [...users.values()].filter((n) => n >= 2).length,
    activeRestaurants: new Set(topper.map((t) => t.restaurantId)).size,
    confirmedRate: topper.length ? confirmed.length / topper.length : null,
  };
}

function bucketStart(ts, granularity) {
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  if (granularity === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (granularity === 'month') d.setDate(1);
  return d.getTime();
}
function addBucket(ts, granularity, n) {
  const d = new Date(ts);
  if (granularity === 'day') d.setDate(d.getDate() + n);
  else if (granularity === 'week') d.setDate(d.getDate() + 7 * n);
  else d.setMonth(d.getMonth() + n);
  return d.getTime();
}

export function granularityFor(period) {
  return period === '7d' ? 'day' : period === '30d' || period === '90d' ? 'week' : 'month';
}

// Serie temporal: recipientes sustituidos y compras con topper por intervalo.
export function series(txs, { period = '30d', granularity, now = Date.now(), ...opts } = {}) {
  const g = granularity || granularityFor(period);
  const list = filterTx(txs, opts).filter(isTopperPurchase);
  let start = bucketStart(periodStart(period, now) || (list.length ? Math.min(...list.map((t) => t.validatedAt || t.createdAt)) : now), g);
  const end = bucketStart(now, g);
  const out = [];
  let guard = 0;
  while (start <= end && guard++ < 400) {
    const next = addBucket(start, g, 1);
    const inB = list.filter((t) => { const ts = t.validatedAt || t.createdAt; return ts >= start && ts < next; });
    out.push({ start, substituted: inB.reduce((s, t) => s + confirmedSubstitutions(t), 0), purchases: inB.length });
    start = next;
  }
  return { granularity: g, points: out };
}

export function progress(substituted) {
  const achieved = MILESTONES.filter((m) => substituted >= m);
  const next = MILESTONES.find((m) => substituted < m) || null;
  const prev = achieved.length ? achieved[achieved.length - 1] : 0;
  return {
    achieved, next, prev,
    remaining: next ? next - substituted : 0,
    ratio: next ? Math.max(0, Math.min(1, (substituted - prev) / (next - prev))) : 1,
  };
}

// Preparado para el futuro: requiere factores de emisión y análisis de ciclo de vida
// (fabricación y vida útil del recipiente reutilizable, lavado, tipo de desechable evitado).
export function emissionsEstimate() {
  return { available: false, value: null, reason: 'Sin análisis de ciclo de vida ni factores de emisión verificables. No se muestra una cifra de CO₂e.' };
}

export const METHODOLOGY = [
  'Solo contamos compras verificadas en las que el restaurante aceptó un recipiente reutilizable propio.',
  'Un recipiente desechable se cuenta como sustituido únicamente cuando el restaurante confirma que no lo entregó, e indica cuántos.',
  'Las respuestas "No" y "No se puede determinar" no suman impacto. Las compras pendientes, rechazadas, duplicadas o revertidas tampoco.',
  'La masa estimada usa el peso de referencia del tipo de envase vigente al validar la compra, con su fuente. Si no hay un peso verificado, la masa queda pendiente.',
  'No mostramos emisiones de CO₂e: el resultado neto depende de la fabricación, vida útil y lavado del recipiente reutilizable, y aún no tenemos un análisis de ciclo de vida.',
];
