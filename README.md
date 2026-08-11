# Casamiento Seba & Emi

App estática (React + Vite + Tailwind) para que los invitados confirmen
asistencia y Seba & Emi vean el resumen desde un admin protegido con una
contraseña compartida. Vive en <https://sebayemi.noscasamos.lat>.

Es un fork de [casamiento](https://github.com/juan-manuel-rodriguez/casamiento),
que quedó como remote `upstream`: los arreglos se traen con `git cherry-pick`.

## Arquitectura

- **Frontend**: React + Vite, dos rutas: `/?id=XXX` (invitado) y `/admin`.
- **Backend**: un Google Apps Script "container-bound" al Sheet, deployado como
  Web App. Maneja la lectura pública del invitado, la escritura del RSVP, y el
  CRUD del admin (este último validando una contraseña compartida).

Sin servidores propios. Sin Google Cloud. El hosting puede ser cualquier
estático (GitHub Pages, Netlify, Vercel).

## Setup (una sola vez)

### 1. Apps Script

1. Abrí el Sheet → **Extensiones → Apps Script**.
2. Borrá el archivo de ejemplo y pegá el contenido de
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. En ⚙ **Project Settings → Script Properties**, agregá `ADMIN_PASSPHRASE`.
4. Guardá (💾). Elegí la función `setup` en el dropdown y dale **Run** (▶).
   Te va a pedir permisos la primera vez: aceptá. Eso crea las pestañas
  `guests` y `songRecommendations` con los headers correctos.
5. **Deploy → New deployment** → ⚙️ → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copiá la **Web app URL** (termina en `/exec`) y pegala en `src/config.ts`
   como `APPS_SCRIPT_URL`.

Cuando cambies `Code.gs` después: **Deploy → Manage deployments → Edit → New
version → Deploy**. La URL se mantiene igual.

### 2. Configurar la app

Editá [`src/config.ts`](src/config.ts):

```ts
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/.../exec";

export const EVENT = {
  couple: "Juana & Manuel",
  date: "15 de marzo de 2026",          // titular: portada y hero
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
  spotifyTrackUrl: "https://open.spotify.com/track/...", // opcional: música de fondo
  // …
};
```

Cuando `events` tiene más de una entrada, los tiles de "Cuándo" y "Dónde" se
repiten por evento con la etiqueta como sufijo. Con una sola entrada dicen
"Cuándo" y "Dónde" a secas.

Si `spotifyTrackUrl` queda vacío no se muestra la portada con el botón "Ver
invitación": existe solo para que un click habilite el autoplay del reproductor.

### 3. Spotify (búsqueda de canciones)

1. [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Create app**.
2. Nombre cualquiera. **Redirect URI**: `http://127.0.0.1:5173/callback` (no se usa, pero Spotify lo pide). **API**: marcá Web API. **Save**.
3. En la página del app: copiá **Client ID** y, atrás del botón "View client secret", el **Client Secret**.
4. En el editor de Apps Script → ⚙ **Project Settings → Script Properties**, agregá dos rows: `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` con los valores que copiaste. Sobreviven a redeploys.

## Preview del link (og.png)

`public/og.png` es la tarjeta que muestran WhatsApp, Telegram e iMessage al
pegar el link. Se genera con Chrome headless a partir de un HTML; el fuente
está en el historial de la conversación, no en el repo.

**Al cambiarla hay que subir el `?v=` de `og:image` y `twitter:image` en
[`index.html`](index.html)**. WhatsApp cachea la preview por URL: si la URL no
cambia, sigue mostrando la imagen vieja aunque el archivo ya sea otro.

Los links de invitado son todos distintos (`/?id=XXX`), así que a quien todavía
no le mandaste el link le va a llegar la versión nueva igual. El cacheo solo
afecta a los links ya compartidos.

Para forzar el refresco de uno ya compartido: pegá la URL en el
[Sharing Debugger de Facebook](https://developers.facebook.com/tools/debug/) y
dale "Scrape Again".

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173/casamiento/
npm run build    # genera /dist
npm run preview  # sirve /dist
```

Para ver la página del invitado sin Sheet ni nada cableado, agregá `?demo`:
`http://localhost:5173/casamiento/?demo`.

## Uso

- **Cargar invitados**: entrá a `/admin`, ingresá la contraseña del Apps Script
  una vez (se guarda en el navegador), usá el form "Agregar invitado". También
  podés editar el Sheet a mano si querés.
- **Mandar invitaciones**: click en "Copiar link" en la fila del invitado →
  pegá en WhatsApp/email. El link va a `/?id=<su-id>`.
- **Ver respuestas**: el admin muestra el resumen y la última respuesta de cada
  invitado.

## Modelo de datos

Pestaña `guests`:

| id | name | adultSlots | kidSlots | invitationSent | response | adultsConfirmed | kidsConfirmed | comment | rsvpTimestamp | contact | notes | side |

Pestaña `songRecommendations` (la escribe el Apps Script):

| timestamp | guestId | trackId | trackName | artists | spotifyUrl |
