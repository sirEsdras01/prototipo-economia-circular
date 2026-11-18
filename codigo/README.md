# Prototipo · Plataforma de reutilización para Distrito Tec

> Nombre provisional. Prototipo de demostración para conversación con expertos.
> Todos los restaurantes, usuarios, promociones y cifras son **sintéticos**.
> No representa una alianza, contrato ni implementación con ninguna institución.

## Abrirlo sin instalar nada (recomendado para la reunión)

Abre `dist-demo/index.html` con doble clic en Chrome, Edge o Safari.
Es un único archivo autocontenido: no necesita internet, servidor ni instalación.

## Versión publicada (celular)

https://claude.ai/artifact/HYpt99MBp8SeaLwQpbnfTe — privada hasta que su dueño la comparta desde claude.ai.

- **Escanear QR (foto):** en el perfil Restaurante abre la cámara del teléfono; se toma una foto del código y se lee en el propio navegador.
- **Dos teléfonos:** los códigos son autoverificables (letra de promoción + dígito de control), así que un teléfono puede validar el código generado en otro sin servidor. El estado no se sincroniza: el comprobante aparece en el teléfono del restaurante.

## Ejecutarlo en modo desarrollo

Requisitos: Node.js 18 o superior.

```bash
cd prototipo-economia-circular
npm install
npm run dev          # abre http://localhost:5173
```

Otros comandos:

```bash
npm run build        # build estándar en dist/
npm run build:demo   # regenera dist-demo/index.html (archivo único)
npm run preview      # sirve dist/ localmente
```

Para usarlo desde un celular en la misma red Wi‑Fi: `npm run dev` y abre en el teléfono la dirección "Network" que imprime Vite.
Ten en cuenta que los datos se guardan por navegador: el celular y la laptop no comparten estado.

## Recorrido de demostración (3–4 minutos)

1. **Estudiante** → Inicio → "Comida corrida del día" → marca las dos casillas de compromiso → **Generar código**.
2. Cambia a **Restaurante** (barra superior) → Entrar (demo) con Cocina Ceiba → en *Validar compra* pulsa **Escanear QR (foto)**, usa el atajo con el último código o escríbelo.
3. Responde: recipiente aceptado → sustitución confirmada → **Registrar venta**.
4. Intenta validar el mismo código otra vez: se bloquea como duplicado.
5. Regresa a **Estudiante → Mi código**: aparece "Validado" con el recibo.
6. **Contingencia**: genera otro código, pulsa **En línea** (arriba) para simular una falla. En el restaurante registra la operación: queda *pendiente* con folio. Vuelve a poner **En línea** y pulsa **Sincronizar ahora**.
7. **Institución**: indicadores, embudo de evidencia, participación por establecimiento y descarga de reportes CSV.

Consejo: abre dos pestañas del mismo navegador (estudiante y restaurante) lado a lado; el estado se sincroniza entre pestañas.
**Reiniciar demo** restablece los datos sintéticos.

## Qué está implementado

| Perfil | Funciones |
|---|---|
| Estudiante | Inicio con recordatorio de hábito, catálogo con filtros y búsqueda, detalle con precio original/descuento/final, condiciones, cupo y compromiso explícito; código QR único con vigencia de 30 min y estados (pendiente, validado, vencido, cancelado); historial; "Mi impacto" con metodología y recordatorios |
| Restaurante | Acceso demostrativo con PIN, validación por cámara (si el navegador soporta `BarcodeDetector`) o manual, confirmación del recipiente y de la sustitución, registro de venta con comisión del 2 %, bloqueo de duplicados, modo contingencia con folio y sincronización, alta/edición/pausa de promociones con verificación de margen, historial exportable, simulador de contribución |
| Institución | Usuarios registrados y activos, restaurantes participantes, compras verificadas, sustituciones confirmadas, embudo intención→evidencia, evolución semanal, participación por establecimiento, indicadores comerciales, calidad de datos, reportes CSV de demostración |

## Qué NO está implementado (y no debe afirmarse)

- No hay servidor, base de datos, cuentas reales ni autenticación segura.
- El "modo contingencia" es una simulación local: no hay sincronización offline segura entre dispositivos.
- La prevención de duplicados funciona dentro de este navegador; no es un sistema antifraude.
- Los recordatorios se muestran dentro de la app; no se envían notificaciones.
- No se estiman emisiones de CO₂.
- El costo de pago ($4) y de empaque ($2) del simulador son supuestos ilustrativos editables.

## Estructura

```
src/
  App.jsx                    Barra de perfil, simulación de conexión, recorrido guiado
  lib/store.jsx              Estado (reducer), persistencia local, reglas anti-duplicado y sincronización
  lib/seed.js                Datos sintéticos reproducibles
  lib/utils.js               Formato, identificadores, modelo de contribución
  components/ui.jsx          Componentes reutilizables (íconos, badges, QR, gráficos)
  student/StudentApp.jsx     Experiencia del estudiante
  restaurant/RestaurantApp.jsx  Panel del restaurante
  institution/InstitutionApp.jsx Panel institucional
  styles.css                 Sistema visual
```

Pila: React 18 + Vite 5, `qrcode` para generar QR, Inter empaquetada localmente (sin servicios externos).
