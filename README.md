# Casamiento RSVP

App estática (React + Vite) para que los invitados confirmen asistencia y vos
veas el resumen desde un admin protegido por Google.

## Arquitectura

- **Frontend**: React + Vite, dos rutas: `/?id=XXX` (invitado) y `/admin`.
- **Backend**: un Google Apps Script "container-bound" al Sheet, deployado como
  Web App. Maneja lecturas públicas mínimas, escritura de RSVPs y CRUD de
  invitados (este último validando el OAuth token contra `ADMIN_EMAILS`).
- **Auth admin**: Google Identity Services (OAuth implicit) en el browser. El
  token se manda al Apps Script, que verifica el email contra su lista de
  admins.

No hay servidor propio. El hosting puede ser cualquier estático (GitHub Pages,
Netlify, Vercel).

## Setup (una sola vez)

### 1. Apps Script

1. Abrí el Sheet → **Extensiones** → **Apps Script**.
2. Borrá el archivo de ejemplo y pegá el contenido de
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. Editá la constante `ADMIN_EMAILS` adentro del script con tus emails.
4. Guardá. Ejecutá la función `setup` una vez (te va a pedir permisos: aceptá).
   Eso crea las pestañas `invitados` y `respuestas` con los headers correctos.
5. **Deploy** → **New deployment** → tipo **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copiá la URL (termina en `/exec`) — la vas a pegar en `src/config.ts` como
   `APPS_SCRIPT_URL`.

Cuando cambies `Code.gs` después, hay que ir a **Deploy → Manage deployments →
Edit → New version** para que la URL pública sirva el código nuevo.

### 2. OAuth Client (solo para la vista admin)

1. [Google Cloud Console](https://console.cloud.google.com/) → crear (o reusar)
   un proyecto.
2. **APIs & Services → OAuth consent screen** → External, completar nombre y
   email. No hace falta publicar (queda en "Testing"); agregá tu email como
   test user.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   tipo **Web application**. En "Authorized JavaScript origins" agregá las
   URLs desde donde vas a servir la app (ej. `http://localhost:5173` para dev,
   y la URL del hosting).
4. Copiá el Client ID → va en `src/config.ts` como `GOOGLE_CLIENT_ID`.

### 3. Configurar la app

Editá `src/config.ts`:

```ts
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/.../exec";
export const GOOGLE_CLIENT_ID = "....apps.googleusercontent.com";
export const ADMIN_EMAILS = ["tu-email@gmail.com"]; // sincronizar con Code.gs
export const EVENTO = {
  pareja: "Juana & Manuel",
  fecha: "15 de Marzo, 2026",
  lugar: "Estancia La Linda",
  direccion: "Ruta 8, km 42",
};
```

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # compila a /dist
npm run preview  # sirve /dist
```

## Uso

- **Cargar invitados**: entrá a `/admin`, login con Google, usá el form
  "Agregar invitado". O editá el Sheet directamente (el script lee siempre lo
  último).
- **Mandar invitaciones**: click en "Copiar link" en la fila del invitado →
  pegá en WhatsApp/email. El link va a `/?id=<su-id>`.
- **Ver respuestas**: el panel del admin muestra el resumen y la última
  respuesta de cada invitado (si responden varias veces, gana la más nueva).

## Modelo de datos

Pestaña `invitados`:

| id (string) | nombre | acompanantes (int) | invitacionEnviada (bool) | contacto | notas |

Pestaña `respuestas` (la escribe el Apps Script):

| timestamp | id | respuesta (`acepto`/`no_puedo`) | cantidadConfirmados | comentario |
