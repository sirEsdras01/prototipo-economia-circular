// Panel institucional: indicadores de participación, comerciales y de reutilización.
import React, { useMemo, useState } from 'react';
import { useStore, useNow, livePeers } from '../lib/store.jsx';
import { RESTAURANTS, SYNTH_USERS } from '../lib/seed.js';
import { money0, num, pct, weekStart, fmtDate, downloadFile, toCSV } from '../lib/utils.js';
import { summarize, series, periodStart, PERIODS, METHODOLOGY, confirmedSubstitutions, emissionsEstimate } from '../lib/impact.js';
import { Icon, Stat, Notice, SyntheticTag, BarChart, Legend, Button, Segmented, Field } from '../components/ui.jsx';

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
      text: <><b>{t.restaurantName}</b> {t.status === 'verificada' ? 'validó una compra' : t.status === 'pendiente' ? 'registró una compra sin conexión' : t.status === 'duplicada' ? 'bloqueó un código duplicado' : t.status === 'revertida' ? 'revirtió una compra' : 'rechazó un recipiente'}{t.status === 'verificada' ? (confirmedSubstitutions(t) ? ` · ${confirmedSubstitutions(t)} recipiente${confirmedSubstitutions(t) > 1 ? 's' : ''} sustituido${confirmedSubstitutions(t) > 1 ? 's' : ''}` : ' · sin sustitución confirmada') : ''}</>,
    })),
    ...state.users.filter((u) => !u.demo).map((u) => ({ ts: u.createdAt, icon: 'users', tone: 'info', text: <>Se registró un estudiante{u.career ? ` · ${u.career}` : ''}</> })),
    ...state.codes.filter((c) => !c.synthetic && !c.external).map((c) => ({ ts: c.createdAt, icon: 'qr', tone: 'muted', text: <>Se generó un código en <b>{RESTAURANTS.find((r) => r.id === c.restaurantId)?.name}</b></> })),
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


const fmtKg = (kg) => `${kg.toLocaleString('es-MX', { maximumFractionDigits: 2 })} kg`;

function EnvironmentalImpact() {
  const { state } = useStore();
  const [period, setPeriod] = useState('30d');
  const [rid, setRid] = useState('');
  const [synthetic, setSynthetic] = useState(true);
  const [gran, setGran] = useState('week');
  const [editRefs, setEditRefs] = useState(false);
  const opts = { since: periodStart(period), restaurantId: rid || undefined, includeSynthetic: synthetic };
  const m = useMemo(() => summarize(state.transactions, opts), [state.transactions, period, rid, synthetic]); // eslint-disable-line react-hooks/exhaustive-deps
  const ser = useMemo(() => series(state.transactions, { ...opts, period: period === '7d' ? '30d' : period, granularity: gran }), [state.transactions, period, rid, synthetic, gran]); // eslint-disable-line react-hooks/exhaustive-deps
  const chartData = ser.points.slice(-12).map((p) => ({
    label: new Date(p.start).toLocaleDateString('es-MX', gran === 'month' ? { month: 'short' } : { day: '2-digit', month: 'short' }).replace('.', ''),
    s: p.substituted, v: p.purchases,
  }));
  const periodLabel = PERIODS.find((p) => p.value === period).label;
  const exportCsv = () => {
    const gen = new Date().toISOString();
    const rows = [
      { indicador: 'Generado', valor: gen, nota: 'RePack · prototipo de demostración' },
      { indicador: 'Periodo', valor: periodLabel, nota: rid ? `Establecimiento: ${RESTAURANTS.find((r) => r.id === rid)?.name}` : 'Todos los establecimientos' },
      { indicador: 'Datos', valor: synthetic ? 'Sintéticos + en vivo' : 'Solo en vivo', nota: 'Los datos sintéticos no son resultados reales' },
      { indicador: 'Compras verificadas con topper', valor: m.topperPurchases, nota: '' },
      { indicador: 'Recipientes desechables sustituidos', valor: m.substituted, nota: 'Confirmados por el restaurante' },
      { indicador: 'Masa estimada de residuos de envase evitada (kg)', valor: m.massKg != null ? m.massKg.toFixed(3) : 'Pendiente', nota: `${m.massCoverage.withRef} recipientes con peso de referencia; ${m.massCoverage.withoutRef} sin peso` },
      { indicador: 'Usuarios participantes', valor: m.participants, nota: 'Con al menos una compra verificada con topper' },
      { indicador: 'Usuarios recurrentes', valor: m.recurrent, nota: 'Dos o más compras en el periodo' },
      { indicador: 'Restaurantes activos', valor: m.activeRestaurants, nota: '' },
      { indicador: '% de compras con sustitución confirmada', valor: m.confirmedRate == null ? '' : (m.confirmedRate * 100).toFixed(1), nota: '' },
      { indicador: 'Compras con información ambiental incompleta', valor: m.incomplete, nota: 'No determinada, cantidad heredada o sin peso de referencia' },
      { indicador: 'Compras pendientes (no cuentan)', valor: m.pending, nota: '' },
      { indicador: 'Compras revertidas (no cuentan)', valor: m.reverted, nota: '' },
      { indicador: 'CO2e evitado', valor: 'No calculado', nota: emissionsEstimate().reason },
      ...METHODOLOGY.map((t, i) => ({ indicador: `Metodología ${i + 1}`, valor: '', nota: t })),
    ];
    downloadFile(`repack_impacto_ambiental_${period}.csv`, toCSV(rows));
  };
  return (
    <section className="panel env">
      <div className="panel-head">
        <div><p className="eyebrow">Impacto ambiental colectivo · datos agregados</p><h2>Recipientes desechables sustituidos</h2></div>
        <div className="row gap wrap">
          <Segmented small ariaLabel="Periodo" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} />
          <select className="mini-select" value={rid} onChange={(e) => setRid(e.target.value)} aria-label="Establecimiento">
            <option value="">Todos los establecimientos</option>
            {RESTAURANTS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <label className="switch-row compact"><span>Incluir sintéticos</span><input type="checkbox" role="switch" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} /></label>
          <Button variant="secondary" icon="download" onClick={exportCsv}>CSV</Button>
        </div>
      </div>
      <div className="env-hero">
        <div className="env-big"><b key={m.substituted}>{num(m.substituted)}</b><span>recipientes desechables sustituidos · {periodLabel.toLowerCase()}</span></div>
        <div className="env-kpis">
          <div><span>Compras verificadas con topper</span><b>{num(m.topperPurchases)}</b></div>
          <div><span>Residuos de envase evitados</span>{m.massKg != null ? <b>{fmtKg(m.massKg)}</b> : <b className="pending-val">Pendiente</b>}<small>{m.massKg != null ? `${m.massCoverage.withRef} de ${m.massCoverage.withRef + m.massCoverage.withoutRef} recipientes con peso` : 'Sin peso de referencia verificado'}</small></div>
          <div><span>% con sustitución confirmada</span><b>{m.confirmedRate == null ? '—' : pct(m.confirmedRate)}</b></div>
          <div><span>Usuarios participantes</span><b>{num(m.participants)}</b><small>{num(m.recurrent)} recurrentes</small></div>
          <div><span>Restaurantes activos</span><b>{num(m.activeRestaurants)}</b></div>
          <div><span>Información ambiental incompleta</span><b>{num(m.incomplete)}</b><small>compras</small></div>
        </div>
      </div>
      <div className="panel-head">
        <h3 className="h3" style={{ margin: 0 }}>Evolución</h3>
        <div className="row gap"><Segmented small ariaLabel="Agrupar" value={gran} onChange={setGran} options={[{ value: 'week', label: 'Semanal' }, { value: 'month', label: 'Mensual' }]} /><Legend series={ENV_SERIES} /></div>
      </div>
      <BarChart data={chartData} series={ENV_SERIES} height={190} />
      <div className="env-foot">
        <p className="fine">Solo datos agregados: el panel institucional no muestra historiales individuales. CO₂e no calculado: {emissionsEstimate().reason}</p>
        <button className="link" onClick={() => setEditRefs((v) => !v)}>{editRefs ? 'Cerrar referencias de envases' : 'Referencias de envases (pesos)'}</button>
      </div>
      {editRefs ? <PackagingRefs /> : null}
    </section>
  );
}

const ENV_SERIES = [
  { key: 's', label: 'Recipientes sustituidos', color: '#173D32' },
  { key: 'v', label: 'Compras con topper', color: '#C9DCCF' },
];

function PackagingRefs() {
  const { state, dispatch } = useStore();
  const [edit, setEdit] = useState(null);
  const refs = state.packagingRefs || [];
  const valid = edit && (edit.grams === '' || (Number(edit.grams) > 0 && Number(edit.grams) < 2000)) && (edit.grams === '' || edit.source.trim().length >= 3);
  return (
    <div className="refs">
      <Notice tone="info" title="Pesos de referencia">Sin un peso verificado la masa queda pendiente. Captura solo pesos medidos o documentados, con su fuente. Cada cambio crea una versión; las compras ya validadas conservan la versión que usaron.</Notice>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Tipo de envase</th><th className="r">Peso (g)</th><th>Fuente</th><th>Medición</th><th>Vigencia</th><th className="r">Versión</th><th></th></tr></thead>
          <tbody>
            {refs.map((r) => (
              <tr key={r.id}>
                <td><b>{r.type}</b>{r.notes ? <div className="tiny">{r.notes}</div> : null}</td>
                <td className="r">{r.grams ? r.grams : <span className="tiny">Sin configurar</span>}</td>
                <td>{r.source || '—'}</td><td>{r.measuredAt || '—'}</td><td>{r.validUntil || '—'}</td>
                <td className="r">{r.version || 0}</td>
                <td className="r"><button className="link" onClick={() => setEdit({ ...r, grams: r.grams ?? '', source: r.source || '', measuredAt: r.measuredAt || '', validUntil: r.validUntil || '', notes: r.notes || '' })}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit ? (
        <form className="ref-form" onSubmit={(e) => { e.preventDefault(); if (!valid) return; dispatch({ type: 'SAVE_PKG_REF', ref: { ...edit, grams: edit.grams === '' ? null : Number(edit.grams) } }); setEdit(null); }}>
          <b>{edit.type}</b>
          <div className="form-grid">
            <Field label="Peso por envase (g)" hint="Vacío = sin configurar"><input type="number" step="0.1" min="0" value={edit.grams} onChange={(e) => setEdit({ ...edit, grams: e.target.value })} /></Field>
            <Field label="Fuente de medición" hint="Obligatoria si hay peso"><input value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })} placeholder="Ej. Pesaje propio de 10 envases, báscula de cocina" /></Field>
            <Field label="Fecha de medición"><input type="date" value={edit.measuredAt} onChange={(e) => setEdit({ ...edit, measuredAt: e.target.value })} /></Field>
            <Field label="Vigente hasta"><input type="date" value={edit.validUntil} onChange={(e) => setEdit({ ...edit, validUntil: e.target.value })} /></Field>
            <Field label="Observaciones"><input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
          </div>
          <div className="row gap"><Button variant="secondary" type="button" onClick={() => setEdit(null)}>Cancelar</Button><Button type="submit" icon="check" disabled={!valid}>Guardar versión</Button></div>
        </form>
      ) : null}
    </div>
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

      <EnvironmentalImpact />

      <LiveFeed />

      <div className="stat-grid">
        <Stat label="Usuarios registrados" value={num(SYNTH_USERS + state.users.filter((u) => !u.demo).length)} hint={`${SYNTH_USERS} sintéticos + ${state.users.filter((u) => !u.demo).length} en vivo`} />
        <Stat label="Usuarios activos (30 días)" value={num(m.active30)} hint="Al menos una compra verificada" />
        <Stat label="Restaurantes participantes" value={num(m.restaurants)} hint="Con promoción activa" />
        <Stat label="Compras elegibles verificadas" value={num(m.v.length)} />
        <Stat label="Compras con sustitución confirmada" value={num(m.subs.length)} hint={`${pct(m.v.length ? m.subs.length / m.v.length : 0)} de las verificadas`} tone="accent" />
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
