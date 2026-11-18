// Panel institucional: indicadores de participación, comerciales y de reutilización.
import React, { useMemo, useState } from 'react';
import { useStore, useNow, livePeers } from '../lib/store.jsx';
import { RESTAURANTS, SYNTH_USERS } from '../lib/seed.js';
import { money0, num, pct, weekStart, fmtDate, downloadFile, toCSV } from '../lib/utils.js';
import { Icon, Stat, Notice, SyntheticTag, BarChart, Legend, Button, Segmented } from '../components/ui.jsx';

const DAY = 86400000;
const SERIES = [
  { key: 'v', label: 'Compras elegibles verificadas', color: '#173D32' },
  { key: 's', label: 'Sustituciones confirmadas', color: '#8DB5A0' },
];

function ago(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

function LiveFeed() {
  const { state, live } = useStore();
  const now = useNow(1000);
  const items = [
    ...state.transactions.filter((t) => !t.synthetic).map((t) => ({
      ts: t.updatedAt || t.createdAt, icon: t.status === 'verificada' ? 'check' : t.status === 'pendiente' ? 'clock' : 'x',
      tone: t.status === 'verificada' ? 'ok' : t.status === 'pendiente' ? 'warn' : 'bad',
      text: <><b>{t.restaurantName}</b> {t.status === 'verificada' ? 'validó la compra de' : t.status === 'pendiente' ? 'registró sin conexión a' : t.status === 'duplicada' ? 'bloqueó un duplicado de' : 'rechazó el recipiente de'} <b>{t.userAlias || 'un alumno'}</b>{t.status === 'verificada' && t.substitution === 'confirmada' ? ' · sustituyó un desechable' : ''}</>,
    })),
    ...state.users.filter((u) => !u.demo).map((u) => ({ ts: u.createdAt, icon: 'users', tone: 'info', text: <><b>{u.alias}</b> se registró{u.career ? ` · ${u.career}` : ''}</> })),
    ...state.codes.filter((c) => !c.synthetic && !c.external).map((c) => ({ ts: c.createdAt, icon: 'qr', tone: 'muted', text: <><b>{c.userAlias || 'Un alumno'}</b> generó un código en <b>{RESTAURANTS.find((r) => r.id === c.restaurantId)?.name}</b></> })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 9);
  const peers = livePeers(live.peers);
  const count = (k) => peers.filter(([, p]) => p.profile === k).length;
  return (
    <section className="panel live-panel">
      <div className="panel-head">
        <h2><span className={`live-dot ${live.status}`} />Actividad en vivo</h2>
        <span className="muted small">{peers.length} dispositivo{peers.length === 1 ? '' : 's'} conectado{peers.length === 1 ? '' : 's'} · {count('estudiante')} estudiante · {count('restaurante')} restaurante · {count('institucion')} institución</span>
      </div>
      {items.length ? (
        <ul className="feed">
          {items.map((it, i) => (
            <li key={i} className={`feed-${it.tone}`}><span className="feed-icon"><Icon name={it.icon} size={14} /></span><span className="feed-text">{it.text}</span><span className="feed-time">{ago(it.ts, now)}</span></li>
          ))}
        </ul>
      ) : <p className="muted small">Aún no hay actividad en vivo. Escanea el QR de la demo, regístrate como estudiante y valida una compra: aparecerá aquí al instante.</p>}
    </section>
  );
}

export default function InstitutionApp() {
  const { state } = useStore();
  const [period, setPeriod] = useState('56');
  const days = Number(period);

  const m = useMemo(() => {
    const since = Date.now() - days * DAY;
    const tx = state.transactions.filter((t) => t.createdAt >= since);
    const v = tx.filter((t) => t.status === 'verificada');
    const subs = v.filter((t) => t.substitution === 'confirmada');
    const codes = state.codes.filter((c) => c.createdAt >= since);
    const active30 = new Set(state.transactions.filter((t) => t.status === 'verificada' && t.createdAt >= Date.now() - 30 * DAY).map((t) => t.userId));
    const weeks = [];
    const nW = Math.ceil(days / 7);
    for (let i = nW - 1; i >= 0; i--) {
      const ws = weekStart(Date.now()) - i * 7 * DAY;
      const w = state.transactions.filter((t) => t.status === 'verificada' && weekStart(t.createdAt) === ws);
      weeks.push({ label: fmtDate(ws, { day: '2-digit', month: 'short' }).replace('.', ''), v: w.length, s: w.filter((t) => t.substitution === 'confirmada').length });
    }
    const byRest = RESTAURANTS.map((r) => {
      const rv = v.filter((t) => t.restaurantId === r.id);
      const rs = rv.filter((t) => t.substitution === 'confirmada');
      return {
        r, verified: rv.length, subs: rs.length, rate: rv.length ? rs.length / rv.length : 0,
        rejected: tx.filter((t) => t.restaurantId === r.id && t.status === 'rechazada').length,
        pending: tx.filter((t) => t.restaurantId === r.id && t.status === 'pendiente').length,
        revenue: rv.reduce((s, t) => s + t.paid, 0), discounts: rv.reduce((s, t) => s + t.discount, 0),
        active: state.promotions.some((p) => p.restaurantId === r.id && p.active),
      };
    });
    return {
      tx, v, subs, codes, active30: active30.size, weeks, byRest,
      rejected: tx.filter((t) => t.status === 'rechazada').length,
      pending: tx.filter((t) => t.status === 'pendiente').length,
      duplicates: tx.filter((t) => t.status === 'duplicada').length,
      revenue: v.reduce((s, t) => s + t.paid, 0), discounts: v.reduce((s, t) => s + t.discount, 0),
      commission: v.reduce((s, t) => s + t.commission, 0),
      restaurants: byRest.filter((x) => x.active).length,
    };
  }, [state.transactions, state.codes, state.promotions, days]);

  const maxRest = Math.max(1, ...m.byRest.map((x) => x.verified));
  const funnel = [
    { label: 'Códigos generados', value: m.codes.length, note: 'Intención de compra' },
    { label: 'Compras elegibles verificadas', value: m.v.length, note: 'QR validado y recipiente aceptado' },
    { label: 'Sustituciones confirmadas', value: m.subs.length, note: 'Encargado confirma que no entregó desechable' },
  ];

  const exportSummary = () => downloadFile('reporte_indicadores_demo.csv', toCSV([
    { indicador: 'Periodo (días)', valor: days, nota: 'DATOS SINTÉTICOS DE DEMOSTRACIÓN' },
    { indicador: 'Usuarios registrados', valor: SYNTH_USERS + state.users.filter((u) => !u.demo).length, nota: 'sintéticos + registrados en vivo' },
    { indicador: 'Usuarios activos 30 días', valor: m.active30, nota: 'con al menos una compra verificada' },
    { indicador: 'Restaurantes participantes', valor: m.restaurants, nota: 'ficticios' },
    { indicador: 'Códigos generados', valor: m.codes.length, nota: '' },
    { indicador: 'Compras elegibles verificadas', valor: m.v.length, nota: '' },
    { indicador: 'Sustituciones confirmadas', valor: m.subs.length, nota: 'confirmación declarada por el restaurante' },
    { indicador: 'Recipientes rechazados', valor: m.rejected, nota: '' },
    { indicador: 'Operaciones pendientes (no contabilizadas)', valor: m.pending, nota: 'modo contingencia' },
    { indicador: 'Duplicados bloqueados', valor: m.duplicates, nota: '' },
    { indicador: 'Ingresos atribuidos (MXN)', valor: m.revenue.toFixed(2), nota: 'no equivale a ventas incrementales' },
    { indicador: 'Descuentos otorgados (MXN)', valor: m.discounts.toFixed(2), nota: 'financiados por restaurantes' },
    { indicador: 'Comisiones generadas (MXN)', valor: m.commission.toFixed(2), nota: '2 % sobre compras verificadas' },
    { indicador: 'Emisiones evitadas', valor: 'No estimado', nota: 'sin metodología validada' },
    ...m.byRest.map((x) => ({ indicador: `Verificadas · ${x.r.name} (ficticio)`, valor: x.verified, nota: `sustituciones ${x.subs}` })),
  ]));
  const exportTx = () => downloadFile('transacciones_anonimizadas_demo.csv', toCSV(m.tx.map((t) => ({
    fecha: new Date(t.createdAt).toISOString().slice(0, 10), restaurante: RESTAURANTS.find((r) => r.id === t.restaurantId)?.name,
    estado: t.status, recipiente_aceptado: t.containerAccepted ? 'si' : 'no', sustitucion: t.substitution, pagado: t.paid,
    descuento: t.discount, comision: t.commission, canal: t.channel, sintetico: t.synthetic ? 'si' : 'no',
  }))));

  return (
    <div className="page wide inst">
      <div className="page-head">
        <div>
          <p className="eyebrow">Panel institucional · Distrito Tec (demostración)</p>
          <h1>Participación e impacto</h1>
        </div>
        <div className="row gap wrap">
          <Segmented small ariaLabel="Periodo" value={period} onChange={setPeriod}
            options={[{ value: '28', label: '4 semanas' }, { value: '56', label: '8 semanas' }]} />
          <Button variant="secondary" icon="download" onClick={exportSummary}>Reporte CSV</Button>
          <Button variant="secondary" icon="download" onClick={exportTx}>Transacciones</Button>
        </div>
      </div>

      <Notice tone="warn" title="Datos de demostración">
        Las cifras combinan datos sintéticos con lo que registran en vivo los participantes de esta demo. Ningún dato es un resultado real de campo.
      </Notice>

      <LiveFeed />

      <div className="stat-grid">
        <Stat label="Usuarios registrados" value={num(SYNTH_USERS + state.users.filter((u) => !u.demo).length)} hint={`${SYNTH_USERS} sintéticos + ${state.users.filter((u) => !u.demo).length} en vivo`} />
        <Stat label="Usuarios activos (30 días)" value={num(m.active30)} hint="Al menos una compra verificada" />
        <Stat label="Restaurantes participantes" value={num(m.restaurants)} hint="Con promoción activa" />
        <Stat label="Compras elegibles verificadas" value={num(m.v.length)} />
        <Stat label="Sustituciones confirmadas" value={num(m.subs.length)} hint={`${pct(m.v.length ? m.subs.length / m.v.length : 0)} de las verificadas`} tone="accent" />
        <Stat label="Recipientes rechazados" value={num(m.rejected)} />
      </div>

      <div className="inst-grid">
        <section className="panel">
          <div className="panel-head"><h2>Evolución semanal</h2><Legend series={SERIES} /></div>
          <BarChart data={m.weeks} series={SERIES} />
        </section>
        <section className="panel">
          <h2>De la intención a la evidencia</h2>
          <div className="funnel">
            {funnel.map((f, i) => (
              <div key={f.label} className="funnel-row">
                <div className="funnel-bar" style={{ width: `${Math.max(8, (f.value / Math.max(1, funnel[0].value)) * 100)}%`, opacity: 1 - i * 0.22 }} />
                <div className="funnel-text"><b>{num(f.value)}</b><span>{f.label}</span><small>{f.note}</small></div>
              </div>
            ))}
          </div>
          <p className="fine">Una transacción verificada no equivale a un recipiente sustituido. Solo contamos sustituciones con confirmación explícita del encargado.</p>
        </section>
      </div>

      <div className="inst-grid">
        <section className="panel">
          <h2>Participación por establecimiento</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Restaurante (ficticio)</th><th>Compras verificadas</th><th className="r">Sustituciones</th><th className="r">Tasa</th><th className="r">Rechazos</th></tr></thead>
              <tbody>
                {m.byRest.map((x) => (
                  <tr key={x.r.id}>
                    <td><b>{x.r.name}</b><div className="tiny">{x.r.cuisine}</div></td>
                    <td><div className="hbar"><i style={{ width: `${(x.verified / maxRest) * 100}%` }} /><span>{x.verified}</span></div></td>
                    <td className="r">{x.subs}</td>
                    <td className="r">{pct(x.rate)}</td>
                    <td className="r">{x.rejected}{x.pending ? <div className="tiny warn-text">{x.pending} pendiente(s)</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>Indicadores comerciales</h2>
          <dl className="sale-sum">
            <div><dt>Ingresos atribuidos a promociones</dt><dd>{money0(m.revenue)}</dd></div>
            <div><dt>Descuentos otorgados por restaurantes</dt><dd>{money0(m.discounts)}</dd></div>
            <div><dt>Comisiones generadas (2 %)</dt><dd>{money0(m.commission)}</dd></div>
          </dl>
          <h2 className="mt">Calidad de los datos</h2>
          <ul className="quality">
            <li><Icon name={m.pending ? 'alert' : 'check'} size={16} />{m.pending ? `${m.pending} operación(es) pendiente(s) no contabilizadas` : 'Sin operaciones pendientes'}</li>
            <li><Icon name="shield" size={16} />{m.duplicates} registro(s) duplicado(s) bloqueado(s)</li>
            <li><Icon name="info" size={16} />La sustitución depende de la confirmación del encargado; se recomienda auditoría muestral.</li>
            <li><Icon name="info" size={16} />No se estiman emisiones evitadas hasta contar con una metodología validada.</li>
          </ul>
        </section>
      </div>
      <div className="foot-tag"><SyntheticTag /></div>
    </div>
  );
}
