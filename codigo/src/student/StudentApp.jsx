// Experiencia del estudiante (móvil primero).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, useNow, codeStatus } from '../lib/store.jsx';
import { RESTAURANTS, CUISINES, DEMO_USER, PROMOTIONS } from '../lib/seed.js';
import { money, money0, newCode, fmtDate, fmtDateTime, num, CODE_TTL_MIN, weekStart } from '../lib/utils.js';
import { Icon, Badge, Button, Notice, QR, SyntheticTag, Stat, Segmented, Empty } from '../components/ui.jsx';
import logo from '../assets/repack-logo.png';
import { summarize, series, progress, periodStart, PERIODS, MILESTONES, METHODOLOGY, confirmedSubstitutions, emissionsEstimate } from '../lib/impact.js';

const rest = (id) => RESTAURANTS.find((r) => r.id === id);

function Register() {
  const { dispatch } = useStore();
  const [alias, setAlias] = useState('');
  const [career, setCareer] = useState('');
  const [ok, setOk] = useState(false);
  const clean = alias.trim().replace(/\s+/g, ' ');
  const valid = clean.length >= 2 && clean.length <= 24 && ok;
  const register = (e) => {
    e.preventDefault();
    if (!valid) return;
    const now = Date.now();
    const id = 'u-' + Math.random().toString(36).slice(2, 10);
    dispatch({ type: 'REGISTER_USER', user: { id, alias: clean, career: career.trim().slice(0, 40), createdAt: now, updatedAt: now } });
  };
  const demo = () => {
    const now = Date.now();
    dispatch({ type: 'REGISTER_USER', user: { id: DEMO_USER.id, alias: DEMO_USER.name, career: 'Perfil de demostración', demo: true, createdAt: now, updatedAt: now } });
  };
  return (
    <form className="s-page register" onSubmit={register}>
      <img className="register-logo" src={logo} alt="RePack" />
      <div>
        <p className="eyebrow">Distrito Tec · demostración en vivo</p>
        <h1 className="register-title">Regístrate para participar</h1>
        <p className="muted">Tu registro y tus compras aparecen al instante en el panel del restaurante y en el institucional.</p>
      </div>
      <label className="field"><span className="field-label">¿Cómo te llamamos?</span>
        <span className="field-control"><input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ej. Luis R." maxLength={24} autoComplete="nickname" /></span>
        <span className="field-hint">Usa un apodo o tu nombre de pila. No escribas datos sensibles.</span>
      </label>
      <label className="field"><span className="field-label">Carrera o área (opcional)</span>
        <span className="field-control"><input value={career} onChange={(e) => setCareer(e.target.value)} placeholder="Ej. IDM, juez, colaborador" maxLength={40} /></span>
      </label>
      <label className="check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Entiendo que es una demo pública: lo que registre lo verán otros participantes.</span>
      </label>
      <Button type="submit" icon="arrowRight" disabled={!valid}>Registrarme</Button>
      <button type="button" className="link center" onClick={demo}>Entrar con el perfil de demostración (Ana)</button>
    </form>
  );
}

export default function StudentApp() {
  const { state } = useStore();
  if (!state.me) {
    return <div className="phone-stage"><div className="phone"><div className="phone-scroll">{<Register />}</div></div></div>;
  }
  return <StudentShell />;
}

function StudentShell() {
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
    { key: 'impact', label: 'Mi impacto', icon: 'impact' },
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
    const meId = state.me?.id;
    const mine = state.transactions.filter((t) => t.userId === meId);
    const verified = mine.filter((t) => t.status === 'verificada');
    const subs = verified.filter((t) => t.substitution === 'confirmada');
    const substituted = verified.reduce((n, t) => n + confirmedSubstitutions(t), 0);
    const savings = verified.reduce((s, t) => s + t.discount, 0);
    const weeks = new Set(verified.map((t) => weekStart(t.createdAt)));
    // racha: semanas consecutivas (hacia atrás desde esta semana o la anterior) con al menos una operación verificada
    let streak = 0;
    let w = weekStart(Date.now());
    if (!weeks.has(w)) w -= 7 * 86400000;
    while (weeks.has(w)) { streak++; w -= 7 * 86400000; }
    return { mine, verified, subs, substituted, savings, streak, pending: mine.filter((t) => t.status === 'pendiente') };
  }, [state.transactions, state.me]);
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
  const { verified, savings, substituted } = useMyStats();
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
          <h1>Hola, {state.me?.alias}</h1>
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

      <button className="impact-teaser" onClick={() => go('impact')}>
        <span className="it-num">{num(substituted)}</span>
        <span className="it-text"><b>{substituted ? `recipiente${substituted === 1 ? '' : 's'} desechable${substituted === 1 ? '' : 's'} sustituido${substituted === 1 ? '' : 's'}` : 'Tu impacto empieza con tu primera compra'}</b><span>Ver mi impacto</span></span>
        <Icon name="arrowRight" size={18} />
      </button>
      <section className="s-stats two">
        <Stat label="Compras verificadas con topper" value={num(verified.length)} />
        <Stat label="Ahorro acumulado" value={money0(savings)} />
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
  const pending = state.codes.find((c) => c.userId === state.me?.id && c.promoId === p.id && codeStatus(c) === 'pendiente');

  const generate = () => {
    if (pending) { go('qr', { code: pending.code }); return; }
    const code = newCode(PROMOTIONS.findIndex((x) => x.id === p.id));
    dispatch({ type: 'GENERATE_CODE', promoId: p.id, userId: state.me.id, alias: state.me.alias, code });
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
  const tx = state.transactions.find((t) => t.code === c.code && ['verificada', 'rechazada', 'revertida'].includes(t.status));
  const nSub = confirmedSubstitutions(tx);
  const total = summarize(state.transactions, { userId: state.me?.id }).substituted;
  const reached = nSub ? progress(total).achieved.find((m) => m > total - nSub && m <= total) : null;
  const pend = state.transactions.find((t) => t.code === c.code && t.status === 'pendiente');
  const remaining = Math.max(0, (c.expiresAt || 0) - now);
  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="s-page">
      <Header title="Mi código" />
      <div className={`qr-card qr-${st}`}>
        <p className="eyebrow">{r.name} · {c.userAlias || state.me?.alias}</p>
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
          <div className="waiting"><span className="pulse" aria-hidden="true" />Esperando validación de {r.name}… esta pantalla se actualiza sola.</div>
          <Notice tone="info" title="Para continuar la demo">En otro teléfono, abre el perfil <b>Restaurante</b>, entra a <b>{r.name}</b> y usa <b>Escanear QR</b>.</Notice>
          <Button variant="secondary" icon="x" onClick={() => dispatch({ type: 'CANCEL_CODE', code: c.code })}>Cancelar código</Button>
        </>
      ) : null}

      {pend ? (
        <Notice tone="warn" title="Compra registrada. La sustitución del recipiente está pendiente de confirmación.">
          El restaurante la registró sin conexión (folio {pend.folio}). No suma a tu impacto hasta que se confirme.
        </Notice>
      ) : null}

      {tx && tx.status === 'verificada' ? (
        nSub ? (
          <section className="impact-feedback">
            <p className="eyebrow">Impacto confirmado</p>
            <h3>¡Tu elección cuenta!</h3>
            <p>Hoy evitaste utilizar <b>{nSub} recipiente{nSub > 1 ? 's' : ''} desechable{nSub > 1 ? 's' : ''}</b>.</p>
            <p>Tu impacto acumulado: <b>{total} recipiente{total === 1 ? '' : 's'} sustituido{total === 1 ? '' : 's'}</b>.</p>
            {reached ? <p className="milestone-hit"><Icon name="check" size={16} stroke={2.5} />Alcanzaste el hito de {reached} recipiente{reached > 1 ? 's' : ''}.</p> : null}
            <Button icon="impact" onClick={() => go('impact')}>Ver mi impacto</Button>
          </section>
        ) : (
          <Notice tone="info" title="Compra registrada">
            El restaurante no confirmó la sustitución de un recipiente desechable, así que esta compra no suma a tu impacto.
          </Notice>
        )
      ) : null}

      {tx ? (
        <div className="receipt">
          <h3 className="h3">{tx.status === 'verificada' ? 'Compra verificada' : tx.status === 'revertida' ? 'Compra revertida por el restaurante' : 'Recipiente no aceptado'}</h3>
          <dl>
            <div><dt>Transacción</dt><dd>{tx.id}</dd></div>
            <div><dt>Restaurante</dt><dd>{tx.restaurantName || r.name}{tx.validatedBy ? ` · atendió ${tx.validatedBy}` : ''}</dd></div>
            <div><dt>Alumno</dt><dd>{tx.userAlias || state.me?.alias}</dd></div>
            <div><dt>Fecha</dt><dd>{fmtDateTime(tx.createdAt)}</dd></div>
            <div><dt>Precio original</dt><dd>{money(tx.listPrice)}</dd></div>
            <div><dt>Beneficio</dt><dd>{tx.discount ? `−${money(tx.discount)}` : 'Sin promoción'}</dd></div>
            <div><dt>Pagado</dt><dd><b>{money(tx.paid)}</b></dd></div>
            <div><dt>Recipiente</dt><dd>{tx.status === 'revertida' ? 'Operación revertida' : tx.containerAccepted ? (nSub ? `${nSub} desechable${nSub > 1 ? 's' : ''} sustituido${nSub > 1 ? 's' : ''}` : 'Aceptado · sin sustitución confirmada') : 'No aceptado'}</dd></div>
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
  const { state } = useStore();
  const { mine, verified, substituted, savings } = useMyStats();
  const [filter, setFilter] = useState('todas');
  const list = mine.filter((t) => filter === 'todas' || (filter === 'verificadas' ? t.status === 'verificada' : t.status !== 'verificada'));
  return (
    <div className="s-page">
      <Header title="Historial" />
      <Notice tone="info" title="Historial en vivo">Tus compras aparecen aquí en cuanto el restaurante las valida.{state.me?.demo ? ' El perfil Ana incluye además operaciones sintéticas.' : ''}</Notice>
      <section className="s-stats">
        <Stat label="Beneficios recibidos" value={money0(savings)} />
        <Stat label="Verificadas" value={num(verified.length)} />
        <Stat label="Recipientes sustituidos" value={num(substituted)} />
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
                <span className="tx-badges"><Badge status={t.status} />{t.status === 'verificada' ? (confirmedSubstitutions(t) ? <Badge tone="ok">{confirmedSubstitutions(t)} sustituido{confirmedSubstitutions(t) > 1 ? 's' : ''}</Badge> : <Badge status={t.substitution} />) : null}</span>
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

const fmtKg = (kg) => (kg >= 1 ? `${kg.toLocaleString('es-MX', { maximumFractionDigits: 2 })} kg` : `${Math.round(kg * 1000)} g`);

function ImpactChart({ points, granularity }) {
  const [sel, setSel] = useState(null);
  const max = Math.max(1, ...points.map((p) => Math.max(p.substituted, p.purchases)));
  const label = (ts) => granularity === 'month'
    ? new Date(ts).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')
    : new Date(ts).toLocaleDateString('es-MX', granularity === 'day' ? { weekday: 'short' } : { day: '2-digit', month: 'short' }).replace('.', '');
  const shown = sel != null ? points[sel] : null;
  const every = Math.ceil(points.length / 7);
  return (
    <div className="ichart">
      <div className="ichart-readout" aria-live="polite">
        {shown ? (
          <><b>{label(shown.start)}</b> · {shown.substituted} recipiente{shown.substituted === 1 ? '' : 's'} sustituido{shown.substituted === 1 ? '' : 's'} · {shown.purchases} compra{shown.purchases === 1 ? '' : 's'} con topper</>
        ) : <span className="muted">Toca una barra para ver el detalle</span>}
      </div>
      <div className="ichart-bars" role="list">
        {points.map((p, i) => (
          <button key={p.start} role="listitem" className={`ibar ${sel === i ? 'on' : ''}`} onClick={() => setSel(sel === i ? null : i)}
            aria-label={`${label(p.start)}: ${p.substituted} recipientes sustituidos, ${p.purchases} compras con topper`}>
            <span className="ibar-track">
              <i className="ibar-purchases" style={{ height: `${(p.purchases / max) * 100}%` }} />
              <i className="ibar-subs" style={{ height: `${(p.substituted / max) * 100}%` }} />
            </span>
            <span className="ibar-label">{i % every === 0 || i === points.length - 1 ? label(p.start) : ''}</span>
          </button>
        ))}
      </div>
      <div className="legend"><span><i style={{ background: '#173D32' }} />Recipientes sustituidos</span><span><i style={{ background: '#C9DCCF' }} />Compras con topper</span></div>
    </div>
  );
}

function Impact({ go }) {
  const { state, dispatch, live } = useStore();
  const [period, setPeriod] = useState('30d');
  const [showMethod, setShowMethod] = useState(false);
  const meId = state.me?.id;
  const all = useMemo(() => summarize(state.transactions, { userId: meId }), [state.transactions, meId]);
  const per = useMemo(() => summarize(state.transactions, { userId: meId, since: periodStart(period) }), [state.transactions, meId, period]);
  const ser = useMemo(() => series(state.transactions, { userId: meId, period }), [state.transactions, meId, period]);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const month = useMemo(() => summarize(state.transactions, { userId: meId, since: monthStart.getTime() }), [state.transactions, meId]); // eslint-disable-line react-hooks/exhaustive-deps
  const prog = progress(all.substituted);
  const mine = state.transactions.filter((t) => t.userId === meId && t.status !== 'duplicada');
  const pending = mine.filter((t) => t.status === 'pendiente');
  const refsUsed = [...new Map(mine.filter((t) => t.packagingRef && t.packagingRef.grams).map((t) => [`${t.packagingRef.id}-${t.packagingRef.version}`, t.packagingRef])).values()];
  const empty = all.topperPurchases === 0;
  const syncing = live.status === 'connecting' && !state.me?.demo && empty;
  const toggleDay = (d) => {
    const days = state.reminders.days.includes(d) ? state.reminders.days.filter((x) => x !== d) : [...state.reminders.days, d];
    dispatch({ type: 'SET_REMINDERS', reminders: { ...state.reminders, days: DAYS.filter((x) => days.includes(x)) } });
  };

  return (
    <div className="s-page impact-page">
      <header className="impact-head">
        <p className="eyebrow">Mi impacto{state.me?.demo ? ' · perfil de demostración' : ''}</p>
        <h1>Tu impacto comienza con cada elección.</h1>
        <p className="muted">Descubre cómo tus compras con recipiente reutilizable contribuyen a reducir el uso de envases desechables.</p>
      </header>

      {live.status === 'offline' ? <Notice tone="warn" title="Sin conexión en vivo">Mostramos lo guardado en este dispositivo. Se actualizará al reconectar.</Notice> : null}

      {syncing ? (
        <section className="impact-hero loading" aria-busy="true"><div className="skeleton w60" /><div className="skeleton big" /><div className="skeleton w80" /></section>
      ) : empty ? (
        <section className="impact-hero empty">
          <p className="eyebrow">Recipientes desechables sustituidos</p>
          <div className="impact-title">Tu impacto empieza con tu primera compra.</div>
          <p>Lleva tu topper a un restaurante participante. Cuando el restaurante confirme que no entregó un desechable, aparecerá aquí.</p>
          <Button variant="secondary" icon="search" onClick={() => go('explore')}>Ver promociones</Button>
        </section>
      ) : (
        <section className="impact-hero">
          <p className="eyebrow">Recipientes desechables sustituidos</p>
          <div className="impact-big" key={all.substituted}>{num(all.substituted)}</div>
          <p>Cada uno es un envase que un restaurante confirmó que <b>no entregó</b> porque usaste tu recipiente. Escanear un código no basta: cuenta solo con compra verificada.</p>
          {state.me?.demo ? <SyntheticTag>Incluye datos sintéticos</SyntheticTag> : null}
        </section>
      )}

      {!empty ? (
        <section className="goal">
          <div className="goal-head">
            {prog.next ? (
              <><span>Tu próximo objetivo: <b>{prog.next} recipientes sustituidos</b></span><span className="goal-count">{all.substituted} / {prog.next} — te falta{prog.remaining === 1 ? '' : 'n'} {prog.remaining}</span></>
            ) : <span><b>Completaste todos los hitos.</b> Sigue sumando.</span>}
          </div>
          <div className="goal-bar"><i style={{ width: `${(prog.next ? all.substituted / prog.next : 1) * 100}%` }} /></div>
          <ol className="milestones">
            {MILESTONES.map((m) => (
              <li key={m} className={all.substituted >= m ? 'done' : m === prog.next ? 'next' : ''}>
                <span className="ms-dot">{all.substituted >= m ? <Icon name="check" size={12} stroke={3} /> : null}</span>
                <span className="ms-label">{m === 1 ? '1ª' : m}</span>
              </li>
            ))}
          </ol>
          <p className="fine">Los hitos se basan solo en sustituciones confirmadas por restaurantes.</p>
        </section>
      ) : null}

      {pending.length ? (
        <Notice tone="warn" title={`${pending.length} compra${pending.length > 1 ? 's' : ''} pendiente${pending.length > 1 ? 's' : ''} de confirmación`}>
          Se registraron sin conexión. No suman a tu impacto hasta que el restaurante las confirme.
        </Notice>
      ) : null}

      <Segmented small ariaLabel="Periodo" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} />

      <section className="impact-grid">
        <div className="ig-cell"><span className="ig-label">Compras verificadas con topper</span><b key={per.topperPurchases}>{num(per.topperPurchases)}</b></div>
        <div className="ig-cell"><span className="ig-label">Residuos de envase evitados</span>
          {per.massKg != null ? (
            <><b>{fmtKg(per.massKg)}</b>{per.massCoverage.withoutRef ? <small>estimado sobre {per.massCoverage.withRef} de {per.massCoverage.withRef + per.massCoverage.withoutRef} recipientes</small> : <small>estimado</small>}</>
          ) : <><b className="pending-val">Pendiente</b><small>{per.substituted ? 'Falta un peso de referencia verificado' : 'Sin sustituciones en el periodo'}</small></>}
        </div>
        <div className="ig-cell"><span className="ig-label">Ahorro acumulado</span><b>{money0(per.savings)}</b><small>en el periodo</small></div>
        <div className="ig-cell"><span className="ig-label">Participación este mes</span><b>{num(month.topperPurchases)}</b><small>compra{month.topperPurchases === 1 ? '' : 's'} verificada{month.topperPurchases === 1 ? '' : 's'}</small></div>
      </section>

      <section className="panel-lite">
        <h3 className="h3">Evolución · {PERIODS.find((p) => p.value === period).label}</h3>
        {per.topperPurchases || period === 'all' ? <ImpactChart points={ser.points} granularity={ser.granularity} /> : <p className="muted small">Sin compras verificadas en este periodo.</p>}
      </section>

      <section>
        <h3 className="h3">Historial de impacto</h3>
        <ul className="impact-list">
          {mine.slice(0, 12).map((t) => {
            const n = confirmedSubstitutions(t);
            const tone = t.status === 'pendiente' ? 'pending' : n ? 'confirmed' : 'none';
            return (
              <li key={t.id} className={`il-${tone}`}>
                <span className="il-count">{t.status === 'pendiente' ? '…' : n ? `+${n}` : '0'}</span>
                <span className="il-main">
                  <b>{rest(t.restaurantId)?.name}</b>
                  <span className="muted">{fmtDate(t.validatedAt || t.createdAt, { day: '2-digit', month: 'short' })}{t.discount && t.status === 'verificada' ? ` · ahorro ${money0(t.discount)}` : ''}{t.synthetic ? ' · sintética' : ''}</span>
                </span>
                <span className="il-state">
                  {t.status === 'pendiente' ? <Badge tone="warn">Pendiente</Badge>
                    : t.status === 'verificada' ? (n ? <Badge tone="ok">Confirmada</Badge> : <Badge status={t.substitution} />)
                    : <Badge status={t.status} />}
                </span>
              </li>
            );
          })}
          {!mine.length ? <Empty icon="impact" title="Aún no hay registros">Tus compras con recipiente aparecerán aquí.</Empty> : null}
        </ul>
      </section>

      <section className="method">
        <button className="method-toggle" onClick={() => setShowMethod((v) => !v)} aria-expanded={showMethod}>
          <span>¿Cómo calculamos tu impacto?</span><Icon name={showMethod ? 'x' : 'info'} size={16} />
        </button>
        {showMethod ? (
          <div className="method-body">
            <ul>{METHODOLOGY.map((m) => <li key={m}>{m}</li>)}</ul>
            <h4>Pesos de referencia usados</h4>
            {refsUsed.length ? (
              <ul>{refsUsed.map((r) => <li key={`${r.id}-${r.version}`}><b>{r.type}</b>: {r.grams} g · {r.source || 'sin fuente'}{r.measuredAt ? ` (${r.measuredAt})` : ''} · versión {r.version}</li>)}</ul>
            ) : <p className="fine">Ninguno: todavía no hay pesos de referencia verificados para tus compras, por eso la masa aparece como pendiente.</p>}
            <p className="fine">CO₂e: {emissionsEstimate().reason}</p>
          </div>
        ) : null}
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
      </section>

      <button className="link center" onClick={() => dispatch({ type: 'LOGOUT_USER' })}>Cambiar de usuario en este dispositivo ({state.me?.alias})</button>
    </div>
  );
}
