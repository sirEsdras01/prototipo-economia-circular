# Módulo de impacto ambiental · RePack

## 1. Resumen
Se añadió a RePack un módulo para medir y mostrar el impacto ambiental de reutilizar recipientes. La métrica principal es **recipientes desechables sustituidos**, confirmados por el restaurante. Se integra en los flujos existentes:
- validación del restaurante;
- «Mi impacto» del estudiante;
- panel institucional;
- sincronización en vivo.

## 2. Arquitectura encontrada (auditoría)
| Elemento | Situación |
|---|---|
| Framework | React 18 + Vite 5 (SPA), publicada en GitHub Pages |
| Persistencia | Estado en `localStorage` por dispositivo + registros compartidos como mensajes MQTT retenidos (`src/lib/sync.js`) |
| Autenticación | No existe. Hay perfiles de demostración: estudiante con alias y restaurante con PIN de demo |
| Base de datos / ORM / servidor | No existen |
| Transacciones | `state.transactions` (`src/lib/store.jsx`). Una compra queda completada en la acción `VALIDATE`, con estado `verificada` |
| Uso de recipiente propio | Ya existía: `containerAccepted` |
| Sustitución | Ya existía como sí/no (`substitution`), sin cantidad ni tipo de envase |
| Estados | `verificada`, `rechazada`, `pendiente`, `duplicada`; se añade `revertida` |

**Decisión:** el encargo prohíbe cambiar la arquitectura, la base de datos y la autenticación. Por eso el módulo usa la persistencia existente y no agrega un backend. Las limitaciones de esta decisión están en la sección 9.

## 3. Cambios en el modelo de datos (aditivos)
Se añadieron campos nuevos a la transacción, sin tablas duplicadas:
- `substitutedCount`: entero de 0 a 10, validado en el reducer.
- `packagingTypeId`: tipo de envase sustituido.
- `packagingRef`: copia auditable del peso de referencia vigente al validar (tipo, gramos, fuente, fecha y versión).
- `validatedAt`.
- `audit[]`: quién, qué y cuándo.
- `revertedAt`.
- `substitution` admite ahora `indeterminado` («No se puede determinar»).

Se añadió el catálogo `packagingRefs` (tipo, peso en gramos, fuente, fecha de medición, vigencia, observaciones, versión e historial):
- Se comparte entre dispositivos como el resto de los registros.
- **Ningún peso viene precargado.**

**Migración:** el estado guardado en la versión 4 se lee y se pasa a la versión 5 conservando todos los registros. No se borra nada. Los registros anteriores con «sí» y sin cantidad se interpretan como 1 recipiente y se marcan como *cantidad heredada* (información incompleta).

## 4. Reglas de cálculo (`src/lib/impact.js`)
- **Compras con recipiente reutilizable:** estado `verificada` y `containerAccepted`.
- **Recipientes sustituidos:** suma de `substitutedCount` solo cuando `substitution = confirmada`.
  - «No» y «No se puede determinar» suman 0.
  - Pendientes, rechazadas, duplicadas y revertidas no cuentan.
- **Masa estimada (kg):** Σ(recipientes × gramos de la copia guardada en la transacción) / 1000.
  - Sin un peso verificado la masa se muestra como **Pendiente**, nunca como 0.
  - Si solo una parte de los recipientes tiene peso, se indica la cobertura (p. ej., «estimado sobre 2 de 10»).
- **Ahorro:** suma de descuentos de las compras con recipiente reutilizable. Se muestra aparte del impacto ambiental.
- **CO₂e:** no se calcula. `emissionsEstimate()` queda preparado y devuelve `available: false` con el motivo.
- **Hitos:** 1, 5, 10, 25, 50 y 100 recipientes. Se basan solo en sustituciones confirmadas.
- **Idempotencia:**
  - un código no se valida dos veces;
  - una reversión se aplica una sola vez;
  - cada registro se identifica por id y la última versión gana (`updatedAt`).

## 5. Interfaz
- **Restaurante → Validar compra:**
  1. ¿Se utilizó un recipiente reutilizable propio?
  2. ¿Se evitó entregar un desechable? (Sí / No / No se puede determinar)
  3. Si la respuesta es sí: cantidad (selector 1–10) y tipo de envase.
- **Restaurante → Historial:** columna de recipientes sustituidos y acción **Revertir**, con motivo y registro de auditoría.
- **Estudiante → Mi impacto:**
  - titular editorial e indicador principal;
  - progreso hacia el siguiente hito;
  - filtros de 7 días, 30 días, 90 días e histórico;
  - indicadores secundarios: compras con topper, masa, ahorro y participación del mes;
  - gráfico interactivo (tocar una barra);
  - historial con estados confirmada, pendiente y sin sustitución;
  - sección «¿Cómo calculamos tu impacto?» con los pesos usados y su fuente;
  - estados de carga, vacío, sin conexión y pendiente.
- **Estudiante → Inicio:** acceso destacado al impacto.
- **Estudiante → Pantalla del código:**
  - «¡Tu elección cuenta!», con el acumulado y el hito alcanzado;
  - si no se confirmó, «Compra registrada…» sin mostrar impacto.
- **Institución → Impacto ambiental colectivo:**
  - solo datos agregados;
  - filtros por periodo y por establecimiento, y opción de incluir o excluir datos sintéticos;
  - indicadores: recipientes sustituidos, compras con topper, masa, % con sustitución confirmada, participantes, recurrentes, restaurantes activos e información incompleta;
  - evolución semanal y mensual;
  - exportación a CSV con periodo, metodología y fecha de generación;
  - editor de **referencias de envases** con versiones.
- **Privacidad:** la actividad en vivo del panel institucional y los avisos ya no muestran nombres de estudiantes.

## 6. Archivos
- **Creados:**
  - `src/lib/impact.js`
  - `src/lib/impact.test.js`
  - `src/assets/repack-logo.png`
  - `src/assets/repack-icon.png`
  - `public/favicon.png`
  - `IMPACTO_AMBIENTAL.md`
- **Modificados:**
  - `src/lib/store.jsx`
  - `src/lib/seed.js`
  - `src/restaurant/RestaurantApp.jsx`
  - `src/student/StudentApp.jsx`
  - `src/institution/InstitutionApp.jsx`
  - `src/components/ui.jsx`
  - `src/App.jsx`
  - `src/styles.css`
  - `index.html`
  - `package.json` (se añade `vitest` y el script `test`)

## 7. Pruebas
`npm test` ejecuta 20 pruebas automatizadas (Vitest) sobre las reglas de cálculo y el reducer. Cubren los casos 1–13 del encargo:
- sin compras;
- primera sustitución;
- topper sin sustitución;
- compra cancelada o pendiente;
- QR duplicado;
- varias sustituciones en una compra;
- reversión;
- historial acumulado;
- rangos de fechas;
- peso no configurado y versionado;
- aislamiento por usuario;
- agregado institucional;
- actualización tras una compra y tras sincronizar.

Además se probaron flujos completos en navegador (Chromium, móvil de 390 px y escritorio), con varios dispositivos sincronizados mediante un broker MQTT local:
- registro;
- compra;
- validación con 2 recipientes;
- hito de 10;
- reversión reflejada en el estudiante y en la institución;
- modo contingencia;
- duplicados entre dispositivos;
- regresión del flujo anterior (casos 14 y 15).

## 8. Uso
- **Demostración:**
  1. Entrar como estudiante con el perfil «Ana» (8 recipientes sustituidos, datos sintéticos).
  2. Generar un código.
  3. En otro teléfono, validarlo como Cocina Ceiba con «Sí, se evitó» y 2 recipientes.
  4. Ana llega a 10 y alcanza el hito.
- **Masa:** en Institución → «Referencias de envases», capturar el peso medido de un tipo de envase **con su fuente**. Las compras validadas después de capturarlo muestran masa estimada.
- **Sala privada de ensayo:** agregar `?sala=ensayo` a la dirección.

No se requieren variables de entorno.

## 9. Limitaciones conocidas
- **No hay servidor ni autenticación.** La «validación de servidor» se aplica en el reducer de cada cliente, y cualquiera con la página puede abrir el perfil Restaurante o Institución. No es apto para datos reales.
- **Los cálculos se hacen en cada navegador** a partir de los registros persistentes, porque no existe un backend. Con miles de registros convendría agregarlos en un servidor.
- **Los brokers MQTT públicos** no garantizan disponibilidad ni privacidad.
- **Los datos sintéticos** se generan en cada dispositivo y no se publican. El panel institucional permite excluirlos.

## 10. Despliegue seguro (para un piloto real)
1. Implementar un backend con base de datos y autenticación de restaurantes e instituciones, con autorización por rol.
2. Llevar las reglas de `impact.js` y del reducer a ese servidor como única fuente de verdad, con agregaciones en base de datos.
3. Reemplazar los brokers públicos por un canal propio autenticado.
4. Separar los entornos de demostración y producción, sin datos sintéticos en producción.
5. Publicar un aviso de privacidad y obtener consentimiento.
6. Configurar pesos de referencia solo con mediciones documentadas.
7. Contratar un análisis de ciclo de vida antes de mostrar CO₂e.
