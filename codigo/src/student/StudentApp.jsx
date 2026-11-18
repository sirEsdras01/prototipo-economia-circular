// Experiencia del estudiante (móvil primero).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useNow, codeStatus } from '../lib/store.jsx';
import { RESTAURANTS, CUISINES, DEMO_USER, PROMOTIONS } from '../lib/seed.js';
import { money, money0, newCode, fmtDate, fmtDateTime, num, CODE_TTL_MIN, weekStart } from '../lib/utils.js';
import { Icon, Badge, Button, Notice, QR, SyntheticTag, Stat, Segmented, Empty } from '../components/ui.jsx';

const rest = (id) => RESTAURANTS.find((r) => r.id === id);

export default function StudentApp() {
  const { state } = useStore();
  const [screen, setScreen] = useState({ name: 'home' });
  const scroller = useRef(null);
  const go = (name, params = {}) => { setScreen({ name, ...params }); window.scrollTo({ top: 0 }); };
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [screen]);
  const active = state.codes.find((c) => c.code === state.lastCode);
  const activeStatus = codeStatus(active);
  const hasActive = active && activeStatus === 'pendiente';

  let view;
  switch (screen.name) {
    case 'explore': view = <Explore go={go} />; break;
    case 'promo': view = <PromoDetail go={go} promoId={screen.promoId} />; break;
    case 'qr': view = <QRScreen go={go} code={screen.code || state.lastCode} />; break;
    case 'history': view = <History go={go} />; break;
    case 'impact': view = <Impact go={go} />; break;
    default: view = <Home go={go} />;
  }

  const tabs = [
    { key: 'home', label: 'Inicio', icon: 'home' },
    { key: 'explore', label: 'Explorar', icon: 'search' },
    { key: 'qr', label: 'Mi código', icon: 'qr', dot: hasActive },
    { key: 'history', label: 'Historial', icon: 'clock' },
    { key: 'impact', label: 'Impacto', icon: 'impact' },
  ];
  const current = screen.name === 'promo' ? 'explore' : screen.name;

  return (
    <div className="phone-stage">
      <div className="phone" data-screen={screen.name}>
        <div className="phone-scroll" ref={scroller}>{view}</div>
        <nav className="tabbar" aria-label="Navegación del estudiante">
          {tabs.map((t) => (
            <button key={t.key} className={current === t.key ? 'on' : ''} onClick={() => go(t.key)} aria-current={current === t.key ? 'page' : undefined}>
              <span className="tab-icon"><Icon name={t.icon} size={22} />{t.dot ? <i className="dot" /> : null}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function useMyStats() {
  const { state } = useStore();
  return useMemo(() => {
    const mine = state.transactions.filter((t) => t.userId === DEMO_USER.id);
    const verified = mine.filter((t) => t.status === 'verificada');
    const subs = verified.filter((t) => t.substitution === 'confirmada');
    const savings = verified.reduce((s, t) => s + t.discount, 0);
    const weeks = new Set(verified.map((t) => weekStart(t.createdAt)));
    // racha: semanas consecutivas (hacia atrás desde esta semana o la anterior) con al menos una operación verificada
    let streak = 0;
    let w = weekStart(Date.now());
    if (!weeks.has(w)) w -= 7 * 86400000;
    while (weeks.has(w)) { streak++; w -= 7 * 86400000; }
    return { mine, verified, subs, savings, streak, pending: mine.filter((t) => t.status === 'pendiente') };
  }, [state.transactions]);
}

function Header({ title, back, go, right }) {
  return (
    <header className="s-header">
      {back ? (
        <button className="icon-btn" onClick={() => go(back)} aria-label="Regresar"><Icon name="arrowLeft" /></button>
      ) : <span className="s-header-spacer" />}
      <h1>{title}</h1>
      {right || <span className="s-header-spacer" />}
    </header>
  );
}

function PromoRow({ p, go }) {
  const r = rest(p.restaurantId);
  return (
    <button className="promo-row" onClick={() => go('promo', { promoId: p.id })}>
      <span className="promo-thumb" aria-hidden="true"><Icon name="container" size={22} /></span>
      <span className="promo-main">
        <span className="promo-title">{p.title}</span>
        <span className="promo-sub">{r.name} · {r.walk} a pie</span>
        <span className="promo-sub">{p.days} · {p.hours}</span>
      </span>
      <span className="promo-price">
        <span className="save">−{money0(p.discount)}</span>
        <span className="final">{money0(p.price - p.discount)}</span>
      </span>
    </button>
  );
}

function Home({ go }) {
  const { state } = useStore();
  const { verified, savings, streak } = useMyStats();
  const promos = state.promotions.filter((p) => p.active).slice(0, 3);
  const activeRestaurants = new Set(state.promotions.filter((p) => p.active).map((p) => p.restaurantId)).size;
  const today = new Date().toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');
  const dayCap = today.charAt(0).toUpperCase() + today.slice(1, 3);
  const reminderToday = state.reminders.enabled && state.reminders.days.includes(dayCap);

  return (
    <div className="s-page">
      <div className="s-hello">
        <div>
          <p className="eyebrow">Distrito Tec · demostración</p>
          <h1>Hola, {DEMO_USER.name}</h1>
        </div>
        <SyntheticTag>Demo</SyntheticTag>
      </div>

      <section className={`habit ${reminderToday ? 'habit-today' : ''}`}>
        <Icon name="bell" size={20} />
        <div>
          <strong>{reminderToday ? 'Hoy es uno de tus días de compra' : 'Recordatorio de hábito'}</strong>
          <p>{reminderToday ? 'Antes de salir: recipiente limpio, seco y con tapa.' : `Te recordamos llevar tu recipiente los ${state.reminders.days.join(' y ')}.`}</p>
        </div>
        <button className="link" onClick={() => go('impact')}>Ajustar</button>
      </section>

      <section className="s-stats">
        <Stat label="Operaciones verificadas" value={num(verified.length)} />
        <Stat label="Ahorro acumulado" value={money0(savings)} />
        <Stat label="Semanas seguidas" value={num(streak)} />
      </section>

      <section>
        <div className="s-section-head">
          <h2>Promociones disponibles</h2>
          <button className="link" onClick={() => go('explore')}>Ver todas</button>
        </div>
        <div className="promo-list">
          {promos.map((p) => <PromoRow key={p.id} p={p} go={go} />)}
        </div>
        <p className="fine">{activeRestaurants} restaurantes ficticios con promociones activas en esta demo.</p>
      </section>

      <section className="how">
        <h2>Cómo funciona</h2>
        <ol>
          <li><b>Elige una promoción</b><span>Cada restaurante define su descuento, horario y condiciones.</span></li>
          <li><b>Lleva tu recipiente</b><span>Limpio, seco, con tapa y adecuado para el platillo.</span></li>
          <li><b>Muestra tu código</b><span>El restaurante revisa el recipiente y valida la compra.</span></li>
        </ol>
      </section>

      <Notice tone="info" title="Lo que te toca a ti">
        Llevar, lavar, transportar y cuidar tu recipiente. La plataforma no presta, lava ni transporta recipientes.
      </Notice>
    </div>
  );
}

function Explore({ go }) {
  const { state } = useStore();
  const [cuisine, setCuisine] = useState('Todas');
  const [q, setQ] = useState('');
  const list = state.promotions.filter((p) => {
    const r = rest(p.restaurantId);
    if (!p.active) return false;
    if (cuisine !== 'Todas' && r.cuisine !== cuisine) return false;
    if (q && !`${p.title} ${r.name} ${r.cuisine}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="s-page">
      <Header title="Explorar" />
      <label className="search">
        <Icon name="search" size={18} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar platillo o restaurante" aria-label="Buscar" />
      </label>
      <div className="chips" role="group" aria-label="Filtrar por tipo de comida">
        {CUISINES.map((c) => (
          <button key={c} className={`chip ${cuisine === c ? 'on' : ''}`} onClick={() => setCuisine(c)} aria-pressed={cuisine === c}>{c}</button>
        ))}
      </div>
      <Notice tone="warn" title="Catálogo de demostración">Restaurantes y promociones ficticios. No son participantes confirmados.</Notice>
      <div className="promo-list">
        {list.length ? list.map((p) => <PromoRow key={p.id} p={p} go={go} />) : (
          <Empty icon="search" title="Sin resultados">Prueba con otro tipo de comida.</Empty>
        )}
      </div>
    </div>
  );
}

function PromoDetail({ go, promoId }) {
  const { state, dispatch } = useStore();
  const p = state.promotions.find((x) => x.id === promoId);
  const [clean, setClean] = useState(false);
  const [fit, setFit] = useState(false);
  if (!p) return <div className="s-page"><Header title="Promoción" back="explore" go={go} /><Empty title="Promoción no disponible" /></div>;
  const r = rest(p.restaurantId);
  const usedToday = state.transactions.filter((t) => t.promoId === p.id && t.status === 'verificada' && new Date(t.createdAt).toDateString() === new Date().toDateString()).length;
  const left = Math.max(p.dailyCap - usedToday, 0);
  const pending = state.codes.find((c) => c.userId === DEMO_USER.id && c.promoId === p.id && codeStatus(c) === 'pendiente');

  const generate = () => {
    if (pending) { go('qr', { code: pending.code }); return; }
    const code = newCode(PROMOTIONS.findIndex((x) => x.id === p.id));
    dispatch({ type: 'GENERATE_CODE', promoId: p.id, userId: DEMO_USER.id, code });
    go('qr', { code });
  };

  return (
    <div className="s-page">
      <Header title="Detalle de promoción" back="explore" go={go} />
      <div className="detail-hero">
        <p className="eyebrow">{r.name} · {r.cuisine} <Badge tone="muted">Ficticio</Badge></p>
        <h2>{p.title}</h2>
        <p className="muted">{p.product}</p>
      </div>

      <div className="price-box">
        <div><span>Precio original</span><b>{money(p.price)}</b></div>
        <div className="minus"><span>Descuento por recipiente propio</span><b>−{money(p.discount)}</b></div>
        <div className="total"><span>Precio final</span><b>{money(p.price - p.discount)}</b></div>
      </div>

      <dl className="facts">
        <div><dt>Disponibilidad</dt><dd>{p.days}, {p.hours}</dd></div>
        <div><dt>Cupo de hoy</dt><dd>{left} de {p.dailyCap} disponibles</dd></div>
        <div><dt>Límite</dt><dd>{p.perUser}</dd></div>
        <div><dt>Recipiente aceptado</dt><dd>{r.accepts}</dd></div>
      </dl>

      <section>
        <h3 className="h3">Condiciones del restaurante</h3>
        <ul className="ticks">
          {p.conditions.map((c) => <li key={c}><Icon name="check" size={16} />{c}</li>)}
          <li><Icon name="check" size={16} />El restaurante puede rechazar un recipiente que no considere adecuado; en ese caso la compra procede sin promoción.</li>
        </ul>
      </section>

      <section className="commit">
        <h3 className="h3">Antes de generar tu código</h3>
        <label className="check">
          <input type="checkbox" checked={clean} onChange={(e) => setClean(e.target.checked)} />
          <span>Mi recipiente está limpio, seco y sin olores.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} />
          <span>Tiene tapa y es adecuado para este platillo.</span>
        </label>
      </section>

      <div className="sticky-cta">
        <Button icon="qr" onClick={generate} disabled={(!clean || !fit || left === 0) && !pending}>
          {pending ? 'Ver mi código activo' : left === 0 ? 'Cupo agotado hoy' : 'Generar código'}
        </Button>
        <p className="fine">Tu código vence en {CODE_TTL_MIN} minutos y solo puede usarse una vez.</p>
      </div>
    </div>
  );
}

function QRScreen({ go, code }) {
  const { state, dispatch } = useStore();
  const now = useNow(1000);
  const c = state.codes.find((x) => x.code === code);
  if (!c) {
    return (
      <div className="s-page">
        <Header title="Mi código" />
        <Empty icon="qr" title="No tienes un código activo">Elige una promoción para generar uno.</Empty>
        <Button variant="secondary" onClick={() => go('explore')}>Explorar promociones</Button>
      </div>
    );
  }
  const st = codeStatus(c, now);
  const p = state.promotions.find((x) => x.id === c.promoId);
  const r = rest(c.restaurantId);
  const tx = state.transactions.find((t) => t.code === c.code && ['verificada', 'rechazada'].includes(t.status));
  const pend = state.transactions.find((t) => t.code === c.code && t.status === 'pendiente');
  const remaining = Math.max(0, (c.expiresAt || 0) - now);
  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="s-page">
      <Header title="Mi código" />
      <div className={`qr-card qr-${st}`}>
        <p className="eyebrow">{r.name}</p>
        <h2>{p?.title}</h2>
        <div className="qr-wrap">
          <QR value={c.code} size={208} />
          {st === 'validado' ? <div className="qr-overlay ok"><Icon name="check" size={56} stroke={2.5} /></div> : null}
          {['cancelado', 'expirado', 'rechazado'].includes(st) ? <div className="qr-overlay muted"><Icon name="x" size={48} stroke={2.5} /></div> : null}
        </div>
        <p className="code-text" aria-label="Código para dictar">{c.code}</p>
        <div className="qr-status">
          <Badge status={st === 'pendiente' ? 'pendiente' : st} />
          {st === 'pendiente' ? <span className="muted">Vence en {mm}:{ss}</span> : null}
        </div>
      </div>

      {st === 'pendiente' && !pend ? (
        <>
          <ol className="steps-inline">
            <li>Entrega tu recipiente en el mostrador.</li>
            <li>Muestra este código o díctalo si no hay cámara.</li>
            <li>Espera la confirmación en esta pantalla.</li>
          </ol>
          <Notice tone="info" title="Para continuar la demo">En otro teléfono (o en este), abre el perfil <b>Restaurante</b>, entra a <b>{r.name}</b> y usa <b>Escanear QR</b> o escribe el código.</Notice>
          <p className="fine">Sin servidor en esta demo: si el restaurante valida desde otro teléfono, el comprobante aparece en ese teléfono, no en este.</p>
          <Button variant="secondary" icon="x" onClick={() => dispatch({ type: 'CANCEL_CODE', code: c.code })}>Cancelar código</Button>
        </>
      ) : null}

      {pend ? (
        <Notice tone="warn" title="Registro pendiente en el restaurante">
          El restaurante registró la operación en modo contingencia (folio {pend.folio}). Se confirmará cuando se restablezca la conexión.
        </Notice>
      ) : null}

      {tx ? (
        <div className="receipt">
          <h3 className="h3">{tx.status === 'verificada' ? 'Compra verificada' : 'Recipiente no aceptado'}</h3>
          <dl>
            <div><dt>Transacción</dt><dd>{tx.id}</dd></div>
            <div><dt>Fecha</dt><dd>{fmtDateTime(tx.createdAt)}</dd></div>
            <div><dt>Precio original</dt><dd>{money(tx.listPrice)}</dd></div>
            <div><dt>Beneficio</dt><dd>{tx.discount ? `−${money(tx.discount)}` : 'Sin promoción'}</dd></div>
            <div><dt>Pagado</dt><dd><b>{money(tx.paid)}</b></dd></div>
            <div><dt>Recipiente</dt><dd>{tx.containerAccepted ? (tx.substitution === 'confirmada' ? 'Sustituyó un desechable' : 'Aceptado · sin sustitución confirmada') : 'No aceptado'}</dd></div>
          </dl>
          {tx.status === 'verificada' ? <p className="fine">Gracias por llevar tu recipiente. Recuerda lavarlo al llegar.</p> : <p className="fine">El restaurante decide qué recipientes son adecuados para su operación.</p>}
          <Button variant="secondary" onClick={() => go('history')}>Ver historial</Button>
        </div>
      ) : null}

      {['cancelado', 'expirado'].includes(st) ? <Button onClick={() => go('explore')}>Elegir otra promoción</Button> : null}
    </div>
  );
}

function History({ go }) {
  const { mine, verified, subs, savings } = useMyStats();
  const [filter, setFilter] = useState('todas');
  const list = mine.filter((t) => filter === 'todas' || (filter === 'verificadas' ? t.status === 'verificada' : t.status !== 'verificada'));
  return (
    <div className="s-page">
      <Header title="Historial" />
      <Notice tone="warn" title="Historial simulado">Incluye operaciones sintéticas de demostración más las que hagas en esta sesión.</Notice>
      <section className="s-stats">
        <Stat label="Beneficios recibidos" value={money0(savings)} />
        <Stat label="Verificadas" value={num(verified.length)} />
        <Stat label="Reutilizaciones confirmadas" value={num(subs.length)} />
      </section>
      <Segmented small ariaLabel="Filtrar" value={filter} onChange={setFilter}
        options={[{ value: 'todas', label: 'Todas' }, { value: 'verificadas', label: 'Verificadas' }, { value: 'otras', label: 'Otras' }]} />
      <ul className="tx-list">
        {list.map((t) => {
          const r = rest(t.restaurantId);
          return (
            <li key={t.id}>
              <div>
                <b>{r?.name}</b>
                <span className="muted">{fmtDate(t.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {t.id}{t.synthetic ? ' · sintética' : ''}</span>
                <span className="tx-badges"><Badge status={t.status} />{t.status === 'verificada' ? <Badge status={t.substitution} /> : null}</span>
              </div>
              <div className="tx-amt">
                <b>{money(t.paid)}</b>
                {t.discount ? <span className="save">−{money(t.discount)}</span> : null}
              </div>
            </li>
          );
        })}
        {!list.length ? <Empty icon="clock" title="Sin operaciones" /> : null}
      </ul>
      <Button variant="secondary" icon="impact" onClick={() => go('impact')}>Ver mi impacto</Button>
    </div>
  );
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];

function Impact() {
  const { state, dispatch } = useStore();
  const { verified, subs, streak, mine } = useMyStats();
  const accepted = verified.length;
  const rejected = mine.filter((t) => t.status === 'rechazada').length;
  const toggleDay = (d) => {
    const days = state.reminders.days.includes(d) ? state.reminders.days.filter((x) => x !== d) : [...state.reminders.days, d];
    dispatch({ type: 'SET_REMINDERS', reminders: { ...state.reminders, days: DAYS.filter((x) => days.includes(x)) } });
  };
  return (
    <div className="s-page">
      <Header title="Mi impacto" />
      <section className="impact-hero">
        <p className="eyebrow">Recipientes potencialmente sustituidos</p>
        <div className="impact-num">{num(subs.length)}</div>
        <p>Compras en las que el restaurante confirmó que tu recipiente reemplazó a un desechable.</p>
        <SyntheticTag>Incluye datos sintéticos</SyntheticTag>
      </section>

      <section className="s-stats">
        <Stat label="Operaciones verificadas" value={num(accepted)} />
        <Stat label="Recipientes rechazados" value={num(rejected)} />
        <Stat label="Semanas seguidas" value={num(streak)} />
      </section>

      <section className="method">
        <h3 className="h3">Cómo lo medimos</h3>
        <ul>
          <li><b>Operación verificada:</b> el restaurante validó tu código y aceptó tu recipiente.</li>
          <li><b>Sustitución confirmada:</b> además, el encargado confirmó que no se entregó un desechable.</li>
          <li><b>No contamos</b> códigos generados, cancelados, vencidos, rechazados ni operaciones pendientes.</li>
          <li><b>No estimamos emisiones</b> de CO₂: no tenemos todavía una metodología validada para hacerlo.</li>
        </ul>
      </section>

      <section className="habit-settings">
        <h3 className="h3">Mis recordatorios</h3>
        <label className="switch-row">
          <span>Recordarme llevar mi recipiente</span>
          <input type="checkbox" role="switch" checked={state.reminders.enabled}
            onChange={(e) => dispatch({ type: 'SET_REMINDERS', reminders: { ...state.reminders, enabled: e.target.checked } })} />
        </label>
        <div className="chips" role="group" aria-label="Días de recordatorio">
          {DAYS.map((d) => (
            <button key={d} className={`chip ${state.reminders.days.includes(d) ? 'on' : ''}`} aria-pressed={state.reminders.days.includes(d)}
              onClick={() => toggleDay(d)} disabled={!state.reminders.enabled}>{d}</button>
          ))}
        </div>
        <p className="fine">En la demo los recordatorios se muestran en Inicio; no se envían notificaciones.</p>
      </section>

      <section className="tips">
        <h3 className="h3">Hábitos que ayudan</h3>
        <ul className="ticks">
          <li><Icon name="check" size={16} />Lava el recipiente al llegar, no al día siguiente.</li>
          <li><Icon name="check" size={16} />Deja uno en tu mochila o casillero los días de compra.</li>
          <li><Icon name="check" size={16} />Etiquétalo con tu nombre para no perderlo.</li>
        </ul>
      </section>
    </div>
  );
}
