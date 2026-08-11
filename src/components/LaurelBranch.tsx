/**
 * Ornamento de laurel de los laterales.
 *
 * El dibujo NO vive acá: vive en `public/laurel-left.svg` y
 * `public/laurel-right.svg`. Para cambiarlo, pisá esos archivos. Si el que
 * pongas tiene otra proporción, actualizá RATIO con la de su viewBox.
 *
 * Son las dos mitades reales de la corona, no una espejada, así que las
 * hojas caen distinto de cada lado como en el original.
 *
 * El SVG se usa como máscara y no como imagen: sus colores internos son
 * irrelevantes y la silueta se tiñe con la clase del punto de uso.
 *
 * El alto sale de estirarse en su fila flex (`items-stretch`), así iguala al
 * del texto que flanquea en cualquier resolución. El ancho NO puede salir de
 * un aspect-ratio: flex resuelve el ancho antes que el alto, así que el ancho
 * quedaría en cero. Se le da un ancho propio con holgura y `mask-size:
 * contain` ajusta el dibujo al alto disponible, que es la dimensión que
 * importa, y lo centra.
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
      className={`block shrink-0 w-[clamp(1.5rem,5.4vw,3.2rem)] bg-current ${className ?? ""}`}
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
