import { generateJSON, type JSONContent } from "@tiptap/core";
import { marked } from "marked";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { buildExtensions } from "@/components/editor/extensions";
import { createDoc, type DocRecord } from "@/lib/db";
import { useSettings } from "@/store/settings";
import type { PageLayout } from "@/lib/pageLayout";

/* ------------------------------------------------------------------ */
/*  Conversión de formatos                                             */
/* ------------------------------------------------------------------ */

const schemaExtensions = () => buildExtensions({ placeholder: "", smartTyping: false });

export function htmlToJSON(html: string): JSONContent {
  return generateJSON(html, schemaExtensions());
}

export function markdownToHtml(md: string): string {
  // Se sanea porque el Markdown puede venir de la IA o de archivos externos
  const html = DOMPurify.sanitize(marked.parse(md, { async: false, gfm: true, breaks: false }) as string);
  return html.includes('type="checkbox"') ? toTaskLists(html) : html;
}

/** Convierte las listas «- [ ]» de Markdown al formato de listas de tareas del editor. */
function toTaskLists(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const boxOf = (li: Element) => li.querySelector(":scope > input[type=checkbox], :scope > p:first-child > input[type=checkbox]");
  doc.querySelectorAll("ul").forEach((ul) => {
    const items = [...ul.children].filter((c) => c.tagName === "LI");
    // Solo si todos los elementos son tareas; si se mezclan, se deja como lista normal
    if (!items.length || !items.every(boxOf)) return;
    ul.setAttribute("data-type", "taskList");
    items.forEach((li) => {
      const box = boxOf(li) as HTMLInputElement;
      li.setAttribute("data-type", "taskItem");
      li.setAttribute("data-checked", String(box.hasAttribute("checked")));
      box.remove();
      if (!li.querySelector("p")) li.innerHTML = `<p>${li.innerHTML.trim()}</p>`;
    });
  });
  return doc.body.innerHTML;
}

export function markdownToJSON(md: string): JSONContent {
  return htmlToJSON(markdownToHtml(md));
}

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
turndown.addRule("strike", { filter: ["s", "del"], replacement: (c) => `~~${c}~~` });
turndown.addRule("taskItem", {
  filter: (n) => n.nodeName === "LI" && n.getAttribute("data-type") === "taskItem",
  replacement: (c, n) => `- [${(n as HTMLElement).getAttribute("data-checked") === "true" ? "x" : " "}] ${c.trim()}\n`,
});
turndown.addRule("table", {
  filter: "table",
  replacement: (_c, node) => {
    const rows = [...(node as HTMLTableElement).rows].map((r) =>
      [...r.cells].map((cell) => (cell.textContent ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ").trim()),
    );
    if (!rows.length) return "";
    const head = `| ${rows[0].join(" | ")} |`;
    const sep = `| ${rows[0].map(() => "---").join(" | ")} |`;
    const body = rows.slice(1).map((r) => `| ${r.join(" | ")} |`).join("\n");
    return `\n\n${head}\n${sep}\n${body}\n\n`;
  },
});
turndown.addRule("pageBreak", { filter: (n) => n.nodeName === "DIV" && n.hasAttribute("data-page-break"), replacement: () => "\n\n---\n\n" });

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

/* ------------------------------------------------------------------ */
/*  Importar                                                           */
/* ------------------------------------------------------------------ */

export const ACCEPTED_IMPORTS = ".docx,.lumen,.md,.markdown,.html,.htm,.txt,.xlsx,.csv,.pptx";

export async function importFromFile(file: File, extra: Partial<Pick<DocRecord, "filePath" | "fileFormat">> = {}): Promise<DocRecord> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const title = file.name.replace(/\.[^.]+$/, "");
  let html: string;
  if (ext === "lumen") {
    const data = JSON.parse(await file.text()) as { app?: string; title?: string; content?: JSONContent; pageLayout?: PageLayout };
    if (data.app !== "lumen" || !data.content) throw new Error("El archivo .lumen está dañado.");
    return createDoc("document", { title: data.title || title, content: data.content, pageLayout: data.pageLayout ?? null, ...extra });
  }
  if (ext === "docx") {
    const buf = await file.arrayBuffer();
    try {
      // Lector propio: conserva alineación, colores, tamaños, listas, encabezado y pie…
      const { readDocx } = await import("@/lib/docxImport");
      const res = await readDocx(buf);
      return createDoc("document", { title, content: htmlToJSON(res.html), pageLayout: res.pageLayout, ...extra });
    } catch (e) {
      console.warn("Lector de Word propio falló; se usa el alternativo", e);
      const mammoth = await import("mammoth");
      html = (await mammoth.convertToHtml({ arrayBuffer: buf })).value;
    }
  } else if (ext === "md" || ext === "markdown") {
    html = markdownToHtml(await file.text());
  } else if (ext === "html" || ext === "htm") {
    const doc = new DOMParser().parseFromString(await file.text(), "text/html");
    html = doc.body.innerHTML;
  } else if (ext === "txt") {
    const text = await file.text();
    html = text
      .split(/\r?\n\r?\n/)
      .map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, "<br>")}</p>`)
      .join("");
  } else {
    throw new Error("Formato no compatible. Usa .docx, .lumen, .md, .html o .txt");
  }
  return createDoc("document", { title, content: htmlToJSON(html), ...extra });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/* ------------------------------------------------------------------ */
/*  Exportar                                                           */
/* ------------------------------------------------------------------ */

export { safeFileName } from "@/lib/fileName";

export function buildMarkdown(html: string, title: string): string {
  return (title ? `# ${title}\n\n` : "") + htmlToMarkdown(html);
}

/** Formato propio de Lumen: el documento completo, sin pérdidas, en JSON. */
export function buildLumen(content: JSONContent, title: string, pageLayout?: PageLayout | null): string {
  return JSON.stringify({ app: "lumen", format: 1, title, content, pageLayout: pageLayout ?? undefined }, null, 1);
}

export function buildHtmlPage(html: string, title: string): string {
  const { fontFamily, fontSize, lineHeight } = useSettings.getState();
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title || "Documento")}</title>
<style>
body{max-width:760px;margin:48px auto;padding:0 24px;font-family:${fontFamily};font-size:${fontSize}pt;line-height:${lineHeight};color:#1c1e24}
h1,h2,h3{line-height:1.25}blockquote{border-left:3px solid #6d4aff;margin:1em 0;padding-left:1em;color:#555;font-style:italic}
pre{background:#1e1f26;color:#eee;padding:12px 16px;border-radius:8px;overflow:auto}code{font-family:Consolas,monospace}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f3f3f3}
img{max-width:100%}ul[data-type=taskList]{list-style:none;padding-left:0}ul[data-type=taskList] li{display:flex;gap:.5em}
.page-break{break-after:page;height:0}
img[data-align=left]{float:left;margin:.3em 1.4em .6em 0}img[data-align=right]{float:right;margin:.3em 0 .6em 1.4em}
img[data-align=center]{display:block;margin:.6em auto}h1,h2,hr{clear:both}
</style></head><body>
${html}
</body></html>`;
}

export function printDocument() {
  window.print();
}

/** Documento de Word (.docx). La librería se carga solo al usarla. */
export async function buildDocx(content: JSONContent, title: string, pageLayout?: PageLayout | null): Promise<Blob> {
  const m = await import("@/lib/docx");
  return m.buildDocx(content, title, pageLayout);
}
