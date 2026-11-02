// Envuelve los textos visibles de la interfaz en L("…") para poder traducirlos
// y genera el catálogo con todos los textos (scripts/i18n/catalog.json).
//
//   node scripts/i18n-wrap.mjs            → solo muestra lo que haría
//   node scripts/i18n-wrap.mjs --write    → modifica los archivos
//   node scripts/i18n-wrap.mjs --catalog  → solo regenera el catálogo
//
// Reglas: texto entre etiquetas JSX, atributos de texto (label, title…), propiedades
// de texto (label:, description:…), avisos (toast, confirm, Error) y, en el resto
// de sitios, solo frases (dos palabras o más). Nunca clases CSS, claves, comparaciones,
// tipos, selectores ni instrucciones para la IA.
import ts from "typescript5";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = join(ROOT, "src");
const WRITE = process.argv.includes("--write");
const CATALOG_ONLY = process.argv.includes("--catalog");

/** Archivos que no son interfaz (formatos de archivo, motores, contenido de documentos) */
const SKIP = [
  "lib/i18n.ts", "lib/docx.ts", "lib/docxImport.ts", "lib/sheet/xlsx.ts", "lib/sheet/xlsxCharts.ts", "lib/sheet/formula.ts",
  "lib/slides/pptx.ts", "lib/spell.ts", "lib/spellWorker.ts", "lib/llm-worker.ts", "lib/fonts.ts", "lib/sheet/format.ts",
  "lib/officeImport.ts", "lib/io.ts", "lib/slides/outline.ts", "main.tsx", "env.d.ts", "lib/slides/video.ts",
];
/** Archivos de contenido: solo se traducen nombres y descripciones, no el contenido */
const PROPS_ONLY = {
  "lib/templates.ts": ["name", "description"],
  "lib/sheet/templates.ts": ["name", "description"],
  "lib/slides/templates.ts": ["name", "description"],
  // Los nombres de las funciones (SUMA, SI…) no se traducen: son parte de las fórmulas
  "lib/sheet/functions.ts": ["desc"],
};

const TEXT_ATTRS = new Set([
  "label", "title", "placeholder", "description", "desc", "aria-label", "alt", "hint", "detail", "tooltip", "saveLabel",
  "subtitle", "caption", "help", "heading", "emptyText", "confirmLabel", "cancelLabel", "text", "message", "ask",
]);
/** Atributos JSX que nunca son texto */
const NEVER_ATTRS = new Set([
  "className", "style", "key", "id", "type", "name", "value", "defaultValue", "href", "src", "role", "htmlFor", "accept",
  "rel", "target", "lang", "dir", "inputMode", "autoComplete", "mode", "variant", "size", "side", "align", "orientation",
  "as", "form", "pattern", "d", "fill", "stroke", "viewBox", "xmlns", "transform", "points", "textAnchor", "fontFamily", "font",
]);
/** Texto que se muestra: empieza por mayúscula (o ¿¡) y tiene letras */
const DISPLAY = /^[A-ZÁÉÍÓÚÑ¿¡][\p{L}\s.,:;!?…()·%0-9'"«»/-]*$/u;
const TEXT_PROPS = new Set([
  "label", "title", "placeholder", "description", "desc", "hint", "detail", "tooltip", "subtitle", "caption", "help",
  "message", "name", "empty", "tip", "saveLabel", "confirmLabel", "cancelLabel", "heading", "note", "short", "long", "info",
]);
/** Propiedades que nunca son texto de la interfaz */
const NEVER_PROPS = new Set([
  "system", "prompt", "content", "role", "className", "class", "style", "css", "id", "key", "type", "kind", "href", "url",
  "src", "font", "fontFamily", "format", "mime", "ext", "accept", "pattern", "group", "cat", "syntax", "shortcut", "keys",
  "icon", "value", "color", "fill", "stroke", "code", "locale", "lang", "model", "provider", "endpoint", "path", "file", "license", "transform", "filter", "background", "border",
]);
const TEXT_CALLS = new Set(["toast", "confirm", "alert", "Error", "ask", "setError", "setStatus", "setMessage", "setNotice", "onProgress", "report"]);
const NEVER_CALLS = new Set([
  "cn", "clsx", "querySelector", "querySelectorAll", "closest", "matches", "getItem", "setItem", "removeItem",
  "addEventListener", "removeEventListener", "fetch", "invoke", "emit", "listen", "log", "warn", "error", "info", "debug",
  "postMessage", "RegExp", "URL", "startsWith", "endsWith", "includes", "indexOf", "replace", "replaceAll", "split", "execCommand",
  "setProperty", "getPropertyValue", "createElement", "localeCompare", "toLocaleDateString", "toLocaleTimeString",
  "toLocaleString", "DateTimeFormat", "NumberFormat", "getAttribute", "setAttribute", "hasAttribute", "streamText",
  "complete", "chat", "generate", "import", "require", "test", "match", "BroadcastChannel", "isTypeSupported",
  "setMark", "isActive", "getAttributes", "updateAttributes", "toggleMark", "setNode", "insertContent", "setContent", "open",
]);

const isLetters = (s) => /\p{L}{2,}/u.test(s);
const codeLike = (s) =>
  /^(https?:|data:|mailto:|#|\.|\/)/.test(s) ||
  /[{};<>=]|=>|\bvar\(|\brgb|px\b|\\|^\s*@/.test(s) ||
  /^[\w.\-:/[\]#%]+$/.test(s) && !/^[A-ZÁÉÍÓÚÑ¿¡]/.test(s) ||
  /(^|\s)[a-z0-9]+-[a-z0-9-[\]/:.]+(\s|$)/.test(s) && !/[A-ZÁÉÍÓÚÑáéíóúñ¿¡]/.test(s) ||
  /Variable"?,|sans-serif|serif$|monospace/.test(s) ||
  // Listas de campos («id, kind, *tags»)
  /^[\w*&+[\]]+(,\s*[\w*&+[\]]+)+$/.test(s);
/** Frase: dos palabras o más, separadas por espacios */
const sentence = (s) => /\s/.test(s.trim()) && (s.match(/\p{L}{2,}/gu) ?? []).length >= 2;
const accepts = (s, strong) => isLetters(s) && !codeLike(s) && (!strong || sentence(s));

const files = [];
const walkDir = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walkDir(p);
    else if (/\.(tsx?|mts)$/.test(f) && !f.endsWith(".d.ts")) files.push(p);
  }
};
walkDir(SRC);

const catalog = new Map(); // texto → archivos
let total = 0;

for (const file of files) {
  const rel = relative(SRC, file).split(sep).join("/");
  if (SKIP.includes(rel)) continue;
  const propsOnly = !!PROPS_ONLY[rel];
  const PROPS_ONLY_NAMES = new Set(PROPS_ONLY[rel] ?? []);
  const code = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  const done = new Set();
  const add = (key) => {
    const list = catalog.get(key) ?? new Set();
    list.add(rel);
    catalog.set(key, list);
  };

  /** Texto (o plantilla) en L(…); devuelve si lo ha envuelto */
  const wrapLiteral = (node, strong, jsxAttr = false) => {
    if (done.has(node.pos)) return false;
    // Ya traducido
    if (ts.isCallExpression(node.parent) && node.parent.expression.getText(sf) === "L") return false;
    let key;
    let args = [];
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) key = node.text;
    else if (ts.isTemplateExpression(node)) {
      key = node.head.text;
      node.templateSpans.forEach((sp, i) => {
        key += `{${i}}` + sp.literal.text;
        args.push(sp.expression.getText(sf));
      });
    } else return false;
    const plain = key.replace(/\{\d+\}/g, " ");
    if (!accepts(plain.trim(), strong)) return false;
    done.add(node.pos);
    const call = `L(${JSON.stringify(key)}${args.map((a) => `, ${a}`).join("")})`;
    edits.push({ start: node.getStart(sf), end: node.getEnd(), text: jsxAttr ? `{${call}}` : call });
    add(key);
    return true;
  };

  /** Expresión que se muestra: se baja por ?:, ||, ?? y + */
  const wrapExpr = (e, strong) => {
    if (!e) return;
    if (ts.isParenthesizedExpression(e)) return wrapExpr(e.expression, strong);
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) return void wrapLiteral(e, strong);
    if (ts.isConditionalExpression(e)) {
      wrapExpr(e.whenTrue, strong);
      wrapExpr(e.whenFalse, strong);
      return;
    }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.AmpersandAmpersandToken) {
        if (op !== ts.SyntaxKind.AmpersandAmpersandToken) wrapExpr(e.left, strong);
        wrapExpr(e.right, strong);
      } else if (op === ts.SyntaxKind.PlusToken) {
        wrapExpr(e.left, strong);
        wrapExpr(e.right, strong);
      }
    }
  };

  const propName = (p) => (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : "");
  const calleeName = (c) => {
    const e = c.expression;
    if (ts.isIdentifier(e)) return e.text;
    if (ts.isPropertyAccessExpression(e)) return e.name.text;
    return "";
  };

  const visit = (node) => {
    // Nunca: importaciones, tipos, enumeraciones
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node) || ts.isEnumDeclaration(node)) return;
    // «// i18n-ignore» en la línea anterior: no se toca (valores que se usan como claves)
    if ((ts.getLeadingCommentRanges(code, node.pos) ?? []).some((c) => code.slice(c.pos, c.end).includes("i18n-ignore"))) return;
    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      if (name === "className" || name === "style" || name === "key" || name.startsWith("data-")) return;
      const init = node.initializer;
      if (TEXT_ATTRS.has(name) && !propsOnly) {
        if (init && ts.isStringLiteral(init)) wrapLiteral(init, false, true);
        else if (init && ts.isJsxExpression(init)) wrapExpr(init.expression, false);
      } else if (!propsOnly && !NEVER_ATTRS.has(name) && init && ts.isStringLiteral(init) && DISPLAY.test(init.text)) {
        // Otros atributos con texto que empieza en mayúscula (noneLabel="Sin relleno", shortcut="Supr"…)
        wrapLiteral(init, false, true);
      }
    }
    if (ts.isJsxText(node) && !propsOnly) {
      const raw = node.text;
      const core = raw.replace(/\s*\n\s*/g, " ").trim();
      const parentTag = node.parent && ts.isJsxElement(node.parent) ? node.parent.openingElement.tagName.getText(sf) : "";
      if (core && isLetters(core) && !["kbd", "code", "style", "pre"].includes(parentTag)) {
        const lead = raw.length - raw.trimStart().length;
        const trail = raw.length - raw.trimEnd().length;
        const start = node.getStart(sf, false) ;
        const s0 = node.pos + lead;
        const e0 = node.end - trail;
        // Conserva un espacio delante/detrás si lo había en la misma línea
        const before = /^[ \t]+/.test(raw) && !raw.slice(0, lead).includes("\n") ? " " : "";
        const after = /[ \t]+$/.test(raw) && !raw.slice(raw.length - trail).includes("\n") ? " " : "";
        void start;
        edits.push({ start: s0, end: e0, text: `${before ? "{\" \"}" : ""}{L(${JSON.stringify(core)})}${after ? "{\" \"}" : ""}`, trimSpaces: { before, after } });
        add(core);
        return;
      }
    }
    if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) && !propsOnly) {
      wrapExpr(node.expression, false);
    }
    if (ts.isPropertyAssignment(node)) {
      const name = propName(node);
      if (propsOnly) {
        if (PROPS_ONLY_NAMES.has(name)) wrapExpr(node.initializer, false);
        // En los archivos de contenido no se baja más (el contenido no se traduce)
        if (!ts.isArrayLiteralExpression(node.initializer) && !ts.isObjectLiteralExpression(node.initializer) && !ts.isArrowFunction(node.initializer) && !ts.isCallExpression(node.initializer)) return;
      } else if (NEVER_PROPS.has(name)) return;
      else if (TEXT_PROPS.has(name)) wrapExpr(node.initializer, false);
      else wrapExpr(node.initializer, true);
    }
    if (propsOnly) {
      ts.forEachChild(node, visit);
      return;
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = ts.isCallExpression(node) ? calleeName(node) : node.expression.getText(sf).split(".").pop();
      if (NEVER_CALLS.has(name)) return;
      const strong = !TEXT_CALLS.has(name);
      for (const a of node.arguments ?? []) wrapExpr(a, strong);
      // Opciones de toast: { detail, action: { label } } van por las reglas de propiedades
    }
    if (ts.isBinaryExpression(node)) {
      const k = node.operatorToken.kind;
      if ([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.InKeyword].includes(k)) return;
    }
    if (ts.isElementAccessExpression(node)) return;
    // En un «case» solo se salta el valor que se compara; su contenido sí se revisa
    if (ts.isCaseClause(node)) {
      for (const st of node.statements) visit(st);
      return;
    }
    // Valores por defecto de parámetros: ({ label = "Fuente" })
    if ((ts.isParameter(node) || ts.isBindingElement(node)) && node.initializer && ts.isStringLiteral(node.initializer) && DISPLAY.test(node.initializer.text)) {
      wrapLiteral(node.initializer, false);
    }
    if (ts.isVariableDeclaration(node) && node.initializer) wrapExpr(node.initializer, true);
    if (ts.isReturnStatement(node) && node.expression) wrapExpr(node.expression, true);
    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) wrapExpr(node.body, true);
    if (ts.isArrayLiteralExpression(node)) for (const el of node.elements) wrapExpr(el, true);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (!edits.length) continue;
  total += edits.length;
  if (CATALOG_ONLY) continue;
  if (!WRITE) {
    console.log(`\n${rel} (${edits.length})`);
    for (const e of edits.slice(0, 400)) console.log("   ", e.text.replace(/\{" "\}/g, "").slice(0, 110));
    continue;
  }
  edits.sort((a, b) => b.start - a.start);
  let out = code;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // Importación de L
  if (!/import \{[^}]*\bL\b[^}]*\} from "@\/lib\/i18n"/.test(out)) {
    const imports = [...out.matchAll(/^import [^;]+;\s*$/gm)];
    const last = imports[imports.length - 1];
    const line = `import { L } from "@/lib/i18n";\n`;
    out = last ? out.slice(0, last.index + last[0].length) + "\n" + line.trimEnd() + out.slice(last.index + last[0].length) : line + out;
  }
  writeFileSync(file, out);
}

// Catálogo de textos (lo que hay que traducir)
const dir = join(ROOT, "scripts", "i18n");
mkdirSync(dir, { recursive: true });
if (WRITE || CATALOG_ONLY) {
  // Al escribir, el catálogo se completa con los L("…") que ya hay en el código
  for (const file of files) {
    const code = readFileSync(file, "utf8");
    for (const m of code.matchAll(/\bL\(\s*("(?:[^"\\]|\\.)*")/g)) {
      try {
        const key = JSON.parse(m[1]);
        const list = catalog.get(key) ?? new Set();
        list.add(relative(SRC, file).split(sep).join("/"));
        catalog.set(key, list);
      } catch {
        // Comillas raras: se ignora
      }
    }
  }
  // Textos que se traducen desde una variable (L(cat)): las categorías de funciones
  // y los idiomas y tonos de la IA (se guardan en español en la configuración)
  for (const key of ["Todas", "Matemáticas", "Estadística", "Lógicas", "Texto", "Fecha y hora", "Búsqueda", "Financieras",
    "inglés", "español", "francés", "alemán", "italiano", "portugués", "catalán", "chino", "japonés",
    "formal", "profesional", "cercano", "persuasivo", "académico", "sencillo"]) {
    if (!catalog.has(key)) catalog.set(key, new Set(["components/sheet/SheetApp.tsx"]));
  }
  const sorted = Object.fromEntries([...catalog.keys()].sort((a, b) => a.localeCompare(b, "es")).map((k) => [k, [...catalog.get(k)].join(", ")]));
  writeFileSync(join(dir, "catalog.json"), JSON.stringify(sorted, null, 1) + "\n");
}
console.log(`\n${total} textos envueltos; ${catalog.size} textos distintos.${WRITE ? "" : " (simulación: usa --write)"}`);
