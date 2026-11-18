# Prototipo · Plataforma de reutilización para Distrito Tec (nombre provisional)

**Demo pública:** https://siresdras01.github.io/prototipo-economia-circular/

Prototipo de demostración para el Premio FRISA 2026. Funciona en el navegador, sin cuenta ni instalación.
**En vivo:** registros, códigos y validaciones se comparten al instante entre todos los dispositivos que tengan la página abierta.
Todos los restaurantes, usuarios y cifras son **sintéticos**. No representa una alianza, contrato ni implementación con ninguna institución.

## Cómo probarlo con dos celulares
1. Celular A → **Estudiante**: regístrate con un apodo, elige una promoción, marca las dos casillas y pulsa **Generar código**.
2. Celular B → **Restaurante** → Entrar (demo) con el restaurante de esa promoción → **Escanear QR (foto)** y toma una foto del código del celular A.
3. Acepta el recipiente, confirma la sustitución y registra la venta. Si intentas usar el mismo código otra vez, se bloquea.
4. **Institución**: indicadores, embudo de evidencia y participación por establecimiento.

Al registrar la venta, el celular del alumno cambia a «Validado» y el panel institucional se actualiza en ese momento.

### Cómo funciona la sincronización
- Usa brokers MQTT públicos y gratuitos (EMQX y HiveMQ) sobre WebSocket seguro, a la vez, para tolerar la caída de uno.
- Cada registro se publica como mensaje retenido: quien abre la página después recibe el estado actual.
- **Reiniciar demo** reinicia los datos compartidos para todos.
- Sala privada para ensayar: agrega `?sala=ensayo` a la dirección.
- Si no hay conexión en vivo, la app sigue funcionando en cada teléfono y los códigos se validan por su dígito de control.

**Aviso:** los brokers públicos no garantizan disponibilidad ni privacidad. Es una demo con datos sintéticos; no escribas datos personales.

## Código fuente
En la carpeta [`codigo/`](codigo/) (React + Vite). Instrucciones en `codigo/README.md`.
