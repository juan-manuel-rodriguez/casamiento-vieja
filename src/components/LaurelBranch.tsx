/**
 * Ornamento de laurel de los laterales.
 *
 * El dibujo NO vive acá: vive en `public/laurel-left.svg` y
 * `public/laurel-right.svg`. Para cambiarlo, pisá esos archivos y listo.
 *
 * Son las dos mitades reales de la corona, no una espejada, así que las
 * hojas caen distinto de cada lado como en el original.
 *
 * El SVG se usa como máscara y no como imagen: sus colores internos son
 * irrelevantes, la silueta se tiñe con la clase de Tailwind del punto de uso
 * (`text-brass/70`) y se escala con `contain`, así que entra cualquier
 * relación de aspecto sin deformarse.
 */
export function LaurelBranch({
  side,
  className,
}: {
  side: "left" | "right";
  className?: string;
}) {
  return (
    <span
      className={`block bg-current ${className ?? ""}`}
      style={{
        WebkitMaskImage: `url(/laurel-${side}.svg)`,
        maskImage: `url(/laurel-${side}.svg)`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
      aria-hidden="true"
    />
  );
}
