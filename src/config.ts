// Configuración de la app. Rellená estos valores cuando termines el setup
// descrito en el README. Nada de esto es secreto sensible:
// - APPS_SCRIPT_URL es la URL pública del Web App de Apps Script. Cualquiera
//   puede llamarla, pero las acciones de admin validan el OAuth token contra
//   ADMIN_EMAILS adentro del script.
// - GOOGLE_CLIENT_ID es público por diseño del flow OAuth de Google.
// - ADMIN_EMAILS define quién puede usar la vista admin. La validación real
//   pasa porque Apps Script chequea el email del token contra esta lista
//   (también hay que tenerla en apps-script/Code.gs).

// URL del Web App de Apps Script. Termina en /exec.
// Setup: ver apps-script/Code.gs paso 4.
export const APPS_SCRIPT_URL = "REEMPLAZAR_APPS_SCRIPT_URL";

// OAuth Client ID (Web) para la vista admin. Setup: ver README.
export const GOOGLE_CLIENT_ID = "REEMPLAZAR.apps.googleusercontent.com";

// Emails autorizados a entrar al admin. Mantener sincronizado con
// ADMIN_EMAILS dentro de apps-script/Code.gs.
export const ADMIN_EMAILS = ["juanm.rodriguez2@gmail.com"];

// Info del evento que se muestra en la vista del invitado.
export const EVENTO = {
  pareja: "Nombre & Nombre",
  fecha: "Fecha por definir",
  lugar: "Lugar por definir",
  direccion: "",
};
