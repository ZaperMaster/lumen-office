import JSZip from "jszip";
import { EMPTY_HF, type HeaderFooter, type PageLayout } from "@/lib/pageLayout";

/*
 * Lectura de documentos de Word (.docx) conservando lo más posible: títulos,
 * alineación, sangría, interlineado, listas (también anidadas), negrita,
 * cursiva, subrayado, tachado, colores, resaltado, tamaño y tipo de letra,
 * superíndice, enlaces, tablas, imágenes, saltos de página y el encabezado y
 * pie (con el número de página).
 *
 * Genera HTML que el editor sabe interpretar.
 */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const kid = (el: Element | null | undefined, name: string, ns = W) => (el ? ([...el.children].find((c) => c.namespaceURI === ns && c.localName === name) ?? null) : null);
const kids = (el: Element | null | undefined, name: string, ns = W) => (el ? [...el.children].filter((c) => c.namespaceURI === ns && c.localName === name) : []);
const val = (el: Element | null | undefined) => el?.getAttributeNS(W, "val") ?? el?.getAttribute("w:val") ?? null;
const attr = (el: Element | null | undefined, name: string) => el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Interruptor de Word: presente sin valor o con valor distinto de 0/false. */
const on = (el: Element | null) => !!el && !["0", "false", "off", "none"].includes((val(el) ?? "true").toLowerCase());

const HIGHLIGHT: Record<string, string> = {
  yellow: "#fff59d", green: "#c5f6c7", cyan: "#b3e5fc", magenta: "#f8bbd0", blue: "#90caf9", red: "#ef9a9a",
  darkBlue: "#5c6bc0", darkCyan: "#4db6ac", darkGreen: "#81c784", darkMagenta: "#ba68c8", darkRed: "#e57373",
  darkYellow: "#ffd54f", lightGray: "#e0e0e0", darkGray: "#9e9e9e", black: "#616161",
};

interface RunProps {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  color?: string;
  size?: number;
  font?: string;
  hl?: string;
  sup?: boolean;
  sub?: boolean;
}

function runProps(rPr: Element | null, base: RunProps = {}): RunProps {
  const p: RunProps = { ...base };
  if (!rPr) return p;
  const b = kid(rPr, "b");
  if (b) p.b = on(b);
  const i = kid(rPr, "i");
  if (i) p.i = on(i);
  const u = kid(rPr, "u");
  if (u) p.u = (val(u) ?? "single") !== "none";
  if (on(kid(rPr, "strike")) || on(kid(rPr, "dstrike"))) p.s = true;
  const color = val(kid(rPr, "color"));
  if (color && color !== "auto" && /^[0-9a-f]{6}$/i.test(color)) p.color = `#${color.toLowerCase()}`;
  const sz = val(kid(rPr, "sz"));
  if (sz) p.size = Number(sz) / 2;
  const fonts = kid(rPr, "rFonts");
  const font = attr(fonts, "ascii") ?? attr(fonts, "hAnsi");
  if (font) p.font = font;
  const hl = val(kid(rPr, "highlight"));
  if (hl && hl !== "none") p.hl = HIGHLIGHT[hl] ?? "#fff59d";
  const shd = attr(kid(rPr, "shd"), "fill");
  if (!p.hl && shd && shd !== "auto" && /^[0-9a-f]{6}$/i.test(shd) && shd.toUpperCase() !== "FFFFFF") p.hl = `#${shd.toLowerCase()}`;
  const va = val(kid(rPr, "vertAlign"));
  if (va === "superscript") p.sup = true;
  if (va === "subscript") p.sub = true;
  return p;
}

function wrapRun(text: string, p: RunProps): string {
  let h = text;
  const css: string[] = [];
  if (p.color && p.color !== "#000000") css.push(`color:${p.color}`);
  if (p.size && Math.abs(p.size - 11) > 0.1 && Math.abs(p.size - 12) > 0.1) css.push(`font-size:${p.size}pt`);
  if (p.font && !/^(Calibri|Aptos|Times New Roman|Arial)$/i.test(p.font)) css.push(`font-family:"${p.font}"`);
  if (css.length) h = `<span style="${css.join(";")}">${h}</span>`;
  if (p.hl) h = `<mark data-color="${p.hl}" style="background-color:${p.hl}">${h}</mark>`;
  if (p.sup) h = `<sup>${h}</sup>`;
  if (p.sub) h = `<sub>${h}</sub>`;
  if (p.s) h = `<s>${h}</s>`;
  if (p.u) h = `<u>${h}</u>`;
  if (p.i) h = `<em>${h}</em>`;
  if (p.b) h = `<strong>${h}</strong>`;
  return h;
}

interface Ctx {
  zip: JSZip;
  rels: Record<string, string>;
  styles: Map<string, { name: string; rPr: Element | null; pPr: Element | null; basedOn: string | null }>;
  numbering: Map<string, Map<number, string>>;
  /** Saltos de página encontrados dentro de un párrafo */
  pendingBreak: boolean;
}

async function readRels(zip: JSZip, path: string): Promise<Record<string, string>> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const file = `${dir}/_rels/${path.slice(path.lastIndexOf("/") + 1)}.rels`;
  const text = await zip.file(file)?.async("string");
  const out: Record<string, string> = {};
  if (!text) return out;
  for (const r of [...xml(text).getElementsByTagName("Relationship")]) {
    const target = r.getAttribute("Target") ?? "";
    const external = r.getAttribute("TargetMode") === "External";
    out[r.getAttribute("Id") ?? ""] = external ? target : target.startsWith("/") ? target.slice(1) : `${dir}/${target}`.replace(/[^/]+\/\.\.\//g, "");
  }
  return out;
}

/** Nombre de estilo y propiedades heredadas. */
function styleChain(ctx: Ctx, id: string | null): { name: string; rPr: Element[]; pPr: Element[] } {
  const rPr: Element[] = [];
  const pPr: Element[] = [];
  let name = "";
  let cur = id;
  for (let i = 0; cur && i < 10; i++) {
    const st = ctx.styles.get(cur);
    if (!st) break;
    if (!name) name = st.name;
    if (st.rPr) rPr.unshift(st.rPr);
    if (st.pPr) pPr.unshift(st.pPr);
    cur = st.basedOn;
  }
  return { name: name.toLowerCase(), rPr, pPr };
}

async function imageHtml(ctx: Ctx, drawing: Element): Promise<string> {
  const blip = drawing.getElementsByTagNameNS(A, "blip")[0];
  const rid = blip?.getAttributeNS(R, "embed");
  const target = rid ? ctx.rels[rid] : undefined;
  const file = target ? ctx.zip.file(target) : null;
  if (!file) return "";
  const ext = target!.split(".").pop()?.toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : ext === "bmp" ? "image/bmp" : "image/png";
  if (ext === "emf" || ext === "wmf") return "";
  const b64 = await file.async("base64");
  const extent = drawing.getElementsByTagNameNS(WP, "extent")[0];
  const width = extent ? Math.round(Number(extent.getAttribute("cx")) / 9525) : null;
  const anchor = drawing.getElementsByTagNameNS(WP, "anchor")[0];
  const posH = anchor?.getElementsByTagNameNS(WP, "positionH")[0]?.getElementsByTagNameNS(WP, "align")[0]?.textContent;
  const float = posH === "left" || posH === "right" ? posH : null;
  return `<img src="data:${mime};base64,${b64}"${width ? ` width="${Math.min(width, 700)}"` : ""}${float ? ` data-align="${float}"` : ""}>`;
}

/** Contenido de un párrafo (runs, enlaces, imágenes) en HTML. */
async function inlineHtml(ctx: Ctx, p: Element, base: RunProps): Promise<{ html: string; images: string[] }> {
  let html = "";
  const images: string[] = [];
  let fieldDepth = 0;
  let inResult = true;
  const walk = async (parent: Element, href?: string) => {
    for (const node of [...parent.children]) {
      if (node.namespaceURI !== W) continue;
      if (node.localName === "hyperlink") {
        const rid = node.getAttributeNS(R, "id");
        const anchor = node.getAttributeNS(W, "anchor");
        await walk(node, rid ? ctx.rels[rid] : anchor ? `#${anchor}` : undefined);
        continue;
      }
      if (node.localName === "ins" || node.localName === "smartTag" || node.localName === "sdt" || node.localName === "sdtContent" || node.localName === "fldSimple") {
        await walk(node.localName === "sdt" ? (kid(node, "sdtContent") ?? node) : node, href);
        continue;
      }
      if (node.localName !== "r") continue;
      const props = runProps(kid(node, "rPr"), base);
      let text = "";
      for (const c of [...node.children]) {
        // Las imágenes nuevas suelen ir dentro de mc:AlternateContent
        if (c.localName === "AlternateContent") {
          const d = c.getElementsByTagNameNS(W, "drawing")[0];
          const img = d ? await imageHtml(ctx, d) : "";
          if (img) images.push(img);
          continue;
        }
        if (c.namespaceURI !== W) continue;
        switch (c.localName) {
          case "fldChar": {
            const t = attr(c, "fldCharType");
            if (t === "begin") {
              fieldDepth++;
              inResult = false;
            } else if (t === "separate") inResult = true;
            else if (t === "end") {
              fieldDepth = Math.max(0, fieldDepth - 1);
              inResult = true;
            }
            break;
          }
          case "t":
            if (fieldDepth === 0 || inResult) text += esc(c.textContent ?? "");
            break;
          case "tab":
            text += "&emsp;";
            break;
          case "br":
          case "cr":
            if (attr(c, "type") === "page") ctx.pendingBreak = true;
            else text += "<br>";
            break;
          case "noBreakHyphen":
            text += "-";
            break;
          case "drawing":
          case "pict": {
            const img = await imageHtml(ctx, c);
            if (img) images.push(img);
            break;
          }
        }
      }
      if (!text) continue;
      const piece = wrapRun(text, props);
      html += href ? `<a href="${esc(href)}">${piece}</a>` : piece;
    }
  };
  await walk(p);
  return { html, images };
}

interface Block {
  kind: "p" | "list" | "table" | "break" | "raw";
  html: string;
  list?: { ordered: boolean; level: number };
}

async function paragraphBlock(ctx: Ctx, p: Element): Promise<Block[]> {
  const pPr = kid(p, "pPr");
  const styleId = val(kid(pPr, "pStyle"));
  const chain = styleChain(ctx, styleId);
  // Formato de letra del estilo (para títulos se deja el del editor)
  let base: RunProps = {};
  const heading = /^heading (\d)/.exec(chain.name)?.[1] ?? (chain.name === "title" ? "1" : null);
  if (!heading) for (const r of chain.rPr) base = runProps(r, base);
  const blocks: Block[] = [];
  const pagePrev = on(kid(pPr, "pageBreakBefore")) || chain.pPr.some((x) => on(kid(x, "pageBreakBefore")));
  if (pagePrev) blocks.push({ kind: "break", html: "" });

  ctx.pendingBreak = false;
  const { html, images } = await inlineHtml(ctx, p, base);
  const css: string[] = [];
  const jc = val(kid(pPr, "jc")) ?? chain.pPr.map((x) => val(kid(x, "jc"))).filter(Boolean).pop();
  if (jc === "center") css.push("text-align:center");
  else if (jc === "right" || jc === "end") css.push("text-align:right");
  else if (jc === "both" || jc === "distribute") css.push("text-align:justify");
  const ind = kid(pPr, "ind");
  const left = Number(attr(ind, "left") ?? attr(ind, "start") ?? 0);
  const spacing = kid(pPr, "spacing");
  const line = attr(spacing, "line");
  if (line && (attr(spacing, "lineRule") ?? "auto") === "auto") {
    const lh = Math.round((Number(line) / 240) * 100) / 100;
    if (lh >= 1 && lh <= 3 && Math.abs(lh - 1.15) > 0.05 && Math.abs(lh - 1.08) > 0.05) css.push(`line-height:${lh}`);
  }
  const numPr = kid(pPr, "numPr");
  const numId = val(kid(numPr, "numId"));
  const style = css.length ? ` style="${css.join(";")}"` : "";

  if (numId && numId !== "0") {
    const level = Number(val(kid(numPr, "ilvl")) ?? 0);
    const fmt = ctx.numbering.get(numId)?.get(level) ?? "bullet";
    blocks.push({ kind: "list", html: `<p${style}>${html || "<br>"}</p>`, list: { ordered: fmt !== "bullet" && fmt !== "none", level } });
  } else if (heading) {
    const lvl = Math.min(4, Number(heading));
    blocks.push({ kind: "p", html: `<h${lvl}${style}>${html}</h${lvl}>` });
  } else if (/quote|cita/.test(chain.name)) {
    blocks.push({ kind: "p", html: `<blockquote><p${style}>${html}</p></blockquote>` });
  } else if (chain.name === "subtitle") {
    blocks.push({ kind: "p", html: `<p${style}><em>${html}</em></p>` });
  } else {
    // Sangría (el editor la mide en pasos de 2 em; 720 = media pulgada)
    const indent = left > 0 ? `${css.length ? ";" : ""}margin-left:${Math.min(8, Math.round(left / 720)) * 2}em` : "";
    const st = css.length || indent ? ` style="${css.join(";")}${indent}"` : "";
    blocks.push({ kind: "p", html: `<p${st}>${html}</p>` });
  }
  for (const img of images) blocks.push({ kind: "raw", html: img });
  if (ctx.pendingBreak) blocks.push({ kind: "break", html: "" });
  // Un cambio de sección con página nueva también es un salto
  const sect = kid(pPr, "sectPr");
  if (sect && (val(kid(sect, "type")) ?? "nextPage") !== "continuous") blocks.push({ kind: "break", html: "" });
  return blocks;
}

async function tableHtml(ctx: Ctx, tbl: Element): Promise<string> {
  let out = "<table><tbody>";
  for (const tr of kids(tbl, "tr")) {
    out += "<tr>";
    for (const tc of kids(tr, "tc")) {
      const tcPr = kid(tc, "tcPr");
      const span = Number(val(kid(tcPr, "gridSpan")) ?? 1);
      const vMerge = kid(tcPr, "vMerge");
      const shd = attr(kid(tcPr, "shd"), "fill");
      const bg = shd && /^[0-9a-f]{6}$/i.test(shd) && shd.toUpperCase() !== "FFFFFF" ? ` style="background-color:#${shd.toLowerCase()}"` : "";
      let inner = "";
      if (!(vMerge && val(vMerge) !== "restart")) inner = await blocksToHtml(ctx, tc);
      out += `<td${span > 1 ? ` colspan="${span}"` : ""}${bg}>${inner || "<p></p>"}</td>`;
    }
    out += "</tr>";
  }
  return out + "</tbody></table>";
}

/** Convierte los hijos de un contenedor (cuerpo o celda) en HTML. */
async function blocksToHtml(ctx: Ctx, container: Element): Promise<string> {
  const blocks: Block[] = [];
  for (const node of [...container.children]) {
    if (node.namespaceURI !== W) continue;
    if (node.localName === "p") blocks.push(...(await paragraphBlock(ctx, node)));
    else if (node.localName === "tbl") blocks.push({ kind: "table", html: await tableHtml(ctx, node) });
    else if (node.localName === "sdt") {
      const content = kid(node, "sdtContent");
      if (content) blocks.push({ kind: "raw", html: await blocksToHtml(ctx, content) });
    }
  }
  // Las listas seguidas se agrupan (y se anidan según su nivel)
  let html = "";
  let stack: { tag: string; level: number }[] = [];
  const closeTo = (level: number) => {
    while (stack.length && stack[stack.length - 1].level > level) html += `</li></${stack.pop()!.tag}>`;
  };
  for (const b of blocks) {
    if (b.kind === "list") {
      const { ordered, level } = b.list!;
      const tag = ordered ? "ol" : "ul";
      closeTo(level);
      const top = stack[stack.length - 1];
      if (!top || top.level < level) {
        html += `<${tag}><li>${b.html}`;
        stack.push({ tag, level });
      } else if (top.tag !== tag) {
        html += `</li></${stack.pop()!.tag}><${tag}><li>${b.html}`;
        stack.push({ tag, level });
      } else html += `</li><li>${b.html}`;
      continue;
    }
    closeTo(-1);
    stack = [];
    if (b.kind === "break") html += `<div data-page-break=""></div>`;
    else html += b.html;
  }
  closeTo(-1);
  return html;
}

/** Texto de un encabezado o pie, con los números de página como campos. */
async function headerFooter(zip: JSZip, path: string): Promise<HeaderFooter | null> {
  const text = await zip.file(path)?.async("string");
  if (!text) return null;
  const doc = xml(text);
  const out: HeaderFooter = { ...EMPTY_HF };
  for (const p of [...doc.getElementsByTagNameNS(W, "p")]) {
    let s = "";
    let instr = "";
    let inField = false;
    let skipResult = false;
    const fieldToken = (code: string) => (/\bNUMPAGES\b|\bSECTIONPAGES\b/i.test(code) ? "{paginas}" : /\bPAGE\b/i.test(code) ? "{pagina}" : /\bDATE\b|\bTIME\b/i.test(code) ? "{fecha}" : /\bTITLE\b/i.test(code) ? "{titulo}" : /\bAUTHOR\b/i.test(code) ? "{autor}" : null);
    for (const el of [...p.getElementsByTagNameNS(W, "*")]) {
      if (el.localName === "fldSimple") {
        const tok = fieldToken(el.getAttributeNS(W, "instr") ?? "");
        if (tok) {
          s += tok;
          // Su texto de ejemplo no se copia
          el.querySelectorAll("*").forEach((x) => x.setAttribute("data-skip", "1"));
        }
      } else if (el.getAttribute("data-skip")) continue;
      else if (el.localName === "fldChar") {
        const t = attr(el, "fldCharType");
        if (t === "begin") {
          inField = true;
          instr = "";
        } else if (t === "separate") {
          const tok = fieldToken(instr);
          if (tok) {
            s += tok;
            skipResult = true;
          }
          inField = false;
        } else if (t === "end") {
          inField = false;
          skipResult = false;
        }
      } else if (el.localName === "instrText") instr += el.textContent ?? "";
      else if (el.localName === "t" && !inField && !skipResult) s += el.textContent ?? "";
      else if (el.localName === "tab") s += "\t";
    }
    s = s.trim();
    if (!s) continue;
    const jc = val(kid(kid(p, "pPr"), "jc"));
    const parts = s.split("\t").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 3) {
      out.left ||= parts[0];
      out.center ||= parts[1];
      out.right ||= parts.slice(2).join(" ");
    } else if (parts.length === 2) {
      out.left ||= parts[0];
      out.right ||= parts[1];
    } else {
      const slot = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : "left";
      out[slot] = out[slot] ? `${out[slot]} ${s}` : s;
    }
  }
  return out.left || out.center || out.right ? out : null;
}

export async function readDocx(data: ArrayBuffer): Promise<{ html: string; pageLayout: PageLayout | null }> {
  const zip = await JSZip.loadAsync(data);
  const docPath = "word/document.xml";
  const docXml = await zip.file(docPath)?.async("string");
  if (!docXml) throw new Error("No es un documento de Word");
  const doc = xml(docXml);

  const styles = new Map<string, { name: string; rPr: Element | null; pPr: Element | null; basedOn: string | null }>();
  const stylesXml = await zip.file("word/styles.xml")?.async("string");
  if (stylesXml) {
    for (const st of [...xml(stylesXml).getElementsByTagNameNS(W, "style")]) {
      const id = st.getAttributeNS(W, "styleId") ?? st.getAttribute("w:styleId");
      if (!id) continue;
      styles.set(id, { name: val(kid(st, "name")) ?? id, rPr: kid(st, "rPr"), pPr: kid(st, "pPr"), basedOn: val(kid(st, "basedOn")) });
    }
  }

  // Formato de cada lista: numId → nivel → «bullet», «decimal»…
  const numbering = new Map<string, Map<number, string>>();
  const numXml = await zip.file("word/numbering.xml")?.async("string");
  if (numXml) {
    const nd = xml(numXml);
    const abstract = new Map<string, Map<number, string>>();
    for (const an of [...nd.getElementsByTagNameNS(W, "abstractNum")]) {
      const levels = new Map<number, string>();
      for (const lvl of kids(an, "lvl")) levels.set(Number(attr(lvl, "ilvl") ?? 0), val(kid(lvl, "numFmt")) ?? "bullet");
      abstract.set(attr(an, "abstractNumId") ?? "", levels);
    }
    for (const num of [...nd.getElementsByTagNameNS(W, "num")]) {
      const aid = val(kid(num, "abstractNumId"));
      if (aid && abstract.has(aid)) numbering.set(attr(num, "numId") ?? "", abstract.get(aid)!);
    }
  }

  const ctx: Ctx = { zip, rels: await readRels(zip, docPath), styles, numbering, pendingBreak: false };
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  const html = await blocksToHtml(ctx, body);

  // Encabezado y pie de la sección principal
  let pageLayout: PageLayout | null = null;
  const sect = [...body.children].reverse().find((c) => c.localName === "sectPr") ?? null;
  if (sect) {
    const pick = async (tag: "headerReference" | "footerReference") => {
      const refs = kids(sect, tag);
      const ref = refs.find((r) => attr(r, "type") === "default") ?? refs[0];
      const target = ref ? ctx.rels[ref.getAttributeNS(R, "id") ?? ""] : undefined;
      return target ? headerFooter(zip, target) : null;
    };
    const header = await pick("headerReference");
    const footer = await pick("footerReference");
    const start = Number(attr(kid(sect, "pgNumType"), "start") ?? 1);
    if (header || footer) {
      pageLayout = {
        header: header ?? { ...EMPTY_HF },
        footer: footer ?? { ...EMPTY_HF },
        differentFirstPage: !!kid(sect, "titlePg") && on(kid(sect, "titlePg")),
        startNumber: Number.isFinite(start) ? start : 1,
      };
    }
  }
  return { html, pageLayout };
}
