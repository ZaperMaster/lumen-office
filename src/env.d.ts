/** Versión de la app (de package.json), inyectada por Vite. */
declare const __APP_VERSION__: string;

/** Corrector ortográfico Hunspell (sin tipos propios) */
declare module "nspell" {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): NSpell;
  }
  export default function nspell(aff: string, dic: string): NSpell;
}
