# Lumen Office

Suite ofimática de escritorio para Windows con **Documentos** (procesador de textos tipo Word), **Notas** y un
**Asistente de IA** que puede funcionar por completo en tu equipo.
Hecha con **TypeScript + React + Tiptap** y empaquetada como app de escritorio con **Tauri 2**.

**Descargar:** [última versión](https://github.com/ZaperMaster/lumen-office/releases/latest) → `Lumen.Office_x.y.z_x64-setup.exe`.
Una vez instalada, la app se actualiza sola.

## Qué incluye

**Inicio tipo Office**
- Elegir herramienta (Documento, Notas, Asistente IA), plantillas con miniatura, recientes, búsqueda y papelera.

**Documentos**
- Cinta de opciones: Archivo, Inicio, Insertar, Diseño, Revisar, Vista, IA y la pestaña contextual Tabla.
- Hoja con tamaño, márgenes y orientación reales; saltos de página; vistas de impresión, web y enfoque; zoom.
- Fuentes, tamaños, colores, resaltado, estilos, listas, tareas, tablas, citas y código.
- **Imágenes editables**: tamaño con tiradores, texto alrededor (izquierda/derecha) o centradas, mover arrastrando,
  recortar, girar, voltear y texto alternativo.
- **Vínculos**: Ctrl+clic para abrirlos y menú para abrir, editar, copiar o quitar.
- Buscar y reemplazar, contador de palabras y menú flotante sobre la selección.

**Archivos, como en Word**
- **Guardar** (Ctrl+S) reemplaza el archivo vinculado; **Guardar como** (F12) elige carpeta, nombre y formato.
- **Exportar una copia** a Word (.docx), Lumen (.lumen, sin pérdidas), Markdown, HTML, texto o PDF (imprimir).
- **Abrir archivo** (Ctrl+O): .docx, .lumen, .md, .html y .txt.
- **Autoguardado en el archivo** y aviso **Guardar / No guardar / Cancelar** al salir o cerrar con cambios pendientes.

**Notas**
- Búsqueda, colores, etiquetas, fijadas, favoritas y guardado automático.

**Personalización**
- 10 temas (claro, oscuro, medianoche, grafito, sepia, bosque, océano, rosa, lavanda, alto contraste), color de acento,
  18 fuentes incluidas más las del sistema, esquinas y hoja blanca u oscura.
- Ventana con barra de título integrada en el diseño de la app.

## IA

Se elige en **Configuración → Inteligencia artificial**:

| Motor | Dónde se ejecuta | Notas |
|---|---|---|
| **Integrado** (WebLLM + WebGPU) | En tu tarjeta gráfica | Sin conexión y sin enviar nada. El modelo se descarga una vez (por defecto Qwen 2.5 1.5B, ~0,9 GB, licencia Apache 2.0). Todos los modelos ofrecidos permiten el uso comercial (Apache 2.0 o Llama 3.2 Community License, «Built with Llama»); la licencia se indica al elegirlo. |
| **Ollama** | En tu equipo | Usa los modelos instalados con [Ollama](https://ollama.com). |
| **Tu propia API** | En el servicio que elijas | OpenAI, OpenRouter, Groq, DeepSeek, Mistral, LM Studio o Anthropic. El texto se envía a ese servicio. |

Acciones sobre la selección (mejorar, corregir, acortar, ampliar, tono, traducir, lista, tabla, resumir, continuar) con
vista previa antes de aplicar, y chat con el documento como contexto.

**Memoria:** con la IA local en uso, el modelo ocupa unos 2,5–3 GB. Por defecto se libera solo tras 5 minutos sin
usarlo; se puede desactivar para que responda más rápido. Sin el modelo cargado, la app ocupa unos 350 MB.

## Desarrollo

```bash
npm install
npm run dev          # en el navegador: http://localhost:5173
npm run tauri dev    # como app de escritorio
npm run tauri build  # instaladores en src-tauri/target/release/bundle
```

Requisitos: Node.js 20+, Rust (`winget install Rustlang.Rustup`) y Visual Studio Build Tools con
«Desarrollo de escritorio con C++».

### Publicar una versión

1. Sube la versión en `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (y «Acerca de»).
2. Escribe las novedades en un archivo, por ejemplo `notas.md`.
3. Ejecuta:

```bash
npm run release -- --notes notas.md
```

El script compila los instaladores **firmados**, genera `latest.json` y crea la Release en GitHub. Las apps instaladas
la detectan solas. Con `--dry-run` compila y genera `latest.json` sin publicar.

La firma usa la clave privada de `%USERPROFILE%\.tauri\lumen-office.key` (y su contraseña en
`lumen-office.key.password`). **No la subas nunca al repositorio y guarda una copia de seguridad**: sin ella no se
pueden publicar actualizaciones que las apps instaladas acepten.

### Estructura

```
src/
  App.tsx                      enrutado, avisos, cierre seguro y actualizaciones
  lib/
    files.ts / closeGuard.ts   guardar, abrir, exportar, autoguardado y aviso al cerrar
    io.ts                      conversión DOCX, Markdown, HTML, TXT y .lumen
    ai.ts                      acciones de IA y elección de motor
    localAI.ts / llm-worker.ts motor local (WebLLM en un worker)
    remoteAI.ts                Ollama y APIs (OpenAI-compatible y Anthropic)
    updater.ts                 actualizaciones automáticas
    db.ts                      base de datos local (IndexedDB con Dexie)
  components/
    launcher/  editor/  notes/  ai/  ui/
scripts/release.mjs            publicación de versiones
src-tauri/                     app de escritorio (Rust)
```

## Datos y privacidad

Documentos, notas y ajustes se guardan en tu equipo. La app solo puede escribir en las carpetas que elijas en la
ventana de Windows. Desde **Configuración → General y datos** se puede exportar e importar una copia de seguridad.

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE) © 2026 Alejandro Zapata.

Puedes usar, copiar y modificar Lumen Office **gratis para fines no comerciales** (uso personal, estudio,
organizaciones sin ánimo de lucro…). **No está permitido venderla ni usarla para obtener beneficio comercial.**
Para un uso comercial hace falta un permiso del autor.
