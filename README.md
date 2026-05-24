# Casamiento RSVP

App estática (React + Vite + Tailwind) para que los invitados confirmen
asistencia y vos veas el resumen desde un admin protegido con una contraseña
compartida.

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
3. Cambiá la constante `ADMIN_PASSPHRASE` por una palabra que solo vos sepas.
4. Guardá (💾). Elegí la función `setup` en el dropdown y dale **Run** (▶).
   Te va a pedir permisos la primera vez: aceptá. Eso crea las pestañas
   `guests` y `rsvps` con los headers correctos.
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
  date: "15 de marzo de 2026",
  // …
};
```

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

| id | name | plusOnes (int) | invitationSent (bool) | contact | notes |

Pestaña `rsvps` (la escribe el Apps Script):

| timestamp | guestId | response (`accept`/`decline`) | partySize | comment |
