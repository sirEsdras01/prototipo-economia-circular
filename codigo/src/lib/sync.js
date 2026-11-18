// Sincronización en tiempo real entre dispositivos, sin cuentas ni servidor propio.
//
// Usa brokers MQTT públicos sobre WebSocket seguro. Cada registro (código, transacción,
// promoción, usuario) se publica como mensaje "retenido" en su propio tema, así:
//   - los dispositivos conectados lo reciben al instante, y
//   - un dispositivo que entra después recibe todo el estado al suscribirse.
// Se conecta a dos brokers a la vez y descarta duplicados: si uno falla, el otro sigue.
//
// IMPORTANTE: los brokers públicos no garantizan disponibilidad ni privacidad.
// Úsese solo con datos de demostración, nunca con datos personales reales.

import mqtt from 'mqtt';

const NS = 'reuso-distritotec-v1';
export const DEFAULT_BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];

function params() {
  try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); }
}

export function roomName() {
  const r = (params().get('sala') || 'demo').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);
  return r || 'demo';
}

function brokerList() {
  const b = params().get('broker'); // p. ej. ?broker=ws://localhost:8888 para pruebas locales
  return b ? [b] : DEFAULT_BROKERS;
}

export function deviceId() {
  try {
    let id = localStorage.getItem('demo-device-id');
    if (!id) { id = 'd-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('demo-device-id', id); }
    return id;
  } catch { return 'd-' + Math.random().toString(36).slice(2, 10); }
}

// Crea el canal. handlers: { onRecord(kind, data), onEpoch(epoch), onStatus(status), onPresence(map) }
export function createSync(handlers) {
  const room = roomName();
  const base = `${NS}/${room}`;
  const me = deviceId();
  let epoch = null;
  let presence = {};
  let presenceTimer = null;
  let profile = {};
  let gotRemoteEpoch = false;
  const seen = new Map(); // tema -> payload, para descartar duplicados entre brokers
  const clients = [];
  const status = {};

  const emitStatus = () => {
    const vals = Object.values(status);
    handlers.onStatus?.(vals.includes('connected') ? 'connected' : vals.includes('connecting') ? 'connecting' : 'offline');
  };

  const recTopic = (kind, key) => `${base}/e/${epoch}/rec/${kind}/${encodeURIComponent(key)}`;
  const presTopic = (id) => `${base}/e/${epoch}/presence/${id}`;

  function subscribeEpoch(c, ep, prev) {
    if (prev) c.unsubscribe([`${base}/e/${prev}/rec/#`, `${base}/e/${prev}/presence/+`]);
    c.subscribe([`${base}/e/${ep}/rec/#`, `${base}/e/${ep}/presence/+`], { qos: 1 });
  }

  function handleMessage(topic, payload) {
    const text = payload ? payload.toString() : '';
    if (seen.get(topic) === text) return;
    seen.set(topic, text);
    if (topic === `${base}/epoch`) {
      gotRemoteEpoch = true;
      const ep = text.trim();
      if (ep && ep !== epoch) setEpoch(ep, true);
      return;
    }
    if (!epoch || !topic.startsWith(`${base}/e/${epoch}/`)) return;
    const rest = topic.slice(`${base}/e/${epoch}/`.length).split('/');
    if (rest[0] === 'presence') {
      if (!text) delete presence[rest[1]];
      else { try { presence[rest[1]] = JSON.parse(text); } catch { /* ignorar */ } }
      handlers.onPresence?.({ ...presence });
      return;
    }
    if (rest[0] === 'rec' && text) {
      try { handlers.onRecord?.(rest[1], JSON.parse(text)); } catch { /* mensaje inválido */ }
    }
  }

  function setEpoch(ep, fromRemote) {
    const prev = epoch;
    epoch = ep;
    presence = {};
    handlers.onPresence?.({});
    clients.forEach((c) => { if (c.connected) { subscribeEpoch(c, ep, prev); announce(c); } });
    handlers.onEpoch?.(ep, fromRemote);
  }

  function announce(c) {
    if (!epoch) return;
    c.publish(presTopic(me), JSON.stringify({ ...profile, ts: Date.now() }), { qos: 0, retain: true });
  }

  brokerList().forEach((url, i) => {
    status[url] = 'connecting';
    const c = mqtt.connect(url, {
      clientId: `${me}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      keepalive: 30,
      reconnectPeriod: 3000,
      connectTimeout: 8000,
      clean: true,
    });
    c.on('connect', () => {
      status[url] = 'connected'; emitStatus();
      c.subscribe([`${base}/epoch`], { qos: 1 });
      if (epoch) { subscribeEpoch(c, epoch); announce(c); }
      // Si el broker no conoce ninguna época (p. ej. tras reiniciarse), se anuncia la local.
      setTimeout(() => {
        if (!gotRemoteEpoch && epoch && epoch !== 'inicio' && c.connected) c.publish(`${base}/epoch`, epoch, { qos: 1, retain: true });
      }, 3000);
    });
    c.on('reconnect', () => { status[url] = 'connecting'; emitStatus(); });
    c.on('close', () => { status[url] = 'offline'; emitStatus(); });
    c.on('offline', () => { status[url] = 'offline'; emitStatus(); });
    c.on('error', () => { /* el cliente reintenta solo */ });
    c.on('message', handleMessage);
    clients.push(c);
  });
  emitStatus();

  presenceTimer = setInterval(() => clients.forEach((c) => c.connected && announce(c)), 25000);
  const onUnload = () => clients.forEach((c) => { try { c.publish(presTopic(me), '', { qos: 0, retain: true }); } catch { /* */ } });
  window.addEventListener('pagehide', onUnload);

  return {
    room,
    deviceId: me,
    // Fija la época local (sin anunciarla) — se usa al arrancar.
    useEpoch(ep) { if (ep !== epoch) setEpoch(ep, false); },
    // Inicia una época nueva para todos (reinicio de la demo compartida).
    resetEpoch(ep) {
      setEpoch(ep, false);
      clients.forEach((c) => c.publish(`${base}/epoch`, ep, { qos: 1, retain: true }));
    },
    publish(kind, key, data) {
      if (!epoch) return;
      const t = recTopic(kind, key);
      const text = JSON.stringify(data);
      seen.set(t, text);
      clients.forEach((c) => c.publish(t, text, { qos: 1, retain: true }));
    },
    setProfile(p) { profile = { ...p }; clients.forEach((c) => c.connected && announce(c)); },
    close() {
      clearInterval(presenceTimer);
      window.removeEventListener('pagehide', onUnload);
      onUnload();
      clients.forEach((c) => c.end(true));
    },
  };
}
