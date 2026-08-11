# Clonar la app de casamiento para Seba & Emi

Fecha: 2026-08-11
Estado: aprobado para planificar

## Objetivo

Poner online una invitación con RSVP para el casamiento de Seba & Emi,
reutilizando la app de `casamiento` sin que ellos tengan que pagar dominio ni
contratar hosting. La app nueva vive en un repo propio y evoluciona por
separado.

## Contexto

`casamiento` es una SPA estática (React 19 + Vite + Tailwind 4) con dos rutas:
`/?id=XXX` para el invitado y `/admin` protegido por passphrase. El backend es
un Google Apps Script bound al Sheet, deployado como Web App. El deploy es
automático a GitHub Pages vía `.github/workflows/deploy.yml`, con dominio
custom declarado en `public/CNAME`.

El evento de Seba & Emi no encaja en el molde actual en dos puntos: tiene **dos
eventos** (ceremonia civil y fiesta, en días distintos) y **dos cuentas
bancarias** para regalos. La app hoy modela uno de cada.

## Decisiones tomadas

| Decisión | Elección | Por qué |
|---|---|---|
| Estrategia de copia | Clon independiente con historial | Los dos eventos van a divergir. Un monorepo acoplaría cambios de ellos al repo de Juan. |
| Cuenta de GitHub | `juan-manuel-rodriguez` | GitHub bloquea usar un dominio verificado desde otra cuenta; mantener todo en una evita ese problema. |
| Repo | `casamiento-vieja` | Elegido por el usuario. |
| URL | `sebayemi.noscasamos.lat` | Subdominio gratis del dominio existente. Corto y dictable por teléfono. |
| RSVP | Una sola confirmación | El civil es martes 11:30; no necesitan headcount. Evita tocar el Sheet, el admin y el seating. |
| Spotify | Reusar la app de Spotify de Juan | Es client-credentials para buscar tracks, no toca cuentas de usuario. Ahorra un signup. |
| Sheet | Lo crea y lo posee Juan, compartido con ellos como editores | Juan necesita acceso de editor para configurar Script Properties. |

## Arquitectura

Sin cambios respecto a `casamiento`: frontend estático en GitHub Pages, backend
en Apps Script, datos en un Google Sheet. Lo único nuevo es un segundo juego de
las tres piezas y un registro DNS.

```
sebayemi.noscasamos.lat
   │  CNAME → juan-manuel-rodriguez.github.io
   ▼
GitHub Pages ← Actions ← repo casamiento-vieja
   │  fetch APPS_SCRIPT_URL
   ▼
Apps Script Web App (nuevo deployment) → Sheet nuevo
```

## Trabajo

### Fase 1 — Generalizar `casamiento` (upstream)

Tres datos están hardcodeados fuera de `src/config.ts`. Se generalizan **en el
repo original primero**, expresando los datos de Juan en las formas nuevas, para
que ambos repos compartan el mismo código y los cherry-picks futuros no
conflictúen. En `casamiento` el cambio es estructural, no funcional: la página
tiene que renderizar exactamente lo mismo que antes.

**1.1 — Lados de la invitación.** Los valores `"vale"` y `"juan"` aparecen en
`src/routes/Admin.tsx` (el tipo de `side` en L52, el `<select>` en L368, los
chips de filtro en L436, `sideLabel()` en L952) y en la validación de
`apps-script/Code.gs` L615.

Pasan a `EVENT.sides: readonly { value: string; label: string }[]`. El tipo de
`side` se vuelve `string`. `Code.gs` valida contra la lista de valores que le
llega en el request en lugar de dos strings fijos; si el valor no está en la
lista, guarda `''` como hoy.

**1.2 — Eventos.** `EVENT.date`, `time`, `venue`, `address` y `mapUrl` pasan a
`EVENT.events: readonly EventOccurrence[]`, donde cada ocurrencia tiene
`label`, `date`, `time`, `venue`, `address` y `mapUrl`. `EventDetails`
(`src/routes/Guest.tsx` L261) renderiza un `DetailTile` por ocurrencia.

`EVENT.date` sobrevive como campo aparte: es la fecha principal que usan
`CoverScreen` (L200), `Hero` (L238) y `Greeting`. Para Juan es la misma y única
fecha; para Seba & Emi es la de la fiesta.

**1.3 — Cuentas de regalo.** `EVENT.giftBank`, `giftAccountLabel`,
`giftAccountValue` y `giftAccountHolder` pasan a `EVENT.giftAccounts:
readonly GiftAccount[]` con `bank`, `label`, `value` y `holder`.
`GiftAccountSection` (L295) mapea sobre el array. El botón de copiar al
portapapeles queda por cuenta.

Criterio de aceptación de la fase: `npm run build && npm run lint` limpios y la
página del invitado con `?demo` visualmente idéntica a antes del cambio.

### Fase 2 — Crear `casamiento-vieja`

Clonar el repo con historial, `origin` al repo nuevo y `upstream` al original:

```
git clone https://github.com/juan-manuel-rodriguez/casamiento.git casamiento-vieja
git -C casamiento-vieja remote rename origin upstream
git -C casamiento-vieja remote add origin \
  https://github.com/juan-manuel-rodriguez/casamiento-vieja.git
```

El clon vive en `~/git/casamiento-vieja`, al lado del repo actual.

Archivos a cambiar:

- **`src/config.ts`** — los datos de abajo, en "Datos del evento".
- **`index.html`** — `<title>`, `og:title`, `og:description`, `og:url`,
  `og:site_name`, `og:image`, `twitter:*`. Todo apunta a
  `https://sebayemi.noscasamos.lat/`.
- **`public/CNAME`** — `sebayemi.noscasamos.lat`.
- **`public/og.png`** — 1200×630, regenerada con los nombres y la fecha de
  ellos. Se arma un HTML con la tipografía del sitio (Cormorant Garamond) y se
  captura con Chrome headless (`--headless --screenshot --window-size=1200,630`).
  Fallback si Chrome falla: `rsvg-convert` sobre un SVG equivalente.
- **`README.md`** — reemplazar las referencias a `noscasamos.lat` y al Sheet de
  Juan por las de ellos.
- **`public/favicon.svg`** — sin cambios; es un rombo ornamental sin iniciales.

`vite.config.ts` y `.github/workflows/deploy.yml` no se tocan: el dominio custom
sirve desde la raíz, así que `BASE_PATH=/` sigue siendo correcto.

### Fase 3 — Backend

1. Crear el Sheet, compartirlo con Seba & Emi como editores.
2. Extensiones → Apps Script, pegar `apps-script/Code.gs`.
3. Script Properties: `ADMIN_PASSPHRASE` (nueva, distinta de la de Juan),
   `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` (los mismos de Juan).
4. Correr `setup` y aceptar los permisos. Crea las pestañas `guests` y
   `songRecommendations`.
5. Deploy → New deployment → Web app, *Execute as: Me*, *Who has access:
   Anyone*. Copiar la URL `/exec` a `APPS_SCRIPT_URL` en `src/config.ts`.

### Fase 4 — DNS y Pages

1. En el DNS de `noscasamos.lat`, agregar:
   `sebayemi  CNAME  juan-manuel-rodriguez.github.io.`
2. En el repo nuevo: Settings → Pages → Custom domain →
   `sebayemi.noscasamos.lat`, y esperar a que GitHub emita el certificado.
   Activar *Enforce HTTPS*.

El apex `noscasamos.lat` no se toca. Para GitHub Pages el apex y el subdominio
son dominios distintos y cada uno puede vivir en un repo distinto de la misma
cuenta.

### Fase 5 — Verificación

- `npm run build && npm run lint` limpios en ambos repos.
- `https://sebayemi.noscasamos.lat/?demo` renderiza sin backend, con los dos
  eventos y las dos cuentas.
- Desde `/admin`: entrar con la passphrase nueva, cargar un invitado de prueba,
  copiar su link, confirmar desde el link, ver la fila actualizada en el Sheet
  y en el resumen del admin.
- Buscar y recomendar una canción; verificar que aparece en
  `songRecommendations`.
- Borrar el invitado de prueba.

## Datos del evento

Fuente: la invitación que mandaron. El año es **2026**: el 20/10/2026 cae martes
y el 23/10/2026 cae viernes, y coincide con los días que indicaron.

```
couple:        Seba & Emi
date:          23 de octubre de 2026        (la fiesta; es la fecha principal)
shortDate:     23.10.26
rsvpDeadline:  20 de setiembre

events:
  - Ceremonia civil · Martes 20 de octubre de 2026 · 11:30 hs
    Municipio de Salinas, Salinas, Canelones
  - Fiesta · Viernes 23 de octubre de 2026 · 20:30 hs
    Parque Policial Solymar, Solymar, Canelones

dressCode: Formal

giftMessage: Su presencia y sus buenos deseos son un regalo invaluable. Si
             igual quieren hacernos un regalo, estas son nuestras mejores
             opciones.
giftAccounts:
  - PREX · Cuenta en pesos    · 1325987          · Sebastián Consonni
  - BROU · Cuenta en dólares  · 001404446-00003  · Sebastián Consonni

sides: seba → "Seba", emi → "Emi"
```

Textos de la invitación que se reutilizan tal cual: "Nos casamos" y "Queremos
que seas parte de nuestra historia" en la portada/hero, y "La fiesta comenzará
puntualmente y queremos que disfrutes con nosotros de cada detalle" como nota
en el tile de la fiesta.

Los `mapUrl` se construyen como búsquedas de Google Maps
(`https://www.google.com/maps/search/?api=1&query=...`) en lugar de links
cortos `maps.app.goo.gl`, porque no requieren que nadie los genere a mano y
resuelven bien para ambos lugares.

Las listas de vestimenta (`dressCodeWomen`, `dressCodeMen`, `dressCodeAvoid`)
van como borrador coherente con "Formal" en Uruguay, para que Seba & Emi las
revisen y ajusten. La invitación no las especifica.

## Pendientes de ellos

Ninguno bloquea el deploy. Se resuelven editando `src/config.ts` después.

1. **Canción de Spotify.** `spotifyTrackUrl` arranca vacío. Consecuencia
   concreta: con el campo vacío, `Guest.tsx` L43 evalúa `entered = !trackId` y
   **la portada no se muestra** — el invitado entra directo al hero. La portada
   existe para que un click del usuario habilite el autoplay. Si quieren la
   portada, tienen que elegir un tema.
2. **Foto del hero.** `photoUrl` arranca vacío y cae al hero CSS-only, que es
   el comportamiento actual del repo de Juan.
3. **Vestimenta.** Confirmar el borrador, y si "Formal" aplica también al civil
   de las 11:30 de un martes o solo a la fiesta. Por ahora el tile se muestra
   una vez, sin distinguir por evento.

## Riesgos

- **Verificación de dominio en GitHub.** Si `noscasamos.lat` está verificado en
  la cuenta de Juan, el subdominio funciona sin fricción desde esa misma cuenta.
  Si en el futuro el repo se transfiere a la cuenta de ellos, el subdominio deja
  de resolver hasta desverificar o verificar del otro lado.
- **Propagación DNS.** El certificado de GitHub puede tardar hasta ~1h desde que
  el CNAME resuelve. No es un error, es espera.
- **Divergencia de repos.** Las fases 1.1–1.3 existen justamente para que el
  código quede idéntico entre los dos repos el día 1. Cuanto más se demore en
  aplicar la fase 1 upstream, más caro el primer cherry-pick.
