// Utilidades compartidas: formato, identificadores y cálculos económicos.

export const COMMISSION_RATE = 0.02; // 2 % sobre el importe efectivamente pagado (hipótesis comercial)
export const CODE_TTL_MIN = 30; // vigencia del código del estudiante en la demo

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('es-MX');

export const money = (n) => mxn.format(Number.isFinite(n) ? n : 0);
export const money0 = (n) => mxn0.format(Number.isFinite(n) ? n : 0);
export const num = (n) => int.format(Math.round(n || 0));
export const pct = (n, d = 0) => `${((n || 0) * 100).toFixed(d)} %`;
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function fmtDate(ts, opts = { day: '2-digit', month: 'short' }) {
  return new Date(ts).toLocaleDateString('es-MX', opts);
}
export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para dictar códigos en mostrador.
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randChars(n) {
  const out = [];
  const buf = new Uint32Array(n);
  (globalThis.crypto || window.crypto).getRandomValues(buf);
  for (let i = 0; i < n; i++) out.push(ALPHA[buf[i] % ALPHA.length]);
  return out.join('');
}
// Códigos autoverificables: el 1er carácter identifica la promoción y los 2 últimos son un dígito
// de control. Así otro dispositivo (el del restaurante) puede validar el código sin servidor.
function checksum(body) {
  let h = 0;
  for (const ch of body) h = (h * 37 + ALPHA.indexOf(ch) + 11) % (ALPHA.length * ALPHA.length);
  return ALPHA[Math.floor(h / ALPHA.length)] + ALPHA[h % ALPHA.length];
}
export function newCode(promoIndex = -1) {
  const first = promoIndex >= 0 && promoIndex < ALPHA.length ? ALPHA[promoIndex] : randChars(1);
  const body = first + randChars(3);
  return `DT-${body}-${checksum(body)}`;
}
// Devuelve el índice de promoción codificado, o null si el código no es válido.
export function decodeCode(code) {
  const m = /^DT-([A-Z2-9]{4})-([A-Z2-9]{2})$/.exec(code || '');
  if (!m || checksum(m[1]) !== m[2]) return null;
  return ALPHA.indexOf(m[1][0]);
}
export const newTxId = () => `TX-${randChars(6)}`;
export const newFolio = () => `PEND-${randChars(5)}`; // folio de contingencia

export const normalizeCode = (s) => (s || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');

// Modelo de contribución por venta (ilustrativo, antes de otros gastos).
export function contribution({ price, discount, foodCost, payment, packaging, commissionRate }) {
  const base = price - foodCost - payment - packaging;
  const paid = Math.max(price - discount, 0);
  const commission = round2(paid * commissionRate);
  const promo = paid - foodCost - payment - commission; // con recipiente propio: sin empaque desechable
  const loss = base - promo; // pérdida en una venta que habría ocurrido de todos modos
  const breakEvenIncremental = promo > 0 && loss > 0 ? loss / (promo + loss) : loss <= 0 ? 0 : 1;
  return { base, paid, commission, promo, loss, breakEvenIncremental };
}

// Semana ISO simple para agrupar series.
export function weekStart(ts) {
  const d = new Date(ts);
  const day = (d.getDay() + 6) % 7; // lunes = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export async function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
  // Dentro de un artifact publicado, las descargas pasan por la capacidad `downloads`.
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const dl = await window.claude.use('downloads');
      if (dl) { await dl.save({ filename, data: '\ufeff' + content }); return; }
    }
  } catch { /* se intenta la descarga directa */ }
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCSV(rows) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}
