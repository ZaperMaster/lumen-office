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
    id: "cover",
    name: "Carta de presentación",
    description: "Para acompañar el currículum",
    kind: "document",
    tint: "#eaf6ff",
    build: () => ({
      title: "Carta de presentación",
      content: doc(
        p(b("Tu nombre")),
        p("correo@ejemplo.com · +34 600 000 000 · Ciudad"),
        p(),
        p(today()),
        p(),
        p("A la atención del equipo de selección de ", b("Empresa")),
        p(),
        p("Estimado/a responsable de selección:"),
        p("Me dirijo a ustedes para presentar mi candidatura al puesto de ", b("Nombre del puesto"), ", publicado en … Cuento con X años de experiencia en …"),
        p("En mi puesto actual en ", b("Empresa"), " he conseguido … (un logro concreto con cifras). Esa experiencia encaja con lo que buscan porque …"),
        p("Me motiva especialmente formar parte de su equipo por … Estaré encantado/a de ampliar esta información en una entrevista."),
        p(),
        p("Un cordial saludo,"),
        p(),
        p(b("Tu nombre")),
      ),
    }),
  },
  {
    id: "proposal",
    name: "Propuesta comercial",
    description: "Servicios, plazos y presupuesto",
    kind: "document",
    tint: "#eefbf3",
    build: () => ({
      title: "Propuesta comercial",
      content: doc(
        h(1, "Propuesta para Nombre del cliente"),
        p(i("Preparada por Tu empresa · "), i(today())),
        hr(),
        h(2, "1. Entendemos lo que necesitas"),
        p("Resume en pocas líneas la situación del cliente y el objetivo que quiere conseguir."),
        h(2, "2. Nuestra propuesta"),
        ul("Servicio o entregable principal.", "Segundo entregable.", "Soporte y seguimiento."),
        h(2, "3. Calendario"),
        table([
          ["Fase", "Descripción", "Duración"],
          ["1", "Análisis y planificación", "1 semana"],
          ["2", "Desarrollo", "3 semanas"],
          ["3", "Entrega y formación", "1 semana"],
        ]),
        h(2, "4. Presupuesto"),
        table([
          ["Concepto", "Importe"],
          ["Fase 1", "800 €"],
          ["Fase 2", "2.400 €"],
          ["Fase 3", "600 €"],
          ["Total (IVA no incluido)", "3.800 €"],
        ]),
        h(2, "5. Condiciones"),
        p("Forma de pago, validez de la oferta (30 días) y siguientes pasos para empezar."),
      ),
    }),
  },
  {
    id: "invoice-doc",
    name: "Factura",
    description: "Datos fiscales, conceptos e IVA",
    kind: "document",
    tint: "#f4f1ff",
    build: () => ({
      title: "Factura",
      content: doc(
        h(1, "FACTURA"),
        p(b("Nº: "), "2026-001", "   ·   ", b("Fecha: "), new Date().toLocaleDateString("es-ES")),
        hr(),
        table([
          ["Emisor", "Cliente"],
          ["Tu nombre o empresa · NIF", "Nombre del cliente · NIF"],
          ["Dirección", "Dirección"],
        ]),
        p(),
        table([
          ["Descripción", "Cantidad", "Precio", "Importe"],
          ["Servicio 1", "1", "500,00 €", "500,00 €"],
          ["Servicio 2", "2", "150,00 €", "300,00 €"],
          ["", "", "Base imponible", "800,00 €"],
          ["", "", "IVA (21 %)", "168,00 €"],
          ["", "", "TOTAL", "968,00 €"],
        ]),
        p(),
        p(b("Forma de pago: "), "transferencia a ES00 0000 0000 0000 0000 0000"),
        p(i("Para cálculos automáticos, usa la plantilla de factura de las hojas de cálculo.")),
      ),
    }),
  },
  {
    id: "project-plan",
    name: "Plan de proyecto",
    description: "Objetivos, tareas y riesgos",
    kind: "document",
    tint: "#fff4e6",
    build: () => ({
      title: "Plan de proyecto",
      content: doc(
        h(1, "Plan de proyecto: Nombre"),
        p(b("Responsable: "), "Nombre", "   ·   ", b("Inicio: "), new Date().toLocaleDateString("es-ES")),
        h(2, "Objetivo"),
        p("Qué queremos conseguir y cómo sabremos que lo hemos logrado."),
        h(2, "Alcance"),
        ul("Incluye: …", "No incluye: …"),
        h(2, "Tareas"),
        tasks(["Definir requisitos"], ["Diseño"], ["Desarrollo"], ["Pruebas"], ["Lanzamiento"]),
        h(2, "Hitos"),
        table([
          ["Hito", "Fecha", "Estado"],
          ["Requisitos aprobados", "", "Pendiente"],
          ["Primera versión", "", "Pendiente"],
          ["Lanzamiento", "", "Pendiente"],
        ]),
        h(2, "Riesgos"),
        table([
          ["Riesgo", "Probabilidad", "Plan"],
          ["Retrasos", "Media", "Revisar el calendario cada semana"],
        ]),
      ),
    }),
  },
  {
    id: "newsletter",
    name: "Boletín",
    description: "Noticias para tu equipo o clientes",
    kind: "document",
    tint: "#ffeef0",
    build: () => ({
      title: "Boletín",
      content: doc(
        h(1, "Boletín de noticias", "center"),
        pa("center", i(`Número 1 · ${today()}`)),
        hr(),
        h(2, "Lo más destacado"),
        p("Un párrafo con la noticia principal del mes."),
        quote("«Una frase destacada o un testimonio.»"),
        h(2, "Novedades"),
        ul("Novedad 1: breve explicación.", "Novedad 2: breve explicación.", "Novedad 3: breve explicación."),
        h(2, "Agenda"),
        table([
          ["Fecha", "Evento"],
          ["", "Reunión general"],
          ["", "Presentación de resultados"],
        ]),
        h(2, "Contacto"),
        p("Escríbenos a correo@ejemplo.com"),
      ),
    }),
  },
  {
    id: "certificate",
    name: "Diploma",
    description: "Certificado de reconocimiento",
    kind: "document",
    tint: "#fff9e6",
    build: () => ({
      title: "Diploma",
      content: doc(
        p(),
        p(),
        h(1, "DIPLOMA", "center"),
        pa("center", i("se concede a")),
        p(),
        h(2, "Nombre de la persona", "center"),
        p(),
        pa("center", "por su excelente participación en ", b("Nombre del curso o evento")),
        pa("center", today()),
        p(),
        p(),
        pa("center", "______________________"),
        pa("center", "Firma"),
      ),
    }),
  },
  {
    id: "recipe",
    name: "Receta",
    description: "Ingredientes y pasos",
    kind: "document",
    tint: "#fff1e8",
    build: () => ({
      title: "Receta",
      content: doc(
        h(1, "Nombre de la receta"),
        p(b("Raciones: "), "4", "   ·   ", b("Tiempo: "), "45 min", "   ·   ", b("Dificultad: "), "Fácil"),
        h(2, "Ingredientes"),
        tasks(["200 g de …"], ["2 unidades de …"], ["Sal y pimienta"]),
        h(2, "Preparación"),
        ol("Primer paso.", "Segundo paso.", "Tercer paso.", "Emplatar y servir."),
        h(2, "Consejos"),
        p("Variaciones, cómo conservarla o con qué acompañarla."),
      ),
    }),
  },
  {
    id: "class-notes",
    name: "Apuntes de clase",
    description: "Conceptos, ejemplos y resumen",
    kind: "document",
    tint: "#eef6ff",
    build: () => ({
      title: "Apuntes",
      content: doc(
        h(1, "Tema: …"),
        p(b("Asignatura: "), "…", "   ·   ", b("Fecha: "), new Date().toLocaleDateString("es-ES")),
        h(2, "Conceptos clave"),
        ul(b("Concepto 1: ") , b("Concepto 2: ")),
        h(2, "Explicación"),
        p("Desarrollo del tema con tus palabras."),
        h(2, "Ejemplo"),
        { type: "codeBlock", content: [t("Ejemplo, fórmula o código")] },
        h(2, "Resumen"),
        quote("Lo más importante en una frase."),
        h(2, "Dudas para preguntar"),
        tasks(["…"]),
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
  {
    id: "shopping",
    name: "Lista de la compra",
    description: "Por secciones del súper",
    kind: "note",
    tint: "#effbea",
    build: () => ({
      title: "Lista de la compra",
      content: doc(
        h(2, "Fruta y verdura"),
        tasks([""], [""]),
        h(2, "Despensa"),
        tasks([""], [""]),
        h(2, "Frescos"),
        tasks([""]),
        h(2, "Limpieza"),
        tasks([""]),
      ),
    }),
  },
  {
    id: "ideas",
    name: "Lluvia de ideas",
    description: "Ideas, pros y contras",
    kind: "note",
    tint: "#fff8e1",
    build: () => ({
      title: "Ideas",
      content: doc(
        h(2, "Pregunta o problema"),
        p(),
        h(2, "Ideas"),
        ul("", "", ""),
        h(2, "La mejor idea"),
        p(b("Pros: ")),
        p(b("Contras: ")),
        p(b("Siguiente paso: ")),
      ),
    }),
  },
  {
    id: "week",
    name: "Plan semanal",
    description: "Objetivos y tareas por día",
    kind: "note",
    tint: "#eef1ff",
    build: () => ({
      title: "Plan de la semana",
      content: doc(
        h(2, "Objetivos de la semana"),
        tasks([""], [""], [""]),
        ...["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Fin de semana"].flatMap((d) => [h(3, d), tasks([""])]),
      ),
    }),
  },
];
