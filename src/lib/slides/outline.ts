import type { Slide } from "@/lib/slides/model";
import { makeSlide } from "@/lib/slides/templates";

/** Lee el esquema que escribe la IA: «# título», «## diapositiva» y «- punto». */
export function parseOutline(text: string): Slide[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const slides: Slide[] = [];
  let deckTitle = "";
  let subtitle = "";
  let curTitle: string | null = null;
  let bullets: string[] = [];
  const flush = () => {
    if (curTitle !== null) slides.push(makeSlide(bullets.length ? "content" : "section", curTitle, bullets.length ? bullets : undefined));
    curTitle = null;
    bullets = [];
  };
  for (const raw of lines) {
    const l = raw.replace(/\*\*/g, "");
    if (/^#\s+/.test(l) && !deckTitle) deckTitle = l.replace(/^#\s+/, "");
    else if (/^##+\s+/.test(l) || /^diapositiva\s*\d+[:.]/i.test(l)) {
      flush();
      curTitle = l.replace(/^##+\s+/, "").replace(/^diapositiva\s*\d+[:.]\s*/i, "");
    } else if (/^([-*•]|\d+[.)])\s+/.test(l)) {
      if (curTitle === null) curTitle = deckTitle || "Introducción";
      bullets.push(l.replace(/^([-*•]|\d+[.)])\s+/, ""));
    } else if (deckTitle && curTitle === null && !subtitle) subtitle = l;
  }
  flush();
  if (deckTitle) slides.unshift(makeSlide("title", deckTitle, subtitle || undefined));
  return slides;
}
