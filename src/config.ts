// Configuración de la app. Rellená estos valores cuando tengas el Sheet, el
// Form y el OAuth Client ID. Nada de esto es secreto sensible:
// - SHEET_ID y FORM_ID son IDs públicos (el Sheet está como "anyone with link
//   can view" para que la app lo lea).
// - GOOGLE_CLIENT_ID es público por diseño del flow OAuth de Google.
// - ADMIN_EMAILS define quién puede usar la vista admin. La validación real
//   pasa porque el Sheet sólo te deja escribir si sos dueño/editor.

export const SHEET_ID = "REEMPLAZAR_SHEET_ID";

// Nombres de las pestañas dentro del Sheet.
export const TAB_INVITADOS = "invitados";
export const TAB_RESPUESTAS = "respuestas";

// Google Form vinculado a la pestaña "respuestas".
export const FORM_ID = "REEMPLAZAR_FORM_ID";

// IDs de los campos del Form (los sacás del "Get pre-filled link" del Form).
// Reemplazá los números por los entry.xxxxx reales.
export const FORM_FIELDS = {
  id: "entry.000000001",
  respuesta: "entry.000000002",
  cantidadConfirmados: "entry.000000003",
  comentario: "entry.000000004",
} as const;

// OAuth para la vista admin.
export const GOOGLE_CLIENT_ID = "REEMPLAZAR.apps.googleusercontent.com";

// Emails autorizados a entrar al admin. Agregá los tuyos.
export const ADMIN_EMAILS = ["juanm.rodriguez2@gmail.com"];

// Info del evento que se muestra en la vista del invitado.
export const EVENTO = {
  pareja: "Nombre & Nombre",
  fecha: "Fecha por definir",
  lugar: "Lugar por definir",
  direccion: "",
};
