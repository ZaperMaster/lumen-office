import type { JSONContent } from "@tiptap/react";
import type { DocKind } from "@/lib/db";

/* Pequeños ayudantes para construir contenido Tiptap */
const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, ...(marks ? { marks } : {}) });
const b = (text: string) => t(text, [{ type: "bold" }]);
const i = (text: string) => t(text, [{ type: "italic" }]);
const p = (...parts: (string | JSONContent)[]): JSONContent => {
  // ProseMirror no admite nodos de texto vacíos
  const c = parts.filter((x) => x !== "");
  return { type: "paragraph", content: c.length ? c.map((x) => (typeof x === "string" ? t(x) : x)) : undefined };
};
const pa = (align: string, ...c: (string | JSONContent)[]): JSONContent => ({ ...p(...c), attrs: { textAlign: align } });
const h = (level: number, text: string, align?: string): JSONContent => ({
  type: "heading",
  attrs: { level, ...(align ? { textAlign: align } : {}) },
  content: [t(text)],
});
const ul = (...items: (string | JSONContent)[]): JSONContent => ({
  type: "bulletList",
  content: items.map((x) => ({ type: "listItem", content: [p(x)] })),
});
const ol = (...items: string[]): JSONContent => ({
  type: "orderedList",
  attrs: { start: 1 },
  content: items.map((x) => ({ type: "listItem", content: [p(x)] })),
});
const tasks = (...items: [string, boolean?][]): JSONContent => ({
  type: "taskList",
  content: items.map(([x, done]) => ({ type: "taskItem", attrs: { checked: !!done }, content: [p(x)] })),
});
const hr = (): JSONContent => ({ type: "horizontalRule" });
const quote = (text: string): JSONContent => ({ type: "blockquote", content: [p(text)] });
const table = (rows: string[][]): JSONContent => ({
  type: "table",
  content: rows.map((r, ri) => ({
    type: "tableRow",
    content: r.map((c) => ({ type: ri === 0 ? "tableHeader" : "tableCell", content: [p(...(c ? [c] : []))] })),
  })),
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

const today = () =>
  new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export interface Template {
  id: string;
  name: string;
  description: string;
  kind: DocKind;
  /** Colores de la miniatura */
  tint: string;
  build: () => { title: string; content: JSONContent };
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Documento en blanco",
    description: "Empieza desde cero",
    kind: "document",
    tint: "#ffffff",
    build: () => ({ title: "", content: doc(p()) }),
  },
  {
    id: "letter",
    name: "Carta formal",
    description: "Remitente, destinatario y firma",
    kind: "document",
    tint: "#eef4ff",
    build: () => ({
      title: "Carta formal",
      content: doc(
        pa("right", b("Tu nombre")),
        pa("right", "Dirección · Ciudad"),
        pa("right", "correo@ejemplo.com · +34 600 000 000"),
        p(),
        p(today()),
        p(),
        p(b("Nombre del destinatario")),
        p("Cargo · Empresa"),
        p("Dirección"),
        p(),
        p("Estimado/a Sr./Sra.:"),
        p("Escribo para … Explica aquí el motivo principal de la carta de forma clara y directa."),
        p("En el segundo párrafo aporta los detalles, datos o argumentos que respaldan tu petición."),
        p("Quedo a su disposición para cualquier aclaración. Agradezco de antemano su atención."),
        p(),
        p("Atentamente,"),
        p(),
        p(b("Tu nombre")),
      ),
    }),
  },
  {
    id: "resume",
    name: "Currículum",
    description: "CV moderno con secciones",
    kind: "document",
    tint: "#f0f9f4",
    build: () => ({
      title: "Currículum",
      content: doc(
        h(1, "Nombre Apellido"),
        p(i("Puesto o perfil profesional")),
        p("📧 correo@ejemplo.com · 📱 +34 600 000 000 · 📍 Ciudad · 🔗 linkedin.com/in/usuario"),
        hr(),
        h(2, "Perfil"),
        p("Resumen de 2–3 líneas con tu experiencia, especialidad y lo que aportas."),
        h(2, "Experiencia"),
        h(3, "Cargo — Empresa"),
        p(i("Ene 2023 – Actualidad · Ciudad")),
        ul("Logro medible con impacto (p. ej. aumenté X un 30 %).", "Responsabilidad clave o proyecto destacado.", "Herramientas o metodologías utilizadas."),
        h(3, "Cargo anterior — Empresa"),
        p(i("2020 – 2022")),
        ul("Logro o responsabilidad principal.", "Otro logro relevante."),
        h(2, "Formación"),
        p(b("Título"), " — Universidad · 2016–2020"),
        h(2, "Habilidades"),
        ul("Habilidad técnica · Habilidad técnica · Habilidad técnica", "Idiomas: Español (nativo), Inglés (C1)"),
      ),
    }),
  },
  {
    id: "report",
    name: "Informe",
    description: "Portada, índice y conclusiones",
    kind: "document",
    tint: "#fff6e9",
    build: () => ({
      title: "Informe",
      content: doc(
        h(1, "Título del informe", "center"),
        pa("center", i("Subtítulo o área")),
        pa("center", today()),
        { type: "pageBreak" },
        h(2, "Resumen ejecutivo"),
        p("Síntesis de los hallazgos principales y las recomendaciones en un párrafo."),
        h(2, "1. Introducción"),
        p("Contexto, objetivos y alcance del informe."),
        h(2, "2. Metodología"),
        p("Cómo se obtuvieron y analizaron los datos."),
        h(2, "3. Resultados"),
        table([
          ["Indicador", "Valor", "Variación"],
          ["Ventas", "120.000 €", "+12 %"],
          ["Clientes", "1.450", "+8 %"],
          ["Satisfacción", "4,6 / 5", "+0,3"],
        ]),
        h(2, "4. Conclusiones y recomendaciones"),
        ol("Primera recomendación.", "Segunda recomendación.", "Siguientes pasos."),
      ),
    }),
  },
  {
    id: "meeting",
    name: "Acta de reunión",
    description: "Asistentes, puntos y acuerdos",
    kind: "document",
    tint: "#f3efff",
    build: () => ({
      title: "Acta de reunión",
      content: doc(
        h(1, "Acta de reunión"),
        p(b("Fecha: "), today()),
        p(b("Asistentes: "), "Nombre, Nombre, Nombre"),
        p(b("Objetivo: "), "…"),
        h(2, "Orden del día"),
        ol("Punto 1", "Punto 2", "Punto 3"),
        h(2, "Notas"),
        p(),
        h(2, "Acuerdos y tareas"),
        tasks(["Tarea — Responsable — Fecha"], ["Tarea — Responsable — Fecha"]),
      ),
    }),
  },
  {
    id: "essay",
    name: "Ensayo",
    description: "Formato académico",
    kind: "document",
    tint: "#fbf3ea",
    build: () => ({
      title: "Ensayo",
      content: doc(
        h(1, "Título del ensayo", "center"),
        pa("center", "Autor · Asignatura · ", today()),
        hr(),
        h(2, "Introducción"),
        p("Presenta el tema y tu tesis principal."),
        h(2, "Desarrollo"),
        p("Argumento 1 con evidencias."),
        quote("Una cita relevante que apoye tu argumento. — Autor"),
        p("Argumento 2 y contraargumentos."),
        h(2, "Conclusión"),
        p("Retoma la tesis y cierra con una reflexión."),
        h(2, "Referencias"),
        p("Apellido, N. (Año). ", i("Título de la obra"), ". Editorial."),
      ),
    }),
  },
  {
    id: "todo",
    name: "Lista de tareas",
    description: "Checklist para el día",
    kind: "note",
    tint: "#eafaf3",
    build: () => ({
      title: "Tareas",
      content: doc(
        h(2, "Hoy"),
        tasks(["Tarea importante"], ["Otra tarea"], ["Algo ya hecho", true]),
        h(2, "Esta semana"),
        tasks(["Pendiente"]),
      ),
    }),
  },
  {
    id: "journal",
    name: "Diario",
    description: "Entrada diaria",
    kind: "note",
    tint: "#fff1f4",
    build: () => ({
      title: `Diario — ${new Date().toLocaleDateString("es-ES")}`,
      content: doc(
        h(2, today()),
        p(b("Cómo me siento: ")),
        p(b("Tres cosas por las que estoy agradecido/a:")),
        ol("", "", ""),
        p(b("Lo más importante de hoy:")),
        p(),
      ),
    }),
  },
];
