import { esc, layoutEls, sid, type Deck, type LayoutId, type Slide } from "@/lib/slides/model";

/* Plantillas de presentaciones */

export interface SlidesTemplate {
  id: string;
  name: string;
  description: string;
  theme: string;
  build: () => { title: string; deck: Deck };
}

/** Diapositiva de un diseño con sus textos (título, subtítulo o puntos). */
export function makeSlide(layout: LayoutId, title?: string, body?: string | string[], body2?: string[]): Slide {
  const els = layoutEls(layout);
  const bodies = els.filter((e) => e.role === "body");
  for (const e of els) {
    if (e.role === "title" && title) e.html = `<p>${esc(title)}</p>`;
    if (e.role === "subtitle" && typeof body === "string") e.html = `<p>${esc(body)}</p>`;
  }
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  if (Array.isArray(body) && bodies[0]) bodies[0].html = list(body);
  if (body2 && bodies[1]) bodies[1].html = list(body2);
  return { id: sid(), els };
}

export const SLIDES_TEMPLATES: SlidesTemplate[] = [
  {
    id: "blank",
    name: "Presentación en blanco",
    description: "Empieza desde cero",
    theme: "clean",
    build: () => ({ title: "", deck: { theme: "clean", slides: [makeSlide("title")] } }),
  },
  {
    id: "project",
    name: "Presentación de proyecto",
    description: "Objetivos, plan y próximos pasos",
    theme: "corporate",
    build: () => ({
      title: "Presentación de proyecto",
      deck: {
        theme: "corporate",
        slides: [
          makeSlide("title", "Nombre del proyecto", "Equipo · Fecha"),
          makeSlide("content", "Objetivos", ["Qué problema resolvemos", "A quién va dirigido", "Cómo mediremos el éxito"]),
          makeSlide("two", "Situación actual", ["Lo que funciona", "Recursos disponibles"], ["Lo que hay que mejorar", "Riesgos"]),
          makeSlide("content", "Plan de trabajo", ["Fase 1: análisis", "Fase 2: desarrollo", "Fase 3: lanzamiento"]),
          makeSlide("section", "Próximos pasos", "Decisiones que necesitamos hoy"),
        ],
      },
    }),
  },
  {
    id: "lesson",
    name: "Clase o charla",
    description: "Temas, ejemplos y resumen",
    theme: "forest",
    build: () => ({
      title: "Clase",
      deck: {
        theme: "forest",
        slides: [
          makeSlide("title", "Título de la clase", "Asignatura · Curso"),
          makeSlide("content", "Qué vamos a ver", ["Conceptos básicos", "Ejemplos prácticos", "Ejercicios"]),
          makeSlide("section", "1. Conceptos básicos"),
          makeSlide("content", "Idea principal", ["Definición", "Por qué es importante", "Un ejemplo sencillo"]),
          makeSlide("content", "Resumen", ["Lo más importante en una frase", "Tarea para casa"]),
        ],
      },
    }),
  },
  {
    id: "pitch",
    name: "Pitch de negocio",
    description: "Problema, solución y mercado",
    theme: "dark",
    build: () => ({
      title: "Pitch",
      deck: {
        theme: "dark",
        slides: [
          makeSlide("title", "Nombre de la empresa", "Una frase que explique lo que hacéis"),
          makeSlide("content", "El problema", ["Quién lo sufre", "Cuánto cuesta hoy"]),
          makeSlide("content", "Nuestra solución", ["Cómo funciona", "Por qué es mejor"]),
          makeSlide("two", "Mercado y modelo de negocio", ["Tamaño del mercado", "Clientes objetivo"], ["Cómo ganamos dinero", "Precios"]),
          makeSlide("section", "Gracias", "contacto@empresa.com"),
        ],
      },
    }),
  },
];

SLIDES_TEMPLATES.push(
  {
    id: "results",
    name: "Informe de resultados",
    description: "Cifras clave y conclusiones",
    theme: "ocean",
    build: () => ({
      title: "Informe de resultados",
      deck: {
        theme: "ocean",
        slides: [
          makeSlide("title", "Resultados del trimestre", "Departamento · Fecha"),
          makeSlide("content", "Resumen", ["Ventas: +12 % respecto al trimestre anterior", "Nuevos clientes: 1.450", "Satisfacción: 4,6 sobre 5"]),
          makeSlide("two", "Qué ha ido bien y qué no", ["Lanzamiento del producto nuevo", "Campaña de verano"], ["Retrasos en logística", "Costes por encima de lo previsto"]),
          makeSlide("content", "Objetivos para el próximo trimestre", ["Reducir los plazos de entrega", "Abrir un nuevo mercado", "Mejorar la atención al cliente"]),
          makeSlide("section", "Preguntas"),
        ],
      },
    }),
  },
  {
    id: "training",
    name: "Formación",
    description: "Módulos, ejercicios y evaluación",
    theme: "paper",
    build: () => ({
      title: "Formación",
      deck: {
        theme: "paper",
        slides: [
          makeSlide("title", "Nombre del curso", "Formador · Duración"),
          makeSlide("content", "Al terminar sabrás…", ["Objetivo de aprendizaje 1", "Objetivo de aprendizaje 2", "Objetivo de aprendizaje 3"]),
          makeSlide("section", "Módulo 1", "Introducción"),
          makeSlide("content", "Conceptos clave", ["Concepto y definición", "Ejemplo práctico", "Errores frecuentes"]),
          makeSlide("content", "Ejercicio", ["Enunciado del ejercicio", "Tiempo: 10 minutos", "Puesta en común"]),
          makeSlide("content", "Resumen y evaluación", ["Tres ideas para recordar", "Cuestionario final"]),
        ],
      },
    }),
  },
  {
    id: "portfolio",
    name: "Portfolio",
    description: "Presenta tus proyectos",
    theme: "violet",
    build: () => ({
      title: "Portfolio",
      deck: {
        theme: "violet",
        slides: [
          makeSlide("title", "Tu nombre", "Diseño · Desarrollo · Fotografía"),
          makeSlide("content", "Sobre mí", ["Quién eres en una frase", "Tu especialidad", "Con quién has trabajado"]),
          makeSlide("image", "Proyecto 1"),
          makeSlide("two", "Proyecto 1: el reto y la solución", ["Qué necesitaba el cliente"], ["Qué hiciste y qué resultado tuvo"]),
          makeSlide("image", "Proyecto 2"),
          makeSlide("section", "¿Trabajamos juntos?", "correo@ejemplo.com"),
        ],
      },
    }),
  },
  {
    id: "event",
    name: "Evento o celebración",
    description: "Programa, lugar y detalles",
    theme: "sunset",
    build: () => ({
      title: "Evento",
      deck: {
        theme: "sunset",
        slides: [
          makeSlide("title", "Nombre del evento", "Fecha · Lugar"),
          makeSlide("content", "Programa", ["18:00 Bienvenida", "19:00 Presentación", "20:30 Cena", "22:00 Música"]),
          makeSlide("image", "El lugar"),
          makeSlide("content", "Información práctica", ["Cómo llegar", "Aparcamiento", "Código de vestimenta"]),
          makeSlide("section", "¡Te esperamos!"),
        ],
      },
    }),
  },
);

export function slidesTemplate(id: string): SlidesTemplate {
  return SLIDES_TEMPLATES.find((t) => t.id === id) ?? SLIDES_TEMPLATES[0];
}
