import React, { useEffect, useState } from 'react';
import { useStore, livePeers } from './lib/store.jsx';
import { RESTAURANTS } from './lib/seed.js';
import { Icon, Segmented } from './components/ui.jsx';
import StudentApp from './student/StudentApp.jsx';
import RestaurantApp from './restaurant/RestaurantApp.jsx';
import InstitutionApp from './institution/InstitutionApp.jsx';

const PROFILES = [
  { value: 'estudiante', label: 'Estudiante', icon: 'users' },
  { value: 'restaurante', label: 'Restaurante', icon: 'store' },
  { value: 'institucion', label: 'Institución', icon: 'chart' },
];

const fromHash = () => {
  const h = (window.location.hash || '').replace('#', '');
  return PROFILES.some((p) => p.value === h) ? h : 'estudiante';
};

export default function App() {
  const { state, dispatch, live, toasts, setPresence } = useStore();
  const peers = livePeers(live.peers);
  const [profile, setProfile] = useState(fromHash);
  const [guide, setGuide] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    const who = profile === 'estudiante' ? state.me?.alias : profile === 'restaurante' ? RESTAURANTS.find((r) => r.id === state.restaurantSession)?.name : 'Panel institucional';
    setPresence({ profile, who: who || null });
  }, [profile, state.me, state.restaurantSession, setPresence, live.status]);

  useEffect(() => {
    const onHash = () => setProfile(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const choose = (v) => { window.location.hash = v; setProfile(v); window.scrollTo({ top: 0 }); };

  return (
    <div className={`app profile-${profile}`}>
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true"><i /></span>
          <div>
            <b><span className="brand-long">Plataforma de reutilización · </span>Distrito Tec</b>
            <span>Prototipo · nombre provisional · modo demostración</span>
          </div>
        </div>
        <Segmented ariaLabel="Perfil" options={PROFILES} value={profile} onChange={choose} />
        <div className="top-actions">
          <span className={`live-pill ${live.status}`} title={`Sala: ${live.room}`}>
            <span className={`live-dot ${live.status}`} />
            <span>{live.status === 'connected' ? `En vivo · ${Math.max(1, peers.length)}` : live.status === 'connecting' ? 'Conectando…' : 'Sin conexión en vivo'}</span>
          </span>
          <button className={`conn-toggle ${state.online ? 'on' : 'off'}`} onClick={() => dispatch({ type: 'SET_ONLINE', online: !state.online })}
            aria-pressed={!state.online} title="Simula una falla de conexión para mostrar el modo contingencia">
            <Icon name={state.online ? 'wifi' : 'wifiOff'} size={16} />
            <span>{state.online ? 'En línea' : 'Falla simulada'}</span>
          </button>
          {confirmReset ? (
            <button className="ghost-btn danger" onClick={() => { dispatch({ type: 'RESET' }); setConfirmReset(false); }}
              onBlur={() => setTimeout(() => setConfirmReset(false), 200)} autoFocus title="Confirmar reinicio">
              <Icon name="refresh" size={16} /><span>¿Confirmar reinicio?</span></button>
          ) : (
            <button className="ghost-btn" onClick={() => setConfirmReset(true)} title="Restablecer datos de demostración">
              <Icon name="refresh" size={16} /><span>Reiniciar demo</span></button>
          )}
        </div>
      </header>

      {guide ? (
        <div className="guide">
          <span className="guide-label">Recorrido sugerido</span>
          <ol>
            <li className={profile === 'estudiante' ? 'on' : ''}><button onClick={() => choose('estudiante')}>Estudiante elige promoción y genera código</button></li>
            <li className={profile === 'restaurante' ? 'on' : ''}><button onClick={() => choose('restaurante')}>Restaurante valida recipiente y registra venta</button></li>
            <li className={profile === 'institucion' ? 'on' : ''}><button onClick={() => choose('institucion')}>Institución consulta indicadores</button></li>
          </ol>
          <button className="icon-btn" onClick={() => setGuide(false)} aria-label="Ocultar recorrido"><Icon name="x" size={16} /></button>
        </div>
      ) : null}

      <div className="stage">
        {profile === 'estudiante' && <StudentApp />}
        {profile === 'restaurante' && <RestaurantApp />}
        {profile === 'institucion' && <InstitutionApp />}
      </div>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon name={t.tone === 'ok' ? 'check' : t.tone === 'warn' ? 'alert' : 'live'} size={18} />
            <div><b>{t.title}</b><span>{t.body}</span></div>
          </div>
        ))}
      </div>
      <footer className="app-foot">
        Prototipo de demostración. Lo que registran los participantes se comparte en vivo entre dispositivos mediante un servidor público de mensajería: no escribas datos personales. Restaurantes, usuarios y cifras son sintéticos.
        No representa una alianza, contrato ni implementación con ninguna institución.
      </footer>
    </div>
  );
}
