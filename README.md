# Lumen Office

Suite ofimática de escritorio con **Documentos** (procesador de textos tipo Word), **Notas** y **Asistente IA** local (sin APIs externas).
Hecha con **TypeScript + React + Tiptap**, empaquetada como app de escritorio con **Tauri 2**.

## Cómo ejecutarla

```bash
npm install
npm run dev          # en el navegador: http://localhost:5173
npm run tauri dev    # como app de escritorio (requiere Rust)
npm run tauri build  # genera el instalador .exe / .msi
```

Para la versión de escritorio hace falta instalar **Rust** (`winget install Rustlang.Rustup`) y las
**Visual Studio Build Tools** con la carga de trabajo "Desarrollo de escritorio con C++".

## Fases

| Fase | Contenido |
|---|---|
| 1. Base | Vite + React 19 + TypeScript estricto, Tailwind 4, Tauri 2, sistema de diseño con tokens de color |
| 2. Inicio tipo Office | Lanzador de herramientas, plantillas con miniatura, recientes con filtros, búsqueda global, Abrir/Importar, Papelera |
| 3. Documento | Cinta de opciones (Archivo, Inicio, Insertar, Diseño, Revisar, Vista, IA y Tabla contextual), hoja con tamaño y márgenes reales, saltos de página, buscar y reemplazar, menú flotante, contador de palabras, zoom, vistas de impresión/web/enfoque |
| 4. Personalización | 10 temas (claro, oscuro, medianoche, grafito, sepia, bosque, océano, rosa, lavanda, alto contraste), color de acento, 18 fuentes incluidas + fuentes del sistema, radio de esquinas, hoja blanca u oscura |
| 5. Notas | Lista con búsqueda, fijadas, favoritas, colores y etiquetas; autoguardado |
| 6. IA local | Modelo en tu equipo (WebGPU u Ollama), sin APIs. Acciones sobre la selección (mejorar, corregir, acortar, ampliar, tono, traducir, lista, tabla, resumir, continuar) con vista previa antes de aplicar; chat con el documento como contexto; asistente independiente |
| 7. Archivos | Exportar a Word (.docx), PDF (imprimir), Markdown, HTML y texto; importar .docx, .md, .html y .txt; copia de seguridad |

## Estructura

```
src/
  App.tsx                     enrutado entre Inicio, Documento, Notas y Asistente
  index.css                   tokens de diseño, estilos del editor e impresión
  lib/
    ai.ts                     acciones de IA y streaming
    localAI.ts / llm-worker.ts motor local (WebLLM en un worker) y Ollama
    localModels.ts            catálogo de modelos y estado de carga
    db.ts                     base de datos local (IndexedDB con Dexie)
    io.ts                     importar/exportar DOCX, Markdown, HTML, TXT
    fonts.ts / themes.ts      catálogo de fuentes y temas
    templates.ts              plantillas (carta, CV, informe, acta, ensayo…)
  store/                      estado global (configuración persistente y navegación)
  components/
    launcher/                 pantalla de inicio
    editor/                   editor de documentos, cinta, extensiones Tiptap
    notes/                    aplicación de notas
    ai/                       panel de chat, tarjeta de resultados y menú de acciones
    ui/                       componentes base (botones, menús, diálogos…)
src-tauri/                    proyecto de escritorio (Rust)
```

## IA local

La IA funciona **en tu propio equipo**, sin cuentas, sin claves y sin enviar texto a ningún servicio:

- **Motor integrado (WebLLM + WebGPU):** el modelo se ejecuta en la tarjeta gráfica dentro de la app.
  La primera vez se descarga desde Hugging Face y queda guardado; después funciona sin conexión.
  Modelos: Qwen 2.5 3B (recomendado), Qwen 2.5 1.5B, Llama 3.2 3B y Qwen 2.5 7B.
- **Ollama (opcional):** si tienes [Ollama](https://ollama.com) instalado, la app puede usar sus modelos
  (por ejemplo `ollama pull qwen2.5:7b`).

Se configura en **Configuración → Inteligencia artificial**, donde también se pueden borrar los modelos descargados.
Los modelos pequeños (3B) cometen algún error suelto; para mejor calidad usa Qwen 2.5 7B si tu gráfica tiene 6 GB o más.

## Datos

Todo se guarda localmente (IndexedDB). Desde **Configuración → General y datos** puedes exportar
e importar una copia de seguridad completa.
