// Componentes reutilizables de interfaz.
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4.5l3 2',
  impact: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1',
  check: 'M5 12.5 10 17 19 7',
  x: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5v.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14',
  wifi: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.8 16a5 5 0 0 1 6.4 0M12 19.5v.01',
  wifiOff: 'M3 3l18 18M8.8 16a5 5 0 0 1 6.4 0M5.5 12.5a9.4 9.4 0 0 1 4-2.3M2.5 9a14 14 0 0 1 4.3-2.7M14.5 10.4a9.5 9.5 0 0 1 4 2.1M17.5 6.6A14 14 0 0 1 21.5 9M12 19.5v.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  store: 'M4 9h16l-1.5-5h-13zM5 9v11h14V9M9 20v-6h6v6',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  calc: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H3',
  container: 'M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM3 6h18v3H3z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  arrowLeft: 'M19 12H5m6-6-6 6 6 6',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  camera: 'M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  live: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6 6 0 0 1 4 7',
};

export function Icon({ name, size = 20, stroke = 1.75, className = '', title }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      <path d={PATHS[name] || PATHS.info} />
    </svg>
  );
}

const STATUS = {
  verificada: ['ok', 'Verificada'],
  validado: ['ok', 'Validado'],
  pendiente: ['warn', 'Pendiente'],
  rechazada: ['bad', 'Recipiente rechazado'],
  rechazado: ['bad', 'Rechazado'],
  duplicada: ['bad', 'Duplicada · no cuenta'],
  cancelado: ['muted', 'Cancelado'],
  expirado: ['muted', 'Vencido'],
  confirmada: ['ok', 'Sustitución confirmada'],
  no: ['muted', 'Sin sustitución'],
  no_aplica: ['muted', 'No aplica'],
};

export function Badge({ tone = 'muted', children, status }) {
  const [t, label] = status ? STATUS[status] || ['muted', status] : [tone, children];
  return <span className={`badge badge-${t}`}>{status ? label : children}</span>;
}

export function SyntheticTag({ children = 'Datos sintéticos' }) {
  return <span className="synthetic-tag" title="Datos generados para la demostración. No son resultados reales.">{children}</span>;
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value" key={String(value)}>{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
}

export function Notice({ tone = 'info', title, children, icon }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'bad' ? 'alert' : 'note'}>
      <Icon name={icon || (tone === 'info' ? 'info' : tone === 'ok' ? 'check' : 'alert')} size={18} />
      <div>
        {title ? <strong>{title}</strong> : null}
        {children ? <div className="notice-body">{children}</div> : null}
      </div>
    </div>
  );
}

export function Button({ variant = 'primary', icon, children, className = '', ...rest }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...rest}>
      {icon ? <Icon name={icon} size={18} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function Segmented({ options, value, onChange, ariaLabel, small }) {
  return (
    <div className={`segmented ${small ? 'segmented-sm' : ''}`} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}>
          {o.icon ? <Icon name={o.icon} size={16} /> : null}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, suffix, prefix }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">
        {prefix ? <span className="affix">{prefix}</span> : null}
        {children}
        {suffix ? <span className="affix">{suffix}</span> : null}
      </span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function QR({ value, size = 220 }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#173D32', light: '#FFFFFF' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''));
    return () => { alive = false; };
  }, [value]);
  return <div className="qr" style={{ width: size, height: size }} aria-label={`Código QR ${value}`} role="img" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// Gráfico de barras agrupadas / línea muy ligero (SVG), sin dependencias.
export function BarChart({ data, series, height = 220, format = (v) => v }) {
  const W = 640, H = height, pad = { l: 36, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key])));
  const nice = Math.ceil(max / 10) * 10;
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = iw / data.length;
  const inner = Math.min(18, (bw * 0.7) / series.length);
  const ticks = [0, 0.5, 1].map((f) => Math.round(nice * f));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Gráfico de barras">
      {ticks.map((t) => {
        const y = pad.t + ih - (t / nice) * ih;
        return (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} className="grid" />
            <text x={pad.l - 6} y={y + 4} textAnchor="end" className="tick">{format(t)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const x0 = pad.l + i * bw + (bw - inner * series.length - 3 * (series.length - 1)) / 2;
        return (
          <g key={i}>
            {series.map((s, j) => {
              const h = (d[s.key] / nice) * ih;
              return <rect key={s.key} x={x0 + j * (inner + 3)} y={pad.t + ih - h} width={inner} height={Math.max(h, 0)} rx="3" fill={s.color}>
                <title>{`${d.label} · ${s.label}: ${d[s.key]}`}</title>
              </rect>;
            })}
            <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="tick">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ series }) {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>
      ))}
    </div>
  );
}

export function Empty({ icon = 'info', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
