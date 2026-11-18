import React, { useEffect, useState } from 'react';
import { useStore } from './lib/store.jsx';
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
  const { state, dispatch } = useStore();
  const [profile, setProfile] = useState(fromHash);
  const [guide, setGuide] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

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
            <b>Plataforma de reutilización · Distrito Tec</b>
            <span>Prototipo · nombre provisional · modo demostración</span>
          </div>
        </div>
        <Segmented ariaLabel="Perfil" options={PROFILES} value={profile} onChange={choose} />
        <div className="top-actions">
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
      <footer className="app-foot">
        Prototipo de demostración. Funciona sin servidor: los datos se guardan solo en este navegador (cada teléfono tiene los suyos). Restaurantes, usuarios y cifras son sintéticos.
        No representa una alianza, contrato ni implementación con ninguna institución.
      </footer>
    </div>
  );
}
