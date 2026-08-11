# Casamiento Seba & Emi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poner online `sebayemi.noscasamos.lat` — una copia de la app de casamiento adaptada a Seba & Emi — sin que ellos paguen dominio ni hosting.

**Architecture:** Primero se generaliza el repo `casamiento` para que los datos que hoy están hardcodeados (lados de invitación, evento único, cuenta bancaria única) vivan en `src/config.ts`. Recién después se clona a `casamiento-vieja`, donde el único cambio de código es el config. Backend nuevo (Sheet + Apps Script), URL vía CNAME al dominio existente.

**Tech Stack:** React 19, Vite 8, Tailwind 4, TypeScript 6, Google Apps Script, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-11-casamiento-vieja-design.md`

---

## Nota sobre verificación (leer antes de empezar)

Este repo **no tiene framework de tests** y no se agrega uno: el usuario definió
el listón como `npm run build && npm run lint` limpios. En su lugar, la Parte A
—que es un refactor que debe ser visualmente inocuo— se verifica con **diff de
screenshots**: se captura la página del invitado antes del refactor y se compara
píxel a píxel después de cada tarea. Ese es el test que atrapa las regresiones
reales acá.

Herramientas ya verificadas como disponibles: `magick` (ImageMagick 7),
`rsvg-convert`, Chrome en `/Applications/Google Chrome.app`, Node v22.

**Antes del primer comando**, exportar el scratchpad de la sesión, que es a
donde van todos los archivos temporales del plan (`$SCRATCH` abajo):

```bash
export SCRATCH="$(mktemp -d)"
echo "$SCRATCH"
```

Los `npm run dev &` de las Tasks 1 y 7 quedan corriendo en background. Matarlos
al terminar cada parte con `pkill -f "vite"`, y volver a levantar el que
corresponda: si quedan dos, el segundo toma el puerto 5174 y las capturas
apuntan al proyecto equivocado.

---

# Parte A — Generalizar `casamiento`

Trabajo en `~/git/casamiento`, rama `generalize-config`.

## Task 1: Baseline visual

**Files:**
- Create: `$SCRATCH/shot.sh`

- [ ] **Step 1: Crear la rama**

```bash
cd ~/git/casamiento
git switch -c generalize-config
```

- [ ] **Step 2: Escribir el script de captura**

Guardarlo en el scratchpad de la sesión (no en el repo). `$1` es el nombre de
salida.

```bash
#!/usr/bin/env bash
# Captura la página del invitado en modo demo contra el dev server.
set -euo pipefail
OUT="$1"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --virtual-time-budget=8000 \
  --window-size=1280,4000 \
  --screenshot="$OUT" \
  "http://localhost:5173/?demo"
echo "escrito: $OUT"
```

```bash
chmod +x $SCRATCH/shot.sh
```

- [ ] **Step 3: Levantar el dev server y capturar el baseline**

```bash
cd ~/git/casamiento && npm install && npm run dev &
sleep 5
$SCRATCH/shot.sh $SCRATCH/before.png
```

Expected: `before.png` de 1280×4000, mostrando el hero "Juan Manuel &
Valentina", los tiles Cuándo/Dónde/Dress code/Confirmar, y la sección de
regalo con "Banco BBVA".

- [ ] **Step 4: Confirmar el baseline a ojo**

Abrir `before.png` y verificar que renderizó la página completa y no una
pantalla en blanco ni la portada de Spotify. Si aparece la portada ("Ver
invitación"), el modo demo no se activó: revisar que la URL lleve `?demo`.

## Task 2: Mover los lados de invitación a config

`"vale"` y `"juan"` aparecen en 6 lugares. Pasan a `EVENT.sides`.

**Files:**
- Modify: `src/config.ts`
- Modify: `src/api/guests.ts:8`, `src/api/guests.ts:46`
- Modify: `src/routes/Admin.tsx:52`, `:364-374`, `:429-439`, `:950-954`
- Modify: `apps-script/Code.gs:615`

- [ ] **Step 1: Agregar el tipo y el campo en `src/config.ts`**

Arriba del `export const EVENT`, agregar:

```ts
/** Quién invita a un invitado. `value` se guarda en el Sheet; `label` se muestra. */
export type InvitationSide = { value: string; label: string };
```

Y dentro de `EVENT`, después de `couple`:

```ts
  /** Los lados de la invitación. `value` en minúscula, sin espacios. */
  sides: [
    { value: "vale", label: "Vale" },
    { value: "juan", label: "Juan" },
  ] as readonly InvitationSide[],
```

- [ ] **Step 2: Aflojar el tipo en `src/api/guests.ts`**

En `Guest` (L8) y en `GuestInput` (L46), reemplazar:

```ts
  side: "vale" | "juan" | "";
```

por:

```ts
  /** Un `value` de EVENT.sides, o "" cuando no está asignado. */
  side: string;
```

- [ ] **Step 3: Aflojar el filtro en `src/routes/Admin.tsx:52`**

```ts
  /** "all", "unassigned", o un `value` de EVENT.sides. */
  side: string;
```

- [ ] **Step 4: Poblar el `<select>` del draft desde config (`Admin.tsx:364-374`)**

```tsx
            <DraftField label="Invita">
              <select
                className="admin-input"
                value={draft.side}
                onChange={(e) => setDraft({ ...draft, side: e.target.value })}
              >
                <option value="">Sin asignar</option>
                {EVENT.sides.map((side) => (
                  <option key={side.value} value={side.value}>
                    {side.label}
                  </option>
                ))}
              </select>
            </DraftField>
```

- [ ] **Step 5: Poblar los chips de filtro (`Admin.tsx:429-439`)**

```tsx
        <FilterSelect
          label="Invita"
          value={filters.side}
          onChange={(side) => setFilters({ ...filters, side })}
          options={[
            { value: "all", label: "Invita: todos" },
            ...EVENT.sides.map((side) => ({
              value: side.value,
              label: `Invita ${side.label}`,
            })),
            { value: "unassigned", label: "Sin asignar" },
          ]}
        />
```

- [ ] **Step 6: Reescribir `guestSideLabel` (`Admin.tsx:950-954`)**

```ts
function guestSideLabel(side: Guest["side"]) {
  return EVENT.sides.find((s) => s.value === side)?.label ?? "Sin asignar";
}
```

- [ ] **Step 7: Verificar que `EVENT` esté importado en `Admin.tsx`**

```bash
grep -n 'from "../config"' src/routes/Admin.tsx
```

Si no aparece `EVENT` en la lista de imports, agregarlo:

```ts
import { EVENT } from "../config";
```

- [ ] **Step 8: Sanitizar en vez de whitelistear en `apps-script/Code.gs:615`**

Reemplazar:

```js
  var side = String(input.side || '').trim().toLowerCase();
  if (side !== 'vale' && side !== 'juan') side = '';
```

por:

```js
  // La lista de lados vive en src/config.ts. Este endpoint pide auth de admin,
  // así que alcanza con normalizar y acotar el largo en vez de whitelistear.
  var side = String(input.side || '').trim().toLowerCase().slice(0, 32);
```

- [ ] **Step 9: Verificar build, lint y píxeles**

```bash
cd ~/git/casamiento && npm run build && npm run lint
$SCRATCH/shot.sh $SCRATCH/after-sides.png
magick compare -metric AE $SCRATCH/before.png $SCRATCH/after-sides.png null: 2>&1
```

Expected: build y lint sin errores, y la comparación imprime `0`. La página del
invitado no toca `sides`, así que cualquier número distinto de 0 es una
regresión que hay que investigar antes de seguir.

- [ ] **Step 10: Commit**

```bash
git add src/config.ts src/api/guests.ts src/routes/Admin.tsx apps-script/Code.gs
git commit -m "refactor: mover los lados de la invitación a EVENT.sides"
```

## Task 3: Modelar el evento como una lista

**Files:**
- Modify: `src/config.ts`
- Modify: `src/routes/Guest.tsx:1` (import), `:212-244` (Hero), `:261-293` (EventDetails)

- [ ] **Step 1: Agregar el tipo en `src/config.ts`**

```ts
/** Una ocurrencia del casamiento: civil, fiesta, etc. */
export type EventOccurrence = {
  /** Etiqueta corta; solo se muestra cuando hay más de una ocurrencia. */
  label: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  mapUrl: string;
  /** Línea extra opcional dentro del tile de "Cuándo". */
  note?: string;
};
```

- [ ] **Step 2: Reemplazar los campos sueltos en `EVENT`**

Borrar `time`, `venue`, `address` y `mapUrl` del objeto. **`date` se queda**:
es la fecha del titular (hero y portada), distinta en formato de la del tile.
En su lugar agregar:

```ts
  /** Las ocurrencias en orden cronológico. La última es la principal. */
  events: [
    {
      label: "Fiesta",
      date: "3 de octubre de 2026",
      time: "20:00 hs",
      venue: "Verne Restó & Eventos",
      address: "Rambla Costanera M29 S09, Ciudad de la Costa, Canelones",
      mapUrl: "https://maps.app.goo.gl/SFZL2KjHdDynPJYC6",
    },
  ] as readonly EventOccurrence[],
```

- [ ] **Step 3: Exportar la ocurrencia principal**

Al final de `src/config.ts`:

```ts
/** La ocurrencia que titula la página: la última, o sea la fiesta. */
export const MAIN_EVENT = EVENT.events[EVENT.events.length - 1];
```

- [ ] **Step 4: Actualizar los imports de `Guest.tsx:1` y `:9`**

```ts
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
```

```ts
import { EVENT, MAIN_EVENT } from "../config";
```

- [ ] **Step 5: Apuntar el `Hero` a la ocurrencia principal (`Guest.tsx:240`)**

Reemplazar `<span>{EVENT.venue}</span>` por:

```tsx
        <span>{MAIN_EVENT.venue}</span>
```

`EVENT.date` en L238 no se toca.

- [ ] **Step 6: Reescribir `EventDetails` (`Guest.tsx:261-293`)**

El sufijo con la etiqueta aparece **solo si hay más de una ocurrencia**, así
la página de un evento único queda idéntica al píxel.

```tsx
function EventDetails() {
  const multi = EVENT.events.length > 1;
  return (
    <Section wide>
      <Eyebrow>El plan</Eyebrow>
      <h2 className="font-display italic font-normal text-4xl sm:text-5xl mb-8">Detalles del evento</h2>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 text-left">
        {EVENT.events.map((occurrence) => (
          <Fragment key={occurrence.label}>
            <DetailTile
              eyebrow={multi ? `Cuándo · ${occurrence.label}` : "Cuándo"}
              title={occurrence.date}
            >
              {occurrence.time && (
                <p className="text-sm text-muted m-0">A partir de las {occurrence.time}, por favor ser puntuales.</p>
              )}
              {occurrence.note && <p className="text-sm text-muted m-0">{occurrence.note}</p>}
            </DetailTile>
            <DetailTile
              eyebrow={multi ? `Dónde · ${occurrence.label}` : "Dónde"}
              title={occurrence.venue}
            >
              {occurrence.address && <p className="text-sm text-muted m-0">{occurrence.address}</p>}
              {occurrence.mapUrl && (
                <a
                  className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-gold-dark underline underline-offset-4 decoration-soft hover:text-ink transition-colors"
                  href={occurrence.mapUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <MapPinIcon />
                  ¿Cómo llego?
                </a>
              )}
            </DetailTile>
          </Fragment>
        ))}
        <DressCodeTile />
        <DetailTile eyebrow="Confirmar antes del" title={EVENT.rsvpDeadline}>
          <p className="text-sm text-muted m-0">Para que podamos organizar todo a tiempo.</p>
        </DetailTile>
      </div>
    </Section>
  );
}
```

- [ ] **Step 7: Verificar build, lint y píxeles**

```bash
cd ~/git/casamiento && npm run build && npm run lint
$SCRATCH/shot.sh $SCRATCH/after-events.png
magick compare -metric AE $SCRATCH/before.png $SCRATCH/after-events.png null: 2>&1
```

Expected: `0`. Si no da 0, generar el diff visual y mirarlo antes de seguir:

```bash
magick compare $SCRATCH/before.png $SCRATCH/after-events.png $SCRATCH/diff-events.png
```

- [ ] **Step 8: Commit**

```bash
git add src/config.ts src/routes/Guest.tsx
git commit -m "refactor: modelar el casamiento como una lista de ocurrencias"
```

## Task 4: Soportar varias cuentas de regalo

**Files:**
- Modify: `src/config.ts`
- Modify: `src/routes/Guest.tsx:295-321`

- [ ] **Step 1: Agregar el tipo en `src/config.ts`**

```ts
/** Una cuenta a la que se puede transferir el regalo. */
export type GiftAccount = {
  /** Texto completo del chip, ej. "Banco BBVA" o "PREX". */
  bank: string;
  label: string;
  value: string;
  holder: string;
};
```

- [ ] **Step 2: Reemplazar los cuatro campos sueltos en `EVENT`**

Borrar `giftBank`, `giftAccountLabel`, `giftAccountValue` y
`giftAccountHolder`. En su lugar:

```ts
  giftAccounts: [
    {
      bank: "Banco BBVA",
      label: "Cuenta única",
      value: "22975926",
      holder: "Juan Rodríguez",
    },
  ] as readonly GiftAccount[],
```

- [ ] **Step 3: Reescribir `GiftAccountSection` (`Guest.tsx:295-321`)**

```tsx
function GiftAccountSection() {
  return (
    <Section>
      <Eyebrow>Regalo</Eyebrow>
      <div className="bg-white border border-bone rounded-2xl shadow-md p-8 sm:p-12 mt-6 text-center">
        <h2 className="font-display italic font-normal text-4xl sm:text-5xl mb-4">Lista de regalos</h2>
        <p className="text-muted max-w-prose mx-auto mb-6">{EVENT.giftMessage}</p>
        <div className="max-w-sm mx-auto grid gap-10">
          {EVENT.giftAccounts.map((account) => (
            <div key={account.value}>
              <p className="inline-flex items-center rounded-full border border-sand bg-soft/60 px-5 py-1.5 mb-5 text-[0.78rem] uppercase tracking-[0.2em] text-gold-dark font-medium">
                {account.bank}
              </p>
              <div className="flex flex-col items-center gap-2 rounded-xl border border-bone bg-cream/40 px-6 py-5">
                <span className="text-[0.78rem] uppercase tracking-[0.22em] text-subtle font-medium">
                  {account.label}
                </span>
                <span className="font-sans text-xl sm:text-2xl tracking-[0.06em] text-ink tabular-nums">
                  {account.value}
                </span>
              </div>
              <p className="text-[0.8rem] text-subtle mt-3">
                La cuenta está a nombre de {account.holder}.
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Verificar build, lint y píxeles**

```bash
cd ~/git/casamiento && npm run build && npm run lint
$SCRATCH/shot.sh $SCRATCH/after-gifts.png
magick compare -metric AE $SCRATCH/before.png $SCRATCH/after-gifts.png null: 2>&1
```

Expected: `0`. Con una sola cuenta el `grid gap-10` no aplica y el chip queda
centrado igual que antes por el `text-center` del contenedor padre.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/routes/Guest.tsx
git commit -m "refactor: soportar varias cuentas de regalo"
```

## Task 5: Actualizar el README y mergear

**Files:**
- Modify: `README.md` (bloque de ejemplo de `src/config.ts`)

- [ ] **Step 1: Actualizar el ejemplo del README**

Reemplazar el bloque ```ts de la sección "2. Configurar la app" por:

````markdown
```ts
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/.../exec";

export const EVENT = {
  couple: "Juana & Manuel",
  date: "15 de marzo de 2026",          // titular: hero y portada
  sides: [                               // quién invita a cada invitado
    { value: "juana", label: "Juana" },
    { value: "manuel", label: "Manuel" },
  ],
  events: [                              // una o más: civil, fiesta…
    { label: "Fiesta", date: "…", time: "…", venue: "…", address: "…", mapUrl: "…" },
  ],
  giftAccounts: [                        // una o más cuentas
    { bank: "Banco X", label: "Caja de ahorro", value: "123", holder: "Nombre" },
  ],
  spotifyTrackUrl: "https://open.spotify.com/track/...", // opcional
  // …
};
```

Si `spotifyTrackUrl` queda vacío, la portada con el botón "Ver invitación" no
se muestra: existe solo para que un click habilite el autoplay del reproductor.
````

- [ ] **Step 2: Verificar y commitear**

```bash
cd ~/git/casamiento && npm run build && npm run lint
git add README.md
git commit -m "docs: documentar la forma nueva de EVENT"
```

- [ ] **Step 3: Mergear a main y publicar**

```bash
git switch main && git merge --ff-only generalize-config && git push origin main
```

- [ ] **Step 4: Confirmar que el deploy pasó**

```bash
gh run list --limit 1
```

Expected: el run de "Deploy to GitHub Pages" en `completed / success`. Después,
abrir `https://noscasamos.lat/?demo` y confirmar que se ve igual que siempre.

---

# Parte B — Crear `casamiento-vieja`

## Task 6: Repo y clon

- [ ] **Step 1: Crear el repo vacío en GitHub**

```bash
gh repo create juan-manuel-rodriguez/casamiento-vieja --public \
  --description "Invitación y RSVP del casamiento de Seba & Emi"
```

- [ ] **Step 2: Clonar con historial y rewire de remotes**

```bash
cd ~/git
git clone https://github.com/juan-manuel-rodriguez/casamiento.git casamiento-vieja
cd ~/git/casamiento-vieja
git remote rename origin upstream
git remote add origin https://github.com/juan-manuel-rodriguez/casamiento-vieja.git
git remote -v
```

Expected: `origin` → `casamiento-vieja`, `upstream` → `casamiento`, cada uno con
fetch y push.

- [ ] **Step 3: Borrar el spec y el plan, que son de este repo**

```bash
cd ~/git/casamiento-vieja && rm -rf docs/superpowers && npm install
```

## Task 7: Config de Seba & Emi

**Files:**
- Modify: `~/git/casamiento-vieja/src/config.ts`

- [ ] **Step 1: Reemplazar el objeto `EVENT` completo**

`APPS_SCRIPT_URL` queda con el valor viejo por ahora; se cambia en la Task 13.
Los tipos (`InvitationSide`, `EventOccurrence`, `GiftAccount`) y `MAIN_EVENT` no
se tocan.

```ts
export const EVENT = {
  couple: "Seba & Emi",
  date: "23 de octubre de 2026",
  shortDate: "23.10.26",
  sides: [
    { value: "seba", label: "Seba" },
    { value: "emi", label: "Emi" },
  ] as readonly InvitationSide[],
  events: [
    {
      label: "Ceremonia civil",
      date: "Martes 20 de octubre de 2026",
      time: "11:30 hs",
      venue: "Municipio de Salinas",
      address: "Salinas, Canelones",
      mapUrl:
        "https://www.google.com/maps/search/?api=1&query=Municipio+de+Salinas+Canelones",
    },
    {
      label: "Fiesta",
      date: "Viernes 23 de octubre de 2026",
      time: "20:30 hs",
      venue: "Parque Policial Solymar",
      address: "Solymar, Canelones",
      mapUrl:
        "https://www.google.com/maps/search/?api=1&query=Parque+Policial+Solymar",
      note: "La fiesta comienza puntualmente: queremos que disfrutes con nosotros de cada detalle.",
    },
  ] as readonly EventOccurrence[],
  dressCode: "Formal",
  dressCodeDescription:
    "Una boda formal: es la ocasión para sacar del placard eso que casi nunca usás.",
  dressCodeWomen: [
    "Vestido largo o midi de fiesta",
    "Mono o traje de vestir elegante",
    "Sandalia de vestir o taco",
  ],
  dressCodeMen: [
    "Traje completo, preferentemente oscuro",
    "Camisa de vestir, con corbata o moño",
    "Zapatos de vestir de cuero",
  ],
  dressCodeAvoid: [
    "Jean o ropa deportiva",
    "Championes",
    "Remeras informales",
    "Blanco (es el color de la novia)",
  ],
  photoUrl: "",
  rsvpDeadline: "20 de setiembre",
  giftMessage:
    "Su presencia y sus buenos deseos son un regalo invaluable. Si igual quieren hacernos un regalo, estas son nuestras mejores opciones.",
  giftAccounts: [
    {
      bank: "PREX",
      label: "Cuenta en pesos",
      value: "1325987",
      holder: "Sebastián Consonni",
    },
    {
      bank: "BROU",
      label: "Cuenta en dólares",
      value: "001404446-00003",
      holder: "Sebastián Consonni",
    },
  ] as readonly GiftAccount[],
  /** Vacío a propósito: sin track no se muestra la portada. Ver README. */
  spotifyTrackUrl: "",
} as const;
```

- [ ] **Step 2: Verificar**

```bash
cd ~/git/casamiento-vieja && npm run build && npm run lint
```

Expected: sin errores. Si TypeScript se queja de que falta `venue` o `mapUrl`
en `EVENT`, es que quedó una referencia vieja en `Guest.tsx`: la Task 3 de la
Parte A debería haberlas eliminado todas.

- [ ] **Step 3: Revisar la página a ojo**

```bash
cd ~/git/casamiento-vieja && npm run dev &
sleep 5
$SCRATCH/shot.sh $SCRATCH/vieja.png
```

Expected en `vieja.png`: hero "Seba & Emi", **seis** tiles en la grilla
(Cuándo · Ceremonia civil, Dónde · Ceremonia civil, Cuándo · Fiesta, Dónde ·
Fiesta, Dress code, Confirmar antes del), y **dos** bloques de cuenta en la
sección de regalo. Sin portada, porque `spotifyTrackUrl` está vacío.

- [ ] **Step 4: Commit**

```bash
git add src/config.ts && git commit -m "feat: datos del casamiento de Seba & Emi"
```

## Task 8: Metadatos y dominio

**Files:**
- Modify: `~/git/casamiento-vieja/index.html:9-36`
- Modify: `~/git/casamiento-vieja/public/CNAME`

- [ ] **Step 1: Reemplazar las líneas 9 a 36 de `index.html`**

```html
    <title>Seba & Emi · 23 de octubre de 2026</title>
    <meta
      name="description"
      content="Nos casamos el 23 de octubre de 2026 en el Parque Policial Solymar. Confirmá tu asistencia desde el link que te mandamos."
    />

    <!-- Open Graph / WhatsApp / iMessage link preview -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://sebayemi.noscasamos.lat/" />
    <meta property="og:site_name" content="Seba & Emi" />
    <meta property="og:title" content="Seba & Emi · 23 de octubre de 2026" />
    <meta
      property="og:description"
      content="Nos casamos el 23 de octubre de 2026 en el Parque Policial Solymar."
    />
    <meta property="og:image" content="https://sebayemi.noscasamos.lat/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="es_UY" />

    <!-- Twitter Card (also picked up by some clients) -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Seba & Emi · 23 de octubre de 2026" />
    <meta
      name="twitter:description"
      content="Nos casamos el 23 de octubre de 2026 en el Parque Policial Solymar."
    />
    <meta name="twitter:image" content="https://sebayemi.noscasamos.lat/og.png" />
```

- [ ] **Step 2: Cambiar el dominio**

```bash
cd ~/git/casamiento-vieja && echo "sebayemi.noscasamos.lat" > public/CNAME
```

- [ ] **Step 3: Verificar y commitear**

```bash
cd ~/git/casamiento-vieja && npm run build && npm run lint
grep -r "noscasamos.lat" index.html public/CNAME
```

Expected: todas las ocurrencias con el prefijo `sebayemi.`, ninguna con el apex
pelado.

```bash
git add index.html public/CNAME
git commit -m "feat: metadatos y dominio de sebayemi.noscasamos.lat"
```

## Task 9: Imagen de preview

**Files:**
- Create: `$SCRATCH/og.html`
- Modify: `~/git/casamiento-vieja/public/og.png`

- [ ] **Step 1: Escribir la tarjeta**

Usa la misma paleta y tipografía del sitio (crema `#f8f3ea`, tinta `#2e2a24`,
dorado `#9c7a3c`, Cormorant Garamond).

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,400&family=Inter:wght@400;500&display=swap"
    />
    <style>
      * { margin: 0; box-sizing: border-box; }
      body {
        width: 1200px; height: 630px; display: flex; flex-direction: column;
        align-items: center; justify-content: center; text-align: center;
        font-family: "Inter", sans-serif; color: #2e2a24;
        background:
          radial-gradient(ellipse at 20% 0%, rgba(234,217,184,0.85) 0%, transparent 55%),
          radial-gradient(ellipse at 80% 100%, rgba(234,217,184,0.6) 0%, transparent 60%),
          linear-gradient(180deg, #f8f3ea 0%, #f1ebdd 100%);
      }
      .eyebrow { font-size: 18px; letter-spacing: .22em; text-transform: uppercase; color: #7a7266; font-weight: 500; }
      h1 { font-family: "Cormorant Garamond", serif; font-style: italic; font-weight: 400; font-size: 132px; line-height: .95; margin: 28px 0; }
      .rule { display: flex; align-items: center; gap: 14px; width: 320px; color: #d8cbb0; margin: 8px 0 28px; }
      .rule span { flex: 1; height: 1px; background: currentColor; }
      .rule svg { color: #9c7a3c; }
      .date { font-size: 20px; letter-spacing: .18em; text-transform: uppercase; color: #7a7266; }
    </style>
  </head>
  <body>
    <p class="eyebrow">Nos casamos</p>
    <h1>Seba &amp; Emi</h1>
    <div class="rule">
      <span></span>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 2 L22 12 L12 22 L2 12 Z" />
      </svg>
      <span></span>
    </div>
    <p class="date">23 de octubre de 2026 · Parque Policial Solymar</p>
  </body>
</html>
```

- [ ] **Step 2: Renderizar a PNG**

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --virtual-time-budget=6000 \
  --window-size=1200,630 \
  --screenshot="$HOME/git/casamiento-vieja/public/og.png" \
  "file://$SCRATCH/og.html"
```

- [ ] **Step 3: Verificar dimensiones y contenido**

```bash
magick identify ~/git/casamiento-vieja/public/og.png
```

Expected: `PNG 1200x630`. Abrir la imagen y confirmar que "Seba & Emi" está en
Cormorant Garamond itálica y no en una serif de fallback. Si salió con fallback,
subir `--virtual-time-budget` a 15000 y repetir: las fuentes de Google no
llegaron a cargar.

- [ ] **Step 4: Commit**

```bash
cd ~/git/casamiento-vieja
git add public/og.png && git commit -m "feat: imagen de preview de Seba & Emi"
```

## Task 10: README

**Files:**
- Modify: `~/git/casamiento-vieja/README.md`

- [ ] **Step 1: Reemplazar el título y el primer párrafo**

```markdown
# Casamiento Seba & Emi

App estática (React + Vite + Tailwind) para que los invitados confirmen
asistencia y Seba & Emi vean el resumen desde un admin protegido con una
contraseña compartida. Vive en https://sebayemi.noscasamos.lat.

Es un fork de [casamiento](https://github.com/juan-manuel-rodriguez/casamiento);
ese repo está como remote `upstream` para poder traer arreglos con
`git cherry-pick`.
```

- [ ] **Step 2: Actualizar el bloque de ejemplo de config**

Reemplazar los valores del ejemplo por `couple: "Seba & Emi"` y
`date: "23 de octubre de 2026"`.

- [ ] **Step 3: Commit y primer push**

```bash
cd ~/git/casamiento-vieja
git add README.md && git commit -m "docs: README de Seba & Emi"
git push -u origin main
```

## Task 11: Activar Pages

- [ ] **Step 1: Habilitar Pages por GitHub Actions**

```bash
gh api -X POST repos/juan-manuel-rodriguez/casamiento-vieja/pages \
  -f 'build_type=workflow' || \
gh api -X PUT repos/juan-manuel-rodriguez/casamiento-vieja/pages \
  -f 'build_type=workflow'
```

Si la API falla, hacerlo a mano: Settings → Pages → Source: **GitHub Actions**.

- [ ] **Step 2: Correr el workflow y esperar**

```bash
cd ~/git/casamiento-vieja
gh workflow run "Deploy to GitHub Pages"
gh run watch
```

Expected: `completed / success`.

- [ ] **Step 3: Verificar en la URL de github.io antes de tocar DNS**

```bash
curl -sI https://juan-manuel-rodriguez.github.io/casamiento-vieja/ | head -1
```

Nota: con `public/CNAME` apuntando al subdominio, GitHub puede redirigir esta
URL al dominio custom, que todavía no resuelve. Un 301 hacia
`sebayemi.noscasamos.lat` acá es señal de que el deploy salió bien; se termina
de verificar en la Task 15.

---

# Parte C — Backend

## Task 12: Sheet y Apps Script

Pasos manuales en el navegador. No hay comandos que automaticen esto.

- [ ] **Step 1: Crear el Sheet**

Nuevo Google Sheet llamado "Casamiento Seba & Emi", desde la cuenta de Juan.
Compartirlo con Seba & Emi como **editores**.

- [ ] **Step 2: Pegar el Apps Script**

Extensiones → Apps Script. Borrar el archivo de ejemplo y pegar el contenido
completo de `~/git/casamiento-vieja/apps-script/Code.gs`.

- [ ] **Step 3: Cargar las Script Properties**

⚙ Project Settings → Script Properties. Tres filas:

| Key | Valor |
|---|---|
| `ADMIN_PASSPHRASE` | una contraseña nueva, distinta de la del casamiento de Juan |
| `SPOTIFY_CLIENT_ID` | el mismo valor que en el script de `casamiento` |
| `SPOTIFY_CLIENT_SECRET` | el mismo valor que en el script de `casamiento` |

Los valores de Spotify se leen del script viejo: abrir el Apps Script de
`casamiento` → ⚙ Project Settings → Script Properties y copiarlos.

- [ ] **Step 4: Correr `setup`**

Guardar (💾), elegir `setup` en el dropdown de funciones y darle Run (▶).
Aceptar los permisos que pide.

Expected: aparecen las pestañas `guests` y `songRecommendations` con sus
headers. La pestaña `guests` tiene 13 columnas, de `id` a `side`.

- [ ] **Step 5: Deployar como Web App**

Deploy → New deployment → ⚙️ → Web app. *Execute as:* **Me**. *Who has
access:* **Anyone**. Copiar la Web app URL, que termina en `/exec`.

## Task 13: Conectar el frontend al backend

**Files:**
- Modify: `~/git/casamiento-vieja/src/config.ts:6`

- [ ] **Step 1: Pegar la URL**

```ts
export const APPS_SCRIPT_URL = "<la URL /exec de la Task 12 Step 5>";
```

- [ ] **Step 2: Confirmar que no quedó la URL de Juan**

```bash
cd ~/git/casamiento-vieja
grep -n "AKfycbxAuHHq2B5" src/config.ts && echo "ERROR: quedó la URL vieja" || echo "OK"
```

Expected: `OK`. Si imprime el error, la URL no se reemplazó y el sitio de ellos
escribiría en el Sheet de Juan.

- [ ] **Step 3: Verificar, commitear y deployar**

```bash
npm run build && npm run lint
git add src/config.ts
git commit -m "feat: apuntar al Apps Script de Seba & Emi"
git push
gh run watch
```

---

# Parte D — DNS y verificación

## Task 14: Subdominio

- [ ] **Step 1: Crear el registro CNAME**

En el panel DNS de `noscasamos.lat`, agregar:

| Tipo | Host | Valor | TTL |
|---|---|---|---|
| CNAME | `sebayemi` | `juan-manuel-rodriguez.github.io.` | automático |

- [ ] **Step 2: Esperar a que resuelva**

```bash
dig +short sebayemi.noscasamos.lat
```

Expected: la cadena que termina en una IP de GitHub Pages (`185.199.10x.153`).
Si devuelve vacío, esperar y repetir; la propagación puede tardar minutos.

- [ ] **Step 3: Declarar el dominio en Pages**

Settings → Pages → Custom domain → `sebayemi.noscasamos.lat` → Save. GitHub
corre el chequeo de DNS y emite el certificado. Cuando aparezca disponible,
tildar **Enforce HTTPS**.

- [ ] **Step 4: Verificar HTTPS**

```bash
curl -sI https://sebayemi.noscasamos.lat/ | head -1
```

Expected: `HTTP/2 200`. Un error de certificado significa que Let's Encrypt
todavía no emitió; puede tardar hasta una hora.

## Task 15: Verificación end-to-end

- [ ] **Step 1: Página pública sin backend**

Abrir `https://sebayemi.noscasamos.lat/?demo`.

Expected: hero "Seba & Emi", los dos eventos con sus tiles y sus links de mapa,
el modal de dress code al tocar "¿Qué me pongo?", y las dos cuentas en la
sección de regalo.

- [ ] **Step 2: Preview del link**

Mandarse el link por WhatsApp a uno mismo.

Expected: la tarjeta muestra `og.png` con "Seba & Emi" y el título con la fecha.
Si sale sin imagen, el CDN de WhatsApp cacheó un fallo previo: probar con
`?v=2` al final de la URL.

- [ ] **Step 3: Admin**

Abrir `https://sebayemi.noscasamos.lat/admin`, entrar con la passphrase de la
Task 12. Cargar un invitado de prueba con nombre "Prueba", 2 adultos, 1 niño,
lado "Seba".

Expected: la fila aparece en la tabla, y en el Sheet en la pestaña `guests` con
`side` = `seba`.

- [ ] **Step 4: RSVP**

Copiar el link del invitado de prueba, abrirlo en una ventana privada,
confirmar 2 adultos y 1 niño con un comentario.

Expected: pantalla de agradecimiento; en el Sheet, `response` = `accept`,
`adultsConfirmed` = 2, `kidsConfirmed` = 1 y `rsvpTimestamp` con fecha. En el
admin, el resumen cuenta 3 personas.

- [ ] **Step 5: Recomendación de canción**

Desde el mismo link, buscar una canción y recomendarla.

Expected: aparece una fila en la pestaña `songRecommendations` y en la solapa
"Canciones" del admin. Si la búsqueda tira error, las Script Properties de
Spotify están mal cargadas.

- [ ] **Step 6: Limpiar**

Borrar el invitado "Prueba" desde el admin y su fila de
`songRecommendations` a mano en el Sheet.

- [ ] **Step 7: Confirmar que el casamiento de Juan sigue sano**

```bash
curl -sI https://noscasamos.lat/ | head -1
```

Expected: `HTTP/2 200`. Abrir `https://noscasamos.lat/?demo` y confirmar que
sigue mostrando un solo evento y una sola cuenta.

- [ ] **Step 8: Entregar**

Pasarle a Seba & Emi: la URL, la passphrase del admin, el link al Sheet, y los
tres pendientes del spec (canción de Spotify, foto del hero, revisión de las
listas de vestimenta).
