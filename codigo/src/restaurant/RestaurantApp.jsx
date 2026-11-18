// Panel del restaurante: validación QR, contingencia, promociones, historial y simulador.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, checkCode, codeStatus } from '../lib/store.jsx';
import { RESTAURANTS, PROMOTIONS } from '../lib/seed.js';
import jsQR from 'jsqr';
import { MAX_SUBSTITUTED, confirmedSubstitutions, substitutedCountOf } from '../lib/impact.js';
import {
  money, money0, num, pct, fmtDateTime, normalizeCode, newFolio, contribution, COMMISSION_RATE, round2, weekStart,
  fmtDate, downloadFile, toCSV, decodeCode,
} from '../lib/utils.js';
import { Icon, Badge, Button, Notice, Stat, Field, SyntheticTag, BarChart, Legend, Empty, Segmented } from '../components/ui.jsx';

const DAY = 86400000;

export default function RestaurantApp() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState('validate');
  const rid = state.restaurantSession;
  if (!rid) return <Login />;
  const r = RESTAURANTS.find((x) => x.id === rid);
  const pendingCount = state.transactions.filter((t) => t.restaurantId === rid && t.status === 'pendiente').length;

  const nav = [
    { key: 'overview', label: 'Resumen', icon: 'chart' },
    { key: 'validate', label: 'Validar compra', icon: 'qr' },
    { key: 'promos', label: 'Promociones', icon: 'edit' },
    { key: 'history', label: 'Historial', icon: 'list' },
    { key: 'sim', label: 'Simulador', icon: 'calc' },
  ];

  return (
    <div className="desk">
      <aside className="desk-side">
        <div className="desk-ident">
          <span className="avatar"><Icon name="store" size={18} /></span>
          <div>
            <b>{r.name}</b>
            <span>Restaurante ficticio · demo</span>
          </div>
        </div>
        <nav aria-label="Panel del restaurante">
          {nav.map((n) => (
            <button key={n.key} className={tab === n.key ? 'on' : ''} onClick={() => setTab(n.key)} aria-current={tab === n.key ? 'page' : undefined}>
              <Icon name={n.icon} size={18} /><span>{n.label}</span>
              {n.key === 'history' && pendingCount ? <i className="count">{pendingCount}</i> : null}
            </button>
          ))}
        </nav>
        <button className="desk-logout" onClick={() => dispatch({ type: 'LOGOUT_RESTAURANT' })}><Icon name="logout" size={18} /><span>Cambiar restaurante</span></button>
      </aside>
      <main className="desk-main">
        {pendingCount ? <PendingBanner rid={rid} count={pendingCount} /> : null}
        {tab === 'overview' && <Overview rid={rid} />}
        {tab === 'validate' && <Validate rid={rid} />}
        {tab === 'promos' && <Promotions rid={rid} />}
        {tab === 'history' && <HistoryTable rid={rid} />}
        {tab === 'sim' && <Simulator rid={rid} />}
      </main>
    </div>
  );
}

function Login() {
  const { dispatch } = useStore();
  const [rid, setRid] = useState('r1');
  const r = RESTAURANTS.find((x) => x.id === rid);
  const [pin, setPin] = useState(r.pin);
  const [staff, setStaff] = useState('');
  useEffect(() => setPin(RESTAURANTS.find((x) => x.id === rid).pin), [rid]);
  const ok = pin === r.pin;
  return (
    <div className="login">
      <div className="login-card">
        <p className="eyebrow">Acceso de restaurante · demostración</p>
        <h1>Inicia sesión</h1>
        <p className="muted">En esta demo no hay cuentas reales. Elige un restaurante ficticio; el PIN ya está precargado.</p>
        <Field label="Restaurante">
          <select value={rid} onChange={(e) => setRid(e.target.value)}>
            {RESTAURANTS.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.cuisine}</option>)}
          </select>
        </Field>
        <Field label="PIN de demostración" hint={`PIN de ${r.name}: ${r.pin}`}>
          <input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" maxLength={4} />
        </Field>
        <Field label="Nombre de quien atiende (opcional)" hint="Queda registrado en cada validación.">
          <input value={staff} onChange={(e) => setStaff(e.target.value)} maxLength={24} placeholder="Ej. Mariana" />
        </Field>
        <Button icon="arrowRight" disabled={!ok} onClick={() => dispatch({ type: 'LOGIN_RESTAURANT', id: rid, staff: staff.trim() })}>Entrar (demo)</Button>
        {!ok ? <p className="error-text">PIN incorrecto.</p> : null}
      </div>
    </div>
  );
}

function PendingBanner({ rid, count }) {
  const { state, dispatch } = useStore();
  return (
    <div className="pending-banner">
      <Icon name="alert" size={18} />
      <div>
        <b>{count} operación{count > 1 ? 'es' : ''} pendiente{count > 1 ? 's' : ''} de confirmar.</b>
        <span> No cuentan como verificadas ni generan comisión hasta sincronizar.</span>
      </div>
      <Button variant="secondary" icon="refresh" disabled={!state.online} onClick={() => dispatch({ type: 'SYNC_PENDING', restaurantId: rid })}>
        {state.online ? 'Sincronizar ahora' : 'Sin conexión'}
      </Button>
    </div>
  );
}

function useRestaurantStats(rid, days = 30) {
  const { state } = useStore();
  return useMemo(() => {
    const since = Date.now() - days * DAY;
    const all = state.transactions.filter((t) => t.restaurantId === rid);
    const recent = all.filter((t) => t.createdAt >= since);
    const v = recent.filter((t) => t.status === 'verificada');
    const subs = v.filter((t) => t.substitution === 'confirmada');
    const substituted = v.reduce((n, t) => n + confirmedSubstitutions(t), 0);
    const times = v.map((t) => t.validationSeconds).filter((x) => x != null).sort((a, b) => a - b);
    const median = times.length ? times[Math.floor(times.length / 2)] : null;
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const ws = weekStart(Date.now()) - i * 7 * DAY;
      const inW = all.filter((t) => t.status === 'verificada' && weekStart(t.createdAt) === ws);
      weeks.push({ label: fmtDate(ws, { day: '2-digit', month: 'short' }).replace('.', ''), v: inW.length, s: inW.reduce((n, t) => n + confirmedSubstitutions(t), 0) });
    }
    return {
      all, verified: v.length, subs: substituted, revenue: v.reduce((s, t) => s + t.paid, 0),
      discounts: v.reduce((s, t) => s + t.discount, 0), commission: v.reduce((s, t) => s + t.commission, 0),
      rejected: recent.filter((t) => t.status === 'rechazada').length, median, weeks,
    };
  }, [state.transactions, rid, days]);
}

function Overview({ rid }) {
  const s = useRestaurantStats(rid);
  const { state } = useStore();
  const promos = state.promotions.filter((p) => p.restaurantId === rid);
  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">Últimos 30 días</p><h1>Resumen comercial</h1></div>
        <SyntheticTag />
      </div>
      <div className="stat-grid">
        <Stat label="Compras verificadas" value={num(s.verified)} />
        <Stat label="Recipientes desechables sustituidos" value={num(s.subs)} hint="Confirmados por el encargado" />
        <Stat label="Ingresos atribuidos a promociones" value={money0(s.revenue)} hint="Importe pagado en compras verificadas" />
        <Stat label="Descuentos otorgados" value={money0(s.discounts)} hint="Financiados por el restaurante" />
        <Stat label={`Comisión de plataforma (${pct(COMMISSION_RATE)})`} value={money(s.commission)} hint="Solo sobre compras elegibles verificadas" />
        <Stat label="Tiempo mediano de validación" value={s.median != null ? `${s.median} s` : '—'} />
        <Stat label="Recipientes rechazados" value={num(s.rejected)} />
        <Stat label="Promociones activas" value={`${promos.filter((p) => p.active).length} de ${promos.length}`} />
      </div>
      <section className="panel">
        <div className="panel-head"><h2>Evolución semanal</h2><Legend series={SERIES} /></div>
        <BarChart data={s.weeks} series={SERIES} />
      </section>
      <Notice tone="info" title="Cómo leer estos indicadores">
        Los ingresos atribuidos no equivalen a ventas adicionales: una parte de estas compras pudo haber ocurrido sin promoción.
        Usa el simulador para estimar el efecto en tu contribución.
      </Notice>
    </div>
  );
}

const SERIES = [
  { key: 'v', label: 'Compras verificadas', color: '#173D32' },
  { key: 's', label: 'Recipientes sustituidos', color: '#8DB5A0' },
];

// Escáner con cámara si el navegador soporta BarcodeDetector; si no, entrada manual.
function Scanner({ onCode, onClose }) {
  const videoRef = useRef(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  const [msg, setMsg] = useState('Iniciando cámara…');
  useEffect(() => {
    let stream; let timer; let alive = true;
    (async () => {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
        setMsg('Este navegador no permite escanear QR. Introduce el código manualmente.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!alive) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const det = new window.BarcodeDetector({ formats: ['qr_code'] });
        setMsg('Apunta la cámara al código del estudiante.');
        timer = setInterval(async () => {
          try {
            const found = await det.detect(videoRef.current);
            if (found[0]?.rawValue) { clearInterval(timer); cb.current(found[0].rawValue); }
          } catch { /* sigue intentando */ }
        }, 350);
      } catch {
        setMsg('No se pudo acceder a la cámara. Introduce el código manualmente.');
      }
    })();
    return () => { alive = false; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="scanner">
      <video ref={videoRef} muted playsInline />
      <p>{msg}</p>
      <Button variant="secondary" icon="x" onClick={onClose}>Cerrar cámara</Button>
    </div>
  );
}

// Lee un QR desde una foto (funciona en cualquier teléfono, también dentro de páginas sin acceso a la cámara en vivo).
async function decodeQRFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const tries = [1600, 1000, 640];
    for (const max of tries) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const r = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' });
      if (r && r.data) return r.data;
    }
    return null;
  } finally { URL.revokeObjectURL(url); }
}

function PhotoScanButton({ onCode, onError }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const onChange = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      const text = await decodeQRFromFile(f);
      if (text) onCode(text); else onError('No se encontró un código QR en la foto. Acércate y evita reflejos.');
    } catch { onError('No se pudo leer la imagen.'); }
    setBusy(false);
  };
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={onChange} hidden />
      <Button icon="camera" onClick={() => ref.current && ref.current.click()} disabled={busy}>{busy ? 'Leyendo QR…' : 'Escanear QR (foto)'}</Button>
    </>
  );
}

const LIVE_SCAN = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

function Validate({ rid }) {
  const { state, dispatch } = useStore();
  const myPromos = state.promotions.filter((p) => p.restaurantId === rid);
  const [step, setStep] = useState('code');
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [scan, setScan] = useState(false);
  const [ctx, setCtx] = useState(null); // { code, promo, offline, startedAt }
  const [accepted, setAccepted] = useState(null);
  const [subst, setSubst] = useState(null);
  const [count, setCount] = useState(1);
  const defaultPkg = RESTAURANTS.find((x) => x.id === rid)?.packaging || 'otro';
  const [pkg, setPkg] = useState(defaultPkg);
  const refs = state.packagingRefs || [];
  const [listPrice, setListPrice] = useState(0);
  const [offlinePromo, setOfflinePromo] = useState(myPromos[0]?.id);
  const [result, setResult] = useState(null);

  const reset = () => { setStep('code'); setInput(''); setError(null); setCtx(null); setAccepted(null); setSubst(null); setCount(1); setPkg(defaultPkg); setResult(null); };

  const lookup = (raw) => {
    const code = normalizeCode(raw ?? input);
    setInput(code);
    setScan(false);
    if (!code) { setError({ text: 'Escribe o escanea un código.' }); return; }
    if (!state.online) {
      const dup = state.transactions.find((t) => t.status === 'pendiente' && t.code === code);
      if (dup) { setError({ text: `Ya registraste este código como pendiente (${dup.folio}). No se puede registrar dos veces.`, duplicate: true }); return; }
      const idx = decodeCode(code);
      const fromCode = idx != null && PROMOTIONS[idx] && PROMOTIONS[idx].restaurantId === rid ? myPromos.find((p) => p.id === PROMOTIONS[idx].id) : null;
      const promo = fromCode || myPromos.find((p) => p.id === offlinePromo) || myPromos[0];
      setCtx({ code, promo, offline: true, startedAt: Date.now() });
      setListPrice(promo.price); setError(null); setStep('container');
      return;
    }
    const chk = checkCode(state, code, rid);
    if (!chk.ok) { setError({ text: chk.reason, duplicate: chk.duplicate }); return; }
    const promo = state.promotions.find((p) => p.id === chk.code.promoId);
    setCtx({ code, promo, offline: false, startedAt: Date.now(), alias: chk.code.userAlias });
    setListPrice(promo.price); setError(null); setStep('container');
  };

  const discount = accepted ? ctx?.promo.discount || 0 : 0;
  const paid = round2(Math.max(Number(listPrice || 0) - discount, 0));
  const commission = accepted && !ctx?.offline ? round2(paid * COMMISSION_RATE) : 0;

  const register = () => {
    const seconds = Math.max(1, Math.round((Date.now() - ctx.startedAt) / 1000));
    const payload = { code: ctx.code, restaurantId: rid, promoId: ctx.promo.id, containerAccepted: accepted,
      substitution: accepted ? subst : 'no_aplica', substitutedCount: accepted && subst === 'confirmada' ? count : 0,
      packagingTypeId: accepted ? pkg : null, listPrice: Number(listPrice), discount: ctx.promo.discount, validationSeconds: seconds };
    if (ctx.offline) {
      const folio = newFolio();
      dispatch({ type: 'REGISTER_PENDING', payload: { ...payload, folio } });
      setResult({ offline: true, folio, seconds });
    } else {
      dispatch({ type: 'VALIDATE', payload });
      setResult({ offline: false, seconds });
    }
    setStep('done');
  };

  const last = state.codes.find((c) => c.code === state.lastCode);
  const lastPending = last && codeStatus(last) === 'pendiente';
  const stepIdx = { code: 0, container: 1, sale: 2, done: 3 }[step];

  return (
    <div className="page narrow">
      <div className="page-head">
        <div><p className="eyebrow">Mostrador</p><h1>Validar compra</h1></div>
        <span className={`conn ${state.online ? 'on' : 'off'}`}><Icon name={state.online ? 'wifi' : 'wifiOff'} size={16} />{state.online ? 'En línea' : 'Sin conexión (simulada)'}</span>
      </div>
      <ol className="stepper" aria-label="Pasos de validación">
        {['Código', 'Recipiente', 'Venta', 'Confirmación'].map((s, i) => (
          <li key={s} className={i < stepIdx ? 'done' : i === stepIdx ? 'on' : ''}><span>{i < stepIdx ? <Icon name="check" size={14} stroke={2.5} /> : i + 1}</span>{s}</li>
        ))}
      </ol>

      {step === 'code' && (
        <section className="panel">
          {!state.online ? (
            <Notice tone="warn" title="Modo contingencia" icon="wifiOff">
              No es posible verificar el código ahora. Puedes registrar una <b>operación pendiente</b> con folio único;
              no contará como verificada hasta sincronizar. Si el código ya se usó, se marcará como duplicado.
            </Notice>
          ) : null}
          {scan ? <Scanner onCode={(c) => lookup(c)} onClose={() => setScan(false)} /> : null}
          <Field label="Código del estudiante" hint="Formato DT-XXXX-XX. Puedes escanearlo o escribirlo si la cámara no está disponible.">
            <input className="code-input" value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="DT-____-__"
              onKeyDown={(e) => e.key === 'Enter' && lookup()} autoComplete="off" spellCheck="false" aria-invalid={!!error} />
          </Field>
          {!state.online ? (
            <Field label="Promoción aplicada">
              <select value={offlinePromo} onChange={(e) => setOfflinePromo(e.target.value)}>
                {myPromos.map((p) => <option key={p.id} value={p.id}>{p.title} — {money0(p.price)} − {money0(p.discount)}</option>)}
              </select>
            </Field>
          ) : null}
          {error ? <Notice tone="bad" title={error.duplicate ? 'Registro duplicado bloqueado' : 'No se puede validar'}>{error.text}</Notice> : null}
          <div className="row gap wrap">
            <PhotoScanButton onCode={(c) => lookup(c)} onError={(t) => setError({ text: t })} />
            <Button variant="secondary" icon={state.online ? 'check' : 'arrowRight'} onClick={() => lookup()}>{state.online ? 'Verificar código escrito' : 'Continuar sin conexión'}</Button>
            {LIVE_SCAN ? <Button variant="secondary" icon="qr" onClick={() => setScan(true)}>Cámara en vivo</Button> : null}
          </div>
          <p className="fine">«Escanear QR» abre la cámara del teléfono: toma una foto del código del estudiante. Funciona aunque el código se haya generado en otro teléfono.</p>
          {lastPending ? (
            <div className="demo-shortcut">
              <span>Atajo de demostración · último código generado en este navegador:</span>
              <button className="link mono" onClick={() => lookup(last.code)}>{last.code}</button>
            </div>
          ) : (
            <p className="fine">Para probar el flujo, genera un código desde el perfil Estudiante.</p>
          )}
        </section>
      )}

      {step === 'container' && ctx && (
        <section className="panel">
          {ctx.alias ? <div className="student-chip"><Icon name="users" size={16} /><span>Alumno: <b>{ctx.alias}</b></span></div> : null}
          <div className="ctx-line">
            <span className="mono">{ctx.code}</span>
            {ctx.offline ? <Badge tone="warn">Sin verificar</Badge> : <Badge tone="ok">Código válido</Badge>}
            <span className="muted">{ctx.promo.title} · {money0(ctx.promo.price)} − {money0(ctx.promo.discount)}</span>
          </div>
          <h2 className="q">¿Se utilizó un recipiente reutilizable propio, limpio y adecuado?</h2>
          <p className="muted">Criterio del restaurante: {RESTAURANTS.find((x) => x.id === rid).accepts}.</p>
          <div className="choice">
            <button className={accepted === true ? 'on ok' : ''} onClick={() => setAccepted(true)}><Icon name="check" size={20} />Sí, lo acepto</button>
            <button className={accepted === false ? 'on bad' : ''} onClick={() => { setAccepted(false); setSubst(null); }}><Icon name="x" size={20} />No, lo rechazo</button>
          </div>
          {accepted === true ? (
            <>
              <h2 className="q">¿Se evitó entregar un recipiente desechable que normalmente se habría usado?</h2>
              <div className="choice three">
                <button className={subst === 'confirmada' ? 'on ok' : ''} onClick={() => setSubst('confirmada')}><Icon name="check" size={20} />Sí, se evitó</button>
                <button className={subst === 'no' ? 'on' : ''} onClick={() => setSubst('no')}><Icon name="x" size={20} />No</button>
                <button className={subst === 'indeterminado' ? 'on' : ''} onClick={() => setSubst('indeterminado')}><Icon name="info" size={20} />No se puede determinar</button>
              </div>
              {subst === 'confirmada' ? (
                <div className="subst-detail">
                  <div>
                    <span className="field-label">¿Cuántos recipientes se sustituyeron?</span>
                    <div className="stepper-num" role="group" aria-label="Cantidad de recipientes sustituidos">
                      <button type="button" aria-label="Uno menos" disabled={count <= 1} onClick={() => setCount((n) => Math.max(1, n - 1))}>−</button>
                      <output aria-live="polite">{count}</output>
                      <button type="button" aria-label="Uno más" disabled={count >= MAX_SUBSTITUTED} onClick={() => setCount((n) => Math.min(MAX_SUBSTITUTED, n + 1))}>+</button>
                    </div>
                  </div>
                  <Field label="Tipo de envase que se habría entregado">
                    <select value={pkg} onChange={(e) => setPkg(e.target.value)}>
                      {refs.map((r) => <option key={r.id} value={r.id}>{r.type}</option>)}
                    </select>
                  </Field>
                </div>
              ) : null}
              {subst === 'indeterminado' ? <p className="fine">No se contará como recipiente sustituido.</p> : null}
            </>
          ) : null}
          {accepted === false ? <Notice tone="warn">La compra puede continuar sin promoción. No genera comisión y no cuenta como reutilización.</Notice> : null}
          <div className="row gap">
            <Button variant="secondary" icon="arrowLeft" onClick={reset}>Cancelar</Button>
            <Button icon="arrowRight" disabled={accepted === null || (accepted && !subst)} onClick={() => setStep('sale')}>Continuar</Button>
          </div>
        </section>
      )}

      {step === 'sale' && ctx && (
        <section className="panel">
          <h2>Registro de venta</h2>
          <div className="sale-grid">
            <Field label="Precio de lista del pedido" prefix="$" hint="Ajusta si el pedido incluye extras.">
              <input type="number" min="0" step="0.5" value={listPrice} onChange={(e) => setListPrice(e.target.value)} />
            </Field>
            <dl className="sale-sum">
              <div><dt>Descuento por recipiente propio</dt><dd>{accepted ? `−${money(discount)}` : 'No aplica'}</dd></div>
              <div className="total"><dt>Cobrar al cliente</dt><dd>{money(paid)}</dd></div>
              <div><dt>Comisión de plataforma ({pct(COMMISSION_RATE)})</dt><dd>{ctx.offline ? 'Se calcula al confirmar' : money(commission)}</dd></div>
              <div><dt>Recipiente</dt><dd>{accepted ? (subst === 'confirmada' ? `${count} desechable${count > 1 ? 's' : ''} sustituido${count > 1 ? 's' : ''}` : subst === 'no' ? 'Aceptado, sin sustitución' : 'Aceptado, sustitución no determinada') : 'Rechazado'}</dd></div>
            </dl>
          </div>
          <p className="fine">El descuento lo decide y financia el restaurante. La plataforma no cobra mensualidad durante el piloto propuesto.</p>
          <div className="row gap">
            <Button variant="secondary" icon="arrowLeft" onClick={() => setStep('container')}>Atrás</Button>
            <Button icon="check" onClick={register}>{ctx.offline ? 'Registrar como pendiente' : 'Registrar venta'}</Button>
          </div>
        </section>
      )}

      {step === 'done' && result && (
        <section className={`panel done ${result.offline ? 'warn' : accepted ? 'ok' : 'bad'}`}>
          <Icon name={result.offline ? 'clock' : accepted ? 'check' : 'x'} size={40} stroke={2} />
          <h2>{result.offline ? 'Operación pendiente registrada' : accepted ? 'Compra verificada' : 'Registrada sin promoción'}</h2>
          {result.offline ? (
            <p>Folio <b className="mono">{result.folio}</b>. Se confirmará o rechazará al sincronizar. No cuenta en los indicadores mientras esté pendiente.</p>
          ) : (
            <p>{ctx.alias ? <><b>{ctx.alias}</b> · </> : null}{accepted ? `Cobro de ${money(paid)} · comisión ${money(commission)} · ${subst === 'confirmada' ? `${count} recipiente${count > 1 ? 's' : ''} desechable${count > 1 ? 's' : ''} sustituido${count > 1 ? 's' : ''}` : 'sin sustitución confirmada'}.` : 'El código quedó cerrado; el cliente puede generar uno nuevo en otra visita.'}</p>
          )}
          <p className="muted">Tiempo de validación: {result.seconds} s{!result.offline ? ' · enviado al alumno y al panel institucional' : ''}</p>
          <Button icon="qr" onClick={reset}>Validar otra compra</Button>
        </section>
      )}
    </div>
  );
}

const EMPTY_PROMO = (rid) => ({ id: `p-${Date.now()}`, restaurantId: rid, title: '', product: '', price: 100, discount: 10, foodCost: 40,
  days: 'Lun–Vie', hours: '15:00–18:00', dailyCap: 15, perUser: '1 por persona al día', conditions: ['Recipiente limpio con tapa'], active: true });

function Promotions({ rid }) {
  const { state, dispatch } = useStore();
  const list = state.promotions.filter((p) => p.restaurantId === rid);
  const [edit, setEdit] = useState(null);
  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">Tú decides descuento, producto, horario y condiciones</p><h1>Promociones</h1></div>
        <Button icon="plus" onClick={() => setEdit(EMPTY_PROMO(rid))}>Nueva promoción</Button>
      </div>
      {edit ? <PromoEditor promo={edit} onCancel={() => setEdit(null)} onSave={(p) => { dispatch({ type: 'SAVE_PROMO', promo: p }); setEdit(null); }} /> : null}
      <div className="promo-table">
        {list.map((p) => {
          const c = contribution({ price: p.price, discount: p.discount, foodCost: p.foodCost, payment: 4, packaging: 2, commissionRate: COMMISSION_RATE });
          return (
            <div key={p.id} className={`promo-item ${p.active ? '' : 'off'}`}>
              <div className="pi-main">
                <b>{p.title}</b>
                <span className="muted">{p.days} · {p.hours} · cupo {p.dailyCap}/día · {p.perUser}</span>
              </div>
              <div className="pi-num"><span className="muted">Precio</span><b>{money0(p.price)}</b></div>
              <div className="pi-num"><span className="muted">Descuento</span><b>−{money0(p.discount)}</b></div>
              <div className="pi-num"><span className="muted">Ventas incrementales necesarias</span><b>{c.promo > 0 ? pct(c.breakEvenIncremental) : '—'}</b></div>
              <div className="pi-actions">
                <label className="switch-row compact"><span>{p.active ? 'Activa' : 'Pausada'}</span>
                  <input type="checkbox" role="switch" checked={p.active} onChange={() => dispatch({ type: 'TOGGLE_PROMO', id: p.id })} /></label>
                <Button variant="secondary" icon="edit" onClick={() => setEdit({ ...p })}>Editar</Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="fine">"Ventas incrementales necesarias": porcentaje mínimo de compras con promoción que deben ser clientes nuevos o visitas adicionales para no reducir tu contribución total (supuestos: pago $4, empaque $2, comisión 2 %).</p>
    </div>
  );
}

function PromoEditor({ promo, onCancel, onSave }) {
  const [p, setP] = useState({ ...promo, conditionsText: promo.conditions.join('\n') });
  const set = (k) => (e) => setP({ ...p, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });
  const c = contribution({ price: p.price, discount: p.discount, foodCost: p.foodCost, payment: 4, packaging: 2, commissionRate: COMMISSION_RATE });
  const heavy = p.discount > p.price * 0.25;
  const valid = p.title.trim() && p.price > 0 && p.discount >= 0 && p.discount < p.price;
  return (
    <section className="panel editor">
      <h2>{promo.title ? 'Editar promoción' : 'Nueva promoción'}</h2>
      <div className="form-grid">
        <Field label="Nombre de la promoción"><input value={p.title} onChange={set('title')} placeholder="Ej. Comida del día" /></Field>
        <Field label="Producto"><input value={p.product} onChange={set('product')} /></Field>
        <Field label="Precio de lista" prefix="$"><input type="number" value={p.price} onChange={set('price')} /></Field>
        <Field label="Descuento" prefix="$"><input type="number" value={p.discount} onChange={set('discount')} /></Field>
        <Field label="Costo de preparación (privado)" prefix="$" hint="Solo para tu cálculo; no se muestra al estudiante."><input type="number" value={p.foodCost} onChange={set('foodCost')} /></Field>
        <Field label="Cupo diario"><input type="number" value={p.dailyCap} onChange={set('dailyCap')} /></Field>
        <Field label="Días"><input value={p.days} onChange={set('days')} /></Field>
        <Field label="Horario" hint="Sugerencia: horarios de menor demanda."><input value={p.hours} onChange={set('hours')} /></Field>
        <Field label="Límite por persona"><input value={p.perUser} onChange={set('perUser')} /></Field>
        <Field label="Condiciones (una por línea)"><textarea rows={3} value={p.conditionsText} onChange={set('conditionsText')} /></Field>
      </div>
      <div className="margin-check">
        <div><span>Contribución sin promoción</span><b>{money(c.base)}</b></div>
        <div><span>Contribución con promoción</span><b>{money(c.promo)}</b></div>
        <div><span>Diferencia si la venta habría ocurrido igual</span><b className="neg">−{money(c.loss)}</b></div>
        <div><span>Ventas incrementales necesarias</span><b>{c.promo > 0 ? pct(c.breakEvenIncremental) : 'No viable'}</b></div>
      </div>
      {heavy ? <Notice tone="warn">El descuento supera el 25 % del precio. Revisa que la promoción no destruya tu margen.</Notice> : null}
      {c.promo <= 0 ? <Notice tone="bad">Con estos valores cada venta con promoción tiene contribución negativa.</Notice> : null}
      <div className="row gap">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button icon="check" disabled={!valid} onClick={() => onSave({ ...p, conditions: p.conditionsText.split('\n').map((s) => s.trim()).filter(Boolean), conditionsText: undefined })}>Guardar promoción</Button>
      </div>
    </section>
  );
}

const REVERT_REASONS = ['Error de registro', 'Devolución o cancelación del pedido', 'El cliente no usó recipiente propio'];

function HistoryTable({ rid }) {
  const { state, dispatch } = useStore();
  const [revert, setRevert] = useState(null);
  const [f, setF] = useState('todas');
  const rows = state.transactions.filter((t) => t.restaurantId === rid && (f === 'todas' || t.status === f));
  const promoName = (id) => state.promotions.find((p) => p.id === id)?.title || '—';
  const exportCsv = () => downloadFile(`historial_${rid}_demo.csv`, toCSV(rows.map((t) => ({
    fecha: new Date(t.createdAt).toISOString(), id: t.id, folio: t.folio || '', codigo: t.code || '', promocion: promoName(t.promoId),
    estado: t.status, recipiente_aceptado: t.containerAccepted ? 'si' : 'no', sustitucion: t.substitution, recipientes_sustituidos: confirmedSubstitutions(t),
    tipo_envase: t.packagingTypeId || '', precio_lista: t.listPrice,
    descuento: t.discount, pagado: t.paid, comision: t.commission, segundos_validacion: t.validationSeconds ?? '', canal: t.channel,
    sintetico: t.synthetic ? 'si' : 'no', nota: t.note || '',
  }))));
  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">Registro de operaciones</p><h1>Historial</h1></div>
        <Button variant="secondary" icon="download" onClick={exportCsv}>Exportar CSV (demo)</Button>
      </div>
      <Segmented small ariaLabel="Filtrar estado" value={f} onChange={setF} options={[
        { value: 'todas', label: 'Todas' }, { value: 'verificada', label: 'Verificadas' }, { value: 'pendiente', label: 'Pendientes' },
        { value: 'rechazada', label: 'Rechazadas' }, { value: 'duplicada', label: 'Duplicadas' }, { value: 'revertida', label: 'Revertidas' }]} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Operación</th><th>Promoción</th><th>Estado</th><th>Recipiente</th><th className="r">Pagado</th><th className="r">Descuento</th><th className="r">Comisión</th><th></th></tr></thead>
          <tbody>
            {rows.slice(0, 80).map((t) => (
              <tr key={t.id}>
                <td>{fmtDateTime(t.createdAt)}</td>
                <td><span className="mono">{t.folio || t.id}</span>{t.synthetic ? <span className="tiny"> sintética</span> : null}{t.note ? <div className="tiny">{t.note}</div> : null}</td>
                <td>{promoName(t.promoId)}</td>
                <td><Badge status={t.status} /></td>
                <td>{t.status === 'verificada' ? (t.substitution === 'confirmada' ? <Badge tone="ok">{substitutedCountOf(t)} sustituido{substitutedCountOf(t) > 1 ? 's' : ''}</Badge> : <Badge status={t.substitution} />) : t.status === 'pendiente' ? <Badge tone="warn">Por confirmar</Badge> : <Badge status="no_aplica" />}</td>
                <td className="r">{money(t.paid)}</td>
                <td className="r">{t.discount ? `−${money(t.discount)}` : '—'}</td>
                <td className="r">{t.commission ? money(t.commission) : '—'}</td>
                <td className="r">
                  {t.status === 'verificada' && revert !== t.id ? <button className="link" onClick={() => setRevert(t.id)}>Revertir</button> : null}
                  {revert === t.id ? (
                    <div className="revert-box">
                      {REVERT_REASONS.map((r) => <button key={r} className="link" onClick={() => { dispatch({ type: 'REVERT_TX', id: t.id, reason: r }); setRevert(null); }}>{r}</button>)}
                      <button className="link muted" onClick={() => setRevert(null)}>Cancelar</button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <Empty icon="list" title="Sin operaciones con este filtro" /> : null}
      </div>
    </div>
  );
}

function Simulator() {
  const [v, setV] = useState({ price: 120, discount: 15, foodCost: 50, payment: 4, packaging: 2, commission: 2, incremental: 30, monthly: 100 });
  const set = (k) => (e) => setV({ ...v, [k]: Number(e.target.value) });
  const c = contribution({ ...v, commissionRate: v.commission / 100 });
  const f = v.incremental / 100;
  const perPromoSale = f * c.promo - (1 - f) * c.loss;
  const monthly = perPromoSale * v.monthly;
  const max = Math.max(c.base, c.promo, 1);
  return (
    <div className="page">
      <div className="page-head">
        <div><p className="eyebrow">Herramienta de decisión · ilustrativa</p><h1>Simulador de contribución por venta</h1></div>
      </div>
      <div className="sim">
        <section className="panel">
          <h2>Supuestos</h2>
          <div className="form-grid two">
            <Field label="Precio de venta" prefix="$"><input type="number" value={v.price} onChange={set('price')} /></Field>
            <Field label="Descuento" prefix="$"><input type="number" value={v.discount} onChange={set('discount')} /></Field>
            <Field label="Costo de preparación" prefix="$"><input type="number" value={v.foodCost} onChange={set('foodCost')} /></Field>
            <Field label="Procesamiento de pago" prefix="$"><input type="number" value={v.payment} onChange={set('payment')} /></Field>
            <Field label="Empaque desechable" prefix="$"><input type="number" step="0.5" value={v.packaging} onChange={set('packaging')} /></Field>
            <Field label="Comisión de plataforma" suffix="%"><input type="number" step="0.5" value={v.commission} onChange={set('commission')} /></Field>
            <Field label="Ventas con promoción que son incrementales" suffix="%" hint="Clientes o visitas que no habrían ocurrido sin la promoción.">
              <input type="range" min="0" max="100" value={v.incremental} onChange={set('incremental')} />
            </Field>
            <Field label="Ventas con promoción al mes"><input type="number" value={v.monthly} onChange={set('monthly')} /></Field>
          </div>
          <p className="fine">Incremental: {v.incremental} %. Procesamiento de pago como monto fijo simplificado.</p>
        </section>
        <section className="panel">
          <h2>Resultado por venta</h2>
          <div className="bars">
            <div><span>Sin promoción</span><i style={{ width: `${(Math.max(c.base, 0) / max) * 100}%` }} /><b>{money(c.base)}</b></div>
            <div><span>Con promoción</span><i className="alt" style={{ width: `${(Math.max(c.promo, 0) / max) * 100}%` }} /><b>{money(c.promo)}</b></div>
          </div>
          <dl className="sale-sum">
            <div><dt>Precio pagado</dt><dd>{money(c.paid)}</dd></div>
            <div><dt>Comisión de plataforma</dt><dd>{money(c.commission)}</dd></div>
            <div><dt>Pérdida en una venta que habría ocurrido igual</dt><dd className="neg">−{money(c.loss)}</dd></div>
            <div><dt>Ventas incrementales necesarias para no perder</dt><dd>{c.promo > 0 ? pct(c.breakEvenIncremental, 1) : 'No viable'}</dd></div>
            <div className="total"><dt>Efecto esperado por venta con promoción</dt><dd className={perPromoSale < 0 ? 'neg' : 'pos'}>{money(perPromoSale)}</dd></div>
            <div className="total"><dt>Efecto mensual estimado</dt><dd className={monthly < 0 ? 'neg' : 'pos'}>{money(monthly)}</dd></div>
          </dl>
          <Notice tone="warn" title="Un descuento no es automáticamente rentable">
            El ahorro del desechable ({money(v.packaging)}) rara vez compensa el descuento por sí solo. La promoción conviene si atrae ventas
            incrementales, se usa en horarios de baja demanda o en productos con margen suficiente. No incluye renta, personal ni otros gastos.
          </Notice>
        </section>
      </div>
    </div>
  );
}
