# Prototipo · Plataforma de reutilización para Distrito Tec (nombre provisional)

**Demo pública:** https://siresdras01.github.io/prototipo-economia-circular/

Prototipo de demostración para el Premio FRISA 2026. Funciona en el navegador, sin servidor ni cuenta.
Todos los restaurantes, usuarios y cifras son **sintéticos**. No representa una alianza, contrato ni implementación con ninguna institución.

## Cómo probarlo con dos celulares
1. Celular A → **Estudiante**: elige una promoción, marca las dos casillas y pulsa **Generar código**.
2. Celular B → **Restaurante** → Entrar (demo) con el restaurante de esa promoción → **Escanear QR (foto)** y toma una foto del código del celular A.
3. Acepta el recipiente, confirma la sustitución y registra la venta. Si intentas usar el mismo código otra vez, se bloquea.
4. **Institución**: indicadores, embudo de evidencia y participación por establecimiento.

Cada celular guarda sus propios datos (no hay servidor). Los códigos llevan un dígito de control, por eso un teléfono puede validar el código generado en otro.

## Código fuente
En la carpeta [`codigo/`](codigo/) (React + Vite). Instrucciones en `codigo/README.md`.
