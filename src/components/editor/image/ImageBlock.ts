import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImageView } from "@/components/editor/image/ImageView";

/**
 * Imagen con ancho y ajuste al texto (izquierda / centrada / derecha).
 * Se puede arrastrar para moverla y redimensionar con los tiradores.
 */
export const ImageBlock = Image.extend({
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute("width") ?? (el as HTMLElement).style.width;
          const n = w ? parseInt(w, 10) : NaN;
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width, style: `width: ${attrs.width}px` } : {}),
      },
      align: {
        default: "center",
        parseHTML: (el) => {
          const a = el.getAttribute("data-align");
          if (a === "left" || a === "right" || a === "center") return a;
          const float = (el as HTMLElement).style.float;
          return float === "left" || float === "right" ? float : "center";
        },
        renderHTML: (attrs) => ({ "data-align": attrs.align }),
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView, {
      className: "image-node",
      // El contenedor exterior es el que flota para que el texto lo rodee
      attrs: ({ node }) => ({ "data-align": node.attrs.align as string }),
    });
  },
}).configure({ allowBase64: true, inline: false });
