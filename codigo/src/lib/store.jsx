// Estado de la demo: reducer + persistencia local (localStorage).
// No hay servidor ni servicios externos: todo ocurre en este navegador.
// Se sincroniza entre pestañas del mismo navegador mediante el evento `storage`.

import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { buildSeed, PROMOTIONS } from './seed.js';
import { COMMISSION_RATE, CODE_TTL_MIN, newTxId, round2, decodeCode } from './utils.js';

const KEY = 'demo-economia-circular-v3';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 3) return s;
    }
  } catch { /* almacenamiento no disponible: se usa memoria */ }
  return buildSeed();
}

export function codeStatus(c, now = Date.now()) {
  if (!c) return 'inexistente';
  if (c.status === 'pendiente' && c.expiresAt && now > c.expiresAt) return 'expirado';
  return c.status;
}

// Verificación previa a validar en línea. Devuelve { ok, reason, code }.
// Reconstruye un código generado en OTRO dispositivo a partir de su formato autoverificable.
export function externalCode(code, now = Date.now()) {
  const idx = decodeCode(code);
  if (idx == null || !PROMOTIONS[idx]) return null;
  const p = PROMOTIONS[idx];
  return { code, promoId: p.id, restaurantId: p.restaurantId, userId: 'u-externo', createdAt: now,
    expiresAt: now + CODE_TTL_MIN * 60000, status: 'pendiente', synthetic: false, external: true };
}

export function checkCode(state, code, restaurantId) {
  const c = state.codes.find((x) => x.code === code) || externalCode(code);
  const st = codeStatus(c);
  if (st === 'inexistente') return { ok: false, reason: 'El código no existe. Revisa que esté bien escrito.' };
  if (st === 'validado') {
    const t = state.transactions.find((x) => x.code === code && x.status === 'verificada');
    return { ok: false, duplicate: true, reason: `Este código ya fue validado${t ? ` (${t.id})` : ''}. Un código solo puede usarse una vez.` };
  }
  if (st === 'rechazado') return { ok: false, reason: 'Este código ya se registró con recipiente rechazado.' };
  if (st === 'cancelado') return { ok: false, reason: 'El estudiante canceló este código.' };
  if (st === 'expirado') return { ok: false, reason: `El código venció (vigencia de ${CODE_TTL_MIN} min). El estudiante puede generar uno nuevo.` };
  if (c.restaurantId !== restaurantId) return { ok: false, reason: 'Este código corresponde a la promoción de otro restaurante.' };
  const pend = state.transactions.find((x) => x.code === code && x.status === 'pendiente');
  if (pend) return { ok: false, duplicate: true, reason: `Ya existe una operación pendiente con este código (${pend.folio}).` };
  return { ok: true, code: c };
}

function makeTx(state, p) {
  const promo = state.promotions.find((x) => x.id === p.promoId);
  const accepted = !!p.containerAccepted;
  const listPrice = Number(p.listPrice ?? promo?.price ?? 0);
  const discount = accepted ? Number(p.discount ?? promo?.discount ?? 0) : 0;
  const paid = round2(Math.max(listPrice - discount, 0));
  return {
    id: newTxId(), code: p.code || null, folio: p.folio || null, promoId: p.promoId, restaurantId: p.restaurantId,
    userId: p.userId || null, createdAt: Date.now(), containerAccepted: accepted,
    substitution: accepted ? (p.substitution || 'no') : 'no_aplica', listPrice, discount, paid,
    commission: 0, validationSeconds: p.validationSeconds ?? null, channel: p.channel || 'qr', synthetic: false,
    note: p.note || '',
  };
}

function reducer(state, a) {
  switch (a.type) {
    case 'RESET':
      return buildSeed();
    case 'REPLACE':
      return a.state;
    case 'SET_ONLINE':
      return { ...state, online: a.online };
    case 'GENERATE_CODE': {
      const promo = state.promotions.find((p) => p.id === a.promoId);
      const c = { code: a.code, promoId: promo.id, restaurantId: promo.restaurantId, userId: a.userId,
        createdAt: Date.now(), expiresAt: Date.now() + CODE_TTL_MIN * 60000, status: 'pendiente', synthetic: false };
      return { ...state, codes: [c, ...state.codes], lastCode: a.code };
    }
    case 'CANCEL_CODE':
      return { ...state, codes: state.codes.map((c) => (c.code === a.code && c.status === 'pendiente' ? { ...c, status: 'cancelado' } : c)) };
    case 'VALIDATE': {
      // Defensa contra duplicados también dentro del reducer.
      const chk = checkCode(state, a.payload.code, a.payload.restaurantId);
      if (!chk.ok) return state;
      const c = chk.code;
      const tx = makeTx(state, { ...a.payload, promoId: c.promoId, userId: c.userId });
      tx.status = tx.containerAccepted ? 'verificada' : 'rechazada';
      tx.commission = tx.status === 'verificada' ? round2(tx.paid * COMMISSION_RATE) : 0;
      if (!tx.containerAccepted) tx.note = 'Recipiente no adecuado: venta sin promoción';
      const done = { ...c, status: tx.containerAccepted ? 'validado' : 'rechazado', txId: tx.id };
      return {
        ...state,
        codes: c.external && !state.codes.some((x) => x.code === c.code)
          ? [done, ...state.codes]
          : state.codes.map((x) => (x.code === c.code ? done : x)),
        transactions: [tx, ...state.transactions],
      };
    }
    case 'REGISTER_PENDING': {
      const dup = state.transactions.find((t) => t.status === 'pendiente' && t.code && t.code === a.payload.code);
      if (dup) return state;
      const tx = makeTx(state, { ...a.payload, channel: 'contingencia' });
      tx.status = 'pendiente';
      tx.note = 'Registrada sin conexión. No cuenta como verificada hasta sincronizar.';
      return { ...state, transactions: [tx, ...state.transactions] };
    }
    case 'SYNC_PENDING': {
      let codes = state.codes;
      const transactions = state.transactions.map((t) => {
        if (t.status !== 'pendiente' || t.restaurantId !== a.restaurantId) return t;
        let c = codes.find((x) => x.code === t.code);
        if (!c) { c = externalCode(t.code, t.createdAt); if (c) codes = [c, ...codes]; }
        const st = codeStatus(c, t.createdAt); // vigencia evaluada al momento del registro
        if (!c) return { ...t, status: 'rechazada', commission: 0, note: 'Sincronización: código inexistente.' };
        if (st === 'validado' || st === 'rechazado') return { ...t, status: 'duplicada', commission: 0, note: 'Sincronización: el código ya se había usado. No se contabiliza.' };
        if (st === 'cancelado' || st === 'expirado') return { ...t, status: 'rechazada', commission: 0, note: `Sincronización: código ${st}.` };
        if (c.restaurantId !== t.restaurantId) return { ...t, status: 'rechazada', commission: 0, note: 'Sincronización: código de otro restaurante.' };
        const ok = t.containerAccepted;
        codes = codes.map((x) => (x.code === c.code ? { ...x, status: ok ? 'validado' : 'rechazado', txId: t.id } : x));
        return { ...t, userId: c.userId, promoId: c.promoId, status: ok ? 'verificada' : 'rechazada',
          commission: ok ? round2(t.paid * COMMISSION_RATE) : 0, note: 'Confirmada al sincronizar (registro de contingencia).' };
      });
      return { ...state, codes, transactions };
    }
    case 'SAVE_PROMO': {
      const exists = state.promotions.some((p) => p.id === a.promo.id);
      return { ...state, promotions: exists ? state.promotions.map((p) => (p.id === a.promo.id ? a.promo : p)) : [a.promo, ...state.promotions] };
    }
    case 'TOGGLE_PROMO':
      return { ...state, promotions: state.promotions.map((p) => (p.id === a.id ? { ...p, active: !p.active } : p)) };
    case 'SET_REMINDERS':
      return { ...state, reminders: a.reminders };
    case 'LOGIN_RESTAURANT':
      return { ...state, restaurantSession: a.id };
    case 'LOGOUT_RESTAURANT':
      return { ...state, restaurantSession: null };
    default:
      return state;
  }
}

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const skipWrite = useRef(false);

  useEffect(() => {
    if (skipWrite.current) { skipWrite.current = false; return; }
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin persistencia */ }
  }, [state]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== KEY || !e.newValue) return;
      try { skipWrite.current = true; dispatch({ type: 'REPLACE', state: JSON.parse(e.newValue) }); } catch { /* ignorar */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

// Reloj compartido para estados dependientes del tiempo (vigencia de códigos).
export function useNow(intervalMs = 1000) {
  const [now, setNow] = React.useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}
