/**
 * Ornamento de laurel de los laterales.
 *
 * El dibujo NO vive acá: vive en `public/laurel.svg`. Para cambiarlo, pisá
 * ese archivo con el SVG que quieras y listo, no hace falta tocar código.
 *
 * El SVG se usa como máscara, no como imagen, así que sus colores internos
 * son irrelevantes: solo importa la silueta, y el color sale de la clase de
 * Tailwind (`text-brass/70`). Se escala con `contain`, o sea que cualquier
 * relación de aspecto entra en la caja sin deformarse.
 *
 * La rama tiene que abrir hacia la derecha: el lado opuesto se espeja con
 * `-scale-x-100` en el punto de uso.
 *
 * El archivo actual es "Laurel-left.svg" de Leki, CC0 1.0 (dominio público):
 * https://commons.wikimedia.org/wiki/File:Laurel-left.svg
 */
const MASK = {
  WebkitMaskImage: "url(/laurel.svg)",
  maskImage: "url(/laurel.svg)",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
  WebkitMaskSize: "contain",
  maskSize: "contain",
} as const;

export function LaurelBranch({ className }: { className?: string }) {
  return (
    <span
      className={`block bg-current ${className ?? ""}`}
      style={MASK}
      aria-hidden="true"
    />
  );
}
