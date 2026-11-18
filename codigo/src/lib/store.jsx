// Estado de la demo: reducer + persistencia local + sincronización en tiempo real.
// Los datos sintéticos de partida viven solo en cada dispositivo; todo lo que la gente hace
// durante la demo (registros, códigos, validaciones, promociones) se comparte al instante.

import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { buildSeed, PROMOTIONS, RESTAURANTS } from './seed.js';
import { COMMISSION_RATE, CODE_TTL_MIN, newTxId, round2, decodeCode } from './utils.js';
import { createSync, roomName } from './sync.js';
import { DEFAULT_PACKAGING, sanitizeSubstitution, snapshotRef, confirmedSubstitutions } from './impact.js';

const KEY = `demo-economia-circular-v5-${roomName()}`;
const OLD_KEY = `demo-economia-circular-v4-${roomName()}`;
const LISTS = { code: ['codes', 'code'], tx: ['transactions', 'id'], promo: ['promotions', 'id'], user: ['users', 'id'], pkg: ['packagingRefs', 'id'] };
const rname = (id) => RESTAURANTS.find((r) => r.id === id)?.name || '';

export function freshState(prev) {
  const s = buildSeed();
  const now = Date.now();
  // Las referencias de envases configuradas se conservan al reiniciar la demo (son configuración, no actividad).
  const refs = (prev?.packagingRefs || s.packagingRefs).map((r) => (r.updatedAt ? { ...r, updatedAt: now } : r));
  return {
    ...s,
    packagingRefs: refs,
    version: 5,
    epoch: prev?.epoch || 'inicio',
    users: [],
    me: prev?.me || null,
    staff: prev?.staff || '',
    restaurantSession: prev?.restaurantSession || null,
    reminders: prev?.reminders || s.reminders,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 5) return s;
    }
    // Migración aditiva desde la versión anterior: se conservan todos los registros.
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const s = JSON.parse(old);
      if (s && s.version === 4) return { ...s, version: 5, packagingRefs: DEFAULT_PACKAGING.map((p) => ({ ...p })) };
    }
  } catch { /* almacenamiento no disponible: se usa memoria */ }
  return freshState();
}

export function codeStatus(c, now = Date.now()) {
  if (!c) return 'inexistente';
  if (c.status === 'pendiente' && c.expiresAt && now > c.expiresAt) return 'expirado';
  return c.status;
}

// Reconstruye un código de OTRO dispositivo a partir de su formato autoverificable
// (respaldo cuando la sincronización en vivo no está disponible).
export function externalCode(code, now = Date.now()) {
  const idx = decodeCode(code);
  if (idx == null || !PROMOTIONS[idx]) return null;
  const p = PROMOTIONS[idx];
  return { code, promoId: p.id, restaurantId: p.restaurantId, userId: 'u-externo', userAlias: 'Alumno de otro dispositivo', createdAt: now,
    expiresAt: now + CODE_TTL_MIN * 60000, status: 'pendiente', synthetic: false, external: true };
}

export function checkCode(state, code, restaurantId) {
  const c = state.codes.find((x) => x.code === code) || externalCode(code);
  const st = codeStatus(c);
  if (st === 'inexistente') return { ok: false, reason: 'El código no existe. Revisa que esté bien escrito.' };
  if (st === 'validado') {
    const t = state.transactions.find((x) => x.code === code && x.status === 'verificada');
    return { ok: false, duplicate: true, reason: `Este código ya fue validado${t ? ` (${t.id}${t.restaurantName ? ` en ${t.restaurantName}` : ''})` : ''}. Un código solo puede usarse una vez.` };
  }
  if (st === 'rechazado') return { ok: false, reason: 'Este código ya se registró con recipiente rechazado.' };
  if (st === 'cancelado') return { ok: false, reason: 'El estudiante canceló este código.' };
  if (st === 'expirado') return { ok: false, reason: `El código venció (vigencia de ${CODE_TTL_MIN} min). El estudiante puede generar uno nuevo.` };
  if (c.restaurantId !== restaurantId) return { ok: false, reason: `Este código corresponde a una promoción de ${rname(c.restaurantId) || 'otro restaurante'}.` };
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
  const now = Date.now();
  return {
    id: newTxId(), code: p.code || null, folio: p.folio || null, promoId: p.promoId, restaurantId: p.restaurantId,
    restaurantName: rname(p.restaurantId), userId: p.userId || null, userAlias: p.userAlias || null,
    validatedBy: state.staff || null, createdAt: now, updatedAt: now, containerAccepted: accepted,
    ...sanitizeSubstitution({ containerAccepted: accepted, substitution: p.substitution, substitutedCount: p.substitutedCount }),
    packagingTypeId: accepted ? (p.packagingTypeId || RESTAURANTS.find((r) => r.id === p.restaurantId)?.packaging || 'otro') : null,
    packagingRef: null, validatedAt: null, listPrice, discount, paid,
    commission: 0, validationSeconds: p.validationSeconds ?? null, channel: p.channel || 'qr', synthetic: false,
    note: p.note || '', audit: [],
  };
}

function upsert(list, key, rec, front = true) {
  const i = list.findIndex((x) => x[key] === rec[key]);
  if (i === -1) return front ? [rec, ...list] : [...list, rec];
  if ((list[i].updatedAt || 0) >= (rec.updatedAt || 0)) return list;
  const next = list.slice(); next[i] = rec; return next;
}

function reducer(state, a) {
  const now = Date.now();
  switch (a.type) {
    case 'REPLACE':
      return a.state;
    case 'EPOCH': {
      if (a.epoch === state.epoch) return state;
      const s = freshState({ ...state, epoch: a.epoch });
      const me = state.me ? { ...state.me, updatedAt: now } : null;
      return { ...s, me, users: me ? [me] : [] };
    }
    case 'SET_ONLINE':
      return { ...state, online: a.online };
    case 'REGISTER_USER':
      return { ...state, me: a.user, users: upsert(state.users, 'id', a.user) };
    case 'LOGOUT_USER':
      return { ...state, me: null };
    case 'GENERATE_CODE': {
      const promo = state.promotions.find((p) => p.id === a.promoId);
      const c = { code: a.code, promoId: promo.id, restaurantId: promo.restaurantId, userId: a.userId, userAlias: a.alias || null,
        createdAt: now, updatedAt: now, expiresAt: now + CODE_TTL_MIN * 60000, status: 'pendiente', synthetic: false };
      return { ...state, codes: [c, ...state.codes], lastCode: a.code };
    }
    case 'CANCEL_CODE':
      return { ...state, codes: state.codes.map((c) => (c.code === a.code && c.status === 'pendiente' ? { ...c, status: 'cancelado', updatedAt: now } : c)) };
    case 'VALIDATE': {
      const chk = checkCode(state, a.payload.code, a.payload.restaurantId);
      if (!chk.ok) return state;
      const c = chk.code;
      const tx = makeTx(state, { ...a.payload, promoId: c.promoId, userId: c.userId, userAlias: c.userAlias });
      tx.status = tx.containerAccepted ? 'verificada' : 'rechazada';
      tx.commission = tx.status === 'verificada' ? round2(tx.paid * COMMISSION_RATE) : 0;
      tx.validatedAt = now;
      tx.packagingRef = tx.substitution === 'confirmada' ? snapshotRef(state.packagingRefs?.find((r) => r.id === tx.packagingTypeId)) : null;
      tx.audit = [{ at: now, action: tx.status, by: state.staff || 'restaurante', substitution: tx.substitution, count: tx.substitutedCount }];
      if (!tx.containerAccepted) tx.note = 'Recipiente no adecuado: venta sin promoción';
      const done = { ...c, status: tx.containerAccepted ? 'validado' : 'rechazado', txId: tx.id, updatedAt: now };
      delete done.external;
      return {
        ...state,
        codes: state.codes.some((x) => x.code === c.code) ? state.codes.map((x) => (x.code === c.code ? done : x)) : [done, ...state.codes],
        transactions: [tx, ...state.transactions],
        lastValidated: tx.id,
      };
    }
    case 'REGISTER_PENDING': {
      const dup = state.transactions.find((t) => t.status === 'pendiente' && t.code && t.code === a.payload.code);
      if (dup) return state;
      const known = state.codes.find((x) => x.code === a.payload.code);
      const tx = makeTx(state, { ...a.payload, channel: 'contingencia', userAlias: known?.userAlias, userId: known?.userId });
      tx.status = 'pendiente';
      tx.audit = [{ at: now, action: 'pendiente', by: state.staff || 'restaurante', substitution: tx.substitution, count: tx.substitutedCount }];
      tx.note = 'Registrada sin conexión. No cuenta como verificada hasta sincronizar.';
      return { ...state, transactions: [tx, ...state.transactions] };
    }
    case 'SYNC_PENDING': {
      let codes = state.codes;
      const transactions = state.transactions.map((t) => {
        if (t.status !== 'pendiente' || t.restaurantId !== a.restaurantId) return t;
        let c = codes.find((x) => x.code === t.code);
        if (!c) { c = externalCode(t.code, t.createdAt); if (c) codes = [c, ...codes]; }
        const st = codeStatus(c, t.createdAt);
        const base = { ...t, updatedAt: now };
        if (!c) return { ...base, status: 'rechazada', commission: 0, note: 'Sincronización: código inexistente.' };
        if (st === 'validado' || st === 'rechazado') return { ...base, status: 'duplicada', commission: 0, note: 'Sincronización: el código ya se había usado. No se contabiliza.' };
        if (st === 'cancelado' || st === 'expirado') return { ...base, status: 'rechazada', commission: 0, note: `Sincronización: código ${st}.` };
        if (c.restaurantId !== t.restaurantId) return { ...base, status: 'rechazada', commission: 0, note: 'Sincronización: código de otro restaurante.' };
        const ok = t.containerAccepted;
        codes = codes.map((x) => (x.code === c.code ? { ...x, status: ok ? 'validado' : 'rechazado', txId: t.id, updatedAt: now, external: undefined } : x));
        return { ...base, userId: c.userId, userAlias: c.userAlias, promoId: c.promoId, status: ok ? 'verificada' : 'rechazada',
          commission: ok ? round2(t.paid * COMMISSION_RATE) : 0, validatedAt: now,
          packagingRef: ok && t.substitution === 'confirmada' ? snapshotRef(state.packagingRefs?.find((r) => r.id === t.packagingTypeId)) : null,
          audit: [...(t.audit || []), { at: now, action: ok ? 'verificada' : 'rechazada', by: 'sincronización' }],
          note: 'Confirmada al sincronizar (registro de contingencia).' };
      });
      return { ...state, codes, transactions };
    }
    case 'REVERT_TX': {
      const t = state.transactions.find((x) => x.id === a.id);
      if (!t || t.status !== 'verificada') return state; // idempotente: solo se revierte una vez
      const reason = String(a.reason || 'Sin motivo').slice(0, 120);
      const next = { ...t, status: 'revertida', commission: 0, revertedAt: now, updatedAt: now, note: `Revertida: ${reason}`,
        audit: [...(t.audit || []), { at: now, action: 'revertida', by: state.staff || 'restaurante', reason }] };
      return { ...state, transactions: state.transactions.map((x) => (x.id === a.id ? next : x)) };
    }
    case 'SAVE_PKG_REF': {
      const prev = (state.packagingRefs || []).find((r) => r.id === a.ref.id);
      const g = Number(a.ref.grams);
      const grams = Number.isFinite(g) && g > 0 && g < 2000 ? Math.round(g * 10) / 10 : null;
      const history = prev && prev.version ? [...(prev.history || []), { version: prev.version, grams: prev.grams, source: prev.source, measuredAt: prev.measuredAt, changedAt: now }].slice(-10) : (prev?.history || []);
      const ref = { ...prev, ...a.ref, grams, source: String(a.ref.source || '').slice(0, 160), notes: String(a.ref.notes || '').slice(0, 200),
        version: (prev?.version || 0) + 1, updatedAt: Math.max(now, (prev?.updatedAt || 0) + 1), history };
      return { ...state, packagingRefs: upsert(state.packagingRefs || [], 'id', ref, false) };
    }
    case 'SAVE_PROMO':
      return { ...state, promotions: upsert(state.promotions, 'id', { ...a.promo, updatedAt: Math.max(now, (state.promotions.find((p) => p.id === a.promo.id)?.updatedAt || 0) + 1) }) };
    case 'TOGGLE_PROMO':
      return { ...state, promotions: state.promotions.map((p) => (p.id === a.id ? { ...p, active: !p.active, updatedAt: now } : p)) };
    case 'REMOTE_UPSERT': {
      const spec = LISTS[a.kind];
      if (!spec || !a.data || a.data[spec[1]] == null) return state;
      const [list, key] = spec;
      let next = upsert(state[list], key, a.data);
      if (next === state[list]) return state;
      if (list === 'transactions') next = next.slice().sort((x, y) => y.createdAt - x.createdAt);
      return { ...state, [list]: next };
    }
    case 'SET_REMINDERS':
      return { ...state, reminders: a.reminders };
    case 'LOGIN_RESTAURANT':
      return { ...state, restaurantSession: a.id, staff: a.staff || '' };
    case 'LOGOUT_RESTAURANT':
      return { ...state, restaurantSession: null };
    default:
      return state;
  }
}

export { reducer };

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);
  const stateRef = useRef(state);
  stateRef.current = state;
  const skipWrite = useRef(false);
  const syncRef = useRef(null);
  const known = useRef(new Map());
  const inbox = useRef([]);
  const [live, setLive] = useState({ status: 'connecting', peers: {}, room: roomName(), deviceId: '' });
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((xs) => [...xs.slice(-2), { id, ...t }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 5200);
  }, []);

  // Persistencia local
  useEffect(() => {
    if (skipWrite.current) { skipWrite.current = false; return; }
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sin persistencia */ }
  }, [state]);

  // Sincronización entre pestañas del mismo navegador
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== KEY || !e.newValue) return;
      try { skipWrite.current = true; rawDispatch({ type: 'REPLACE', state: JSON.parse(e.newValue) }); } catch { /* ignorar */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const applyRemote = useCallback((kind, data) => {
    const spec = LISTS[kind];
    if (!spec) return;
    const k = `${kind}:${data[spec[1]]}`;
    if (!known.current.has(k) || known.current.get(k) < (data.updatedAt || 0)) known.current.set(k, data.updatedAt || 0);
    const s = stateRef.current;
    const fresh = (data.updatedAt || 0) > Date.now() - 30000; // no avisar de registros antiguos al conectarse
    const onQrScreen = kind === 'tx' && data.code && data.code === s.lastCode; // la pantalla del código ya muestra la confirmación
    if (fresh && kind === 'tx' && !onQrScreen && !s.transactions.some((t) => t.id === data.id) && ['verificada', 'rechazada'].includes(data.status)) {
      const mine = s.me && data.userId === s.me.id;
      const n = confirmedSubstitutions(data);
      toast({
        tone: data.status === 'verificada' ? 'ok' : 'warn',
        title: mine ? (n ? '¡Tu elección cuenta!' : `${data.restaurantName} validó tu compra`) : `${data.restaurantName} registró una compra`,
        body: mine
          ? (n ? `Hoy evitaste ${n} recipiente${n > 1 ? 's' : ''} desechable${n > 1 ? 's' : ''}.` : data.status === 'verificada' ? 'Compra registrada. La sustitución del recipiente no se confirmó.' : 'Recipiente no aceptado.')
          : `${data.status === 'verificada' ? (n ? `${n} recipiente${n > 1 ? 's' : ''} desechable${n > 1 ? 's' : ''} sustituido${n > 1 ? 's' : ''}` : 'sin sustitución confirmada') : 'recipiente rechazado'}`,
      });
    }
    if (fresh && kind === 'user' && !data.demo && !s.users.some((u) => u.id === data.id) && (!s.me || s.me.id !== data.id)) {
      toast({ tone: 'info', title: 'Nuevo registro', body: 'Se registró un estudiante en la demo' });
    }
    rawDispatch({ type: 'REMOTE_UPSERT', kind, data });
  }, [toast]);

  // Conexión en tiempo real
  useEffect(() => {
    let sync;
    try {
      sync = createSync({
        onRecord: (kind, data) => {
          if (!stateRef.current.online) { inbox.current.push([kind, data]); return; }
          applyRemote(kind, data);
        },
        onEpoch: (ep, fromRemote) => {
          if (fromRemote && ep !== stateRef.current.epoch) {
            known.current = new Map();
            rawDispatch({ type: 'EPOCH', epoch: ep });
            toast({ tone: 'info', title: 'Demo reiniciada', body: 'Se reiniciaron los datos compartidos de la demo.' });
          }
        },
        onStatus: (status) => setLive((l) => ({ ...l, status })),
        onPresence: (peers) => setLive((l) => ({ ...l, peers })),
      });
    } catch {
      setLive((l) => ({ ...l, status: 'offline' }));
      return undefined;
    }
    syncRef.current = sync;
    setLive((l) => ({ ...l, deviceId: sync.deviceId, room: sync.room }));
    sync.useEpoch(stateRef.current.epoch);
    return () => { sync.close(); syncRef.current = null; };
  }, [applyRemote, toast]);

  // Publicar lo que cambió localmente (y lo que quedó en cola durante una falla simulada)
  useEffect(() => {
    const sync = syncRef.current;
    if (!sync) return;
    if (!state.online) return;
    if (inbox.current.length) {
      const q = inbox.current; inbox.current = [];
      q.forEach(([k, d]) => applyRemote(k, d));
    }
    sync.useEpoch(state.epoch);
    Object.entries(LISTS).forEach(([kind, [list, key]]) => {
      state[list].forEach((rec) => {
        if (rec.synthetic || !rec.updatedAt || rec.external) return;
        const k = `${kind}:${rec[key]}`;
        if ((known.current.get(k) || 0) >= rec.updatedAt) return;
        known.current.set(k, rec.updatedAt);
        sync.publish(kind, rec[key], rec);
      });
    });
  }, [state.codes, state.transactions, state.promotions, state.users, state.online, state.epoch, applyRemote, live.deviceId]);

  const dispatch = useCallback((a) => {
    if (a.type === 'RESET') {
      const ep = Date.now().toString(36);
      known.current = new Map();
      syncRef.current?.resetEpoch(ep);
      rawDispatch({ type: 'EPOCH', epoch: ep });
      return;
    }
    rawDispatch(a);
  }, []);

  const setPresence = useCallback((p) => { syncRef.current?.setProfile(p); }, []);

  return <Ctx.Provider value={{ state, dispatch, live, toasts, setPresence }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

// Reloj compartido para estados dependientes del tiempo (vigencia de códigos).
export function useNow(intervalMs = 1000) {
  const [now, setNow] = React.useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}

export function livePeers(peers, windowMs = 75000) {
  const now = Date.now();
  return Object.entries(peers || {}).filter(([, p]) => p && now - (p.ts || 0) < windowMs);
}
