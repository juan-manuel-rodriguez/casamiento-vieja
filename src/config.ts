// App configuration. APPS_SCRIPT_URL is the public Web App URL from the
// Apps Script deployment (ends in /exec). Nothing here is a secret.
// The admin passphrase lives ONLY inside apps-script/Code.gs.

/** Web App URL from the Apps Script deployment. Ends in /exec. */
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwIRAW_3d_uhs5qNNDo3cVFFZ3awhiCSqvpdWKeqnMjmcJZKJtnxh9IWLgI4L1cjBHJ/exec";

/** Who invited a guest. `value` is stored in the sheet; `label` is displayed. */
export type InvitationSide = { value: string; label: string };

/** One occurrence of the wedding: civil ceremony, party, etc. */
export type EventOccurrence = {
  /** Script-set title of the column, e.g. "Ceremonia civil". */
  label: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  mapUrl: string;
  /** Ornament above the title. Matches the printed invitation. */
  icon: "rings" | "party";
  /** Optional extra line under the venue. */
  note?: string;
  /** When true, the dress code and its "¿Qué me pongo?" link show here. */
  showDressCode?: boolean;
};

/** An account guests can transfer a gift to. */
export type GiftAccount = {
  /** Nombre del banco, e.g. "PREX". Se compone como "Cuenta PREX pesos". */
  bank: string;
  /** Moneda o tipo, e.g. "pesos". */
  label: string;
  value: string;
  holder: string;
};

/** Todo el contenido editable de la invitación. */
export type EventConfig = {
  couple: string;
  signature: string;
  tagline: string;
  date: string;
  shortDate: string;
  sides: readonly InvitationSide[];
  events: readonly EventOccurrence[];
  dressCode: string;
  dressCodeDescription: string;
  dressCodeWomen: readonly string[];
  dressCodeMen: readonly string[];
  dressCodeAvoid: readonly string[];
  photoUrl: string;
  rsvpDeadline: string;
  punctualityNote: string;
  giftMessage: string;
  giftAccounts: readonly GiftAccount[];
  spotifyTrackUrl: string;
  /**
   * Audio propio servido desde el sitio. Cuando tiene valor manda sobre
   * Spotify: suena el tema entero, desde el principio y en loop, sin que el
   * invitado necesite sesión de Spotify. El embed anónimo solo entrega un
   * recorte de ~25 s tomado de la mitad del tema.
   */
  audioUrl: string;
  /** Se muestran en el reproductor cuando hay audio propio. */
  audioTitle: string;
  audioArtist: string;
};

/**
 * Valores por defecto de la invitación. Lo que se edite desde el admin se
 * guarda en el Sheet y pisa estos campos uno por uno; los que nunca se
 * tocaron siguen saliendo de acá. Sirve además como respaldo si el backend
 * no contesta: la invitación se ve igual.
 */
export const DEFAULT_EVENT: EventConfig = {
  couple: "Seba & Emi",
  /** Signature line at the foot of the page, set in the script face. */
  signature: "Seba y Emi",
  /** Sits under "Nos casamos" in the hero. */
  tagline: "Y queremos que seas parte de nuestra historia",
  /** Headline date, shown in the cover and the hero: the party. */
  date: "23 de octubre de 2026",
  shortDate: "23.10.26",
  /** Invitation sides. Keep `value` lowercase and space-free. */
  sides: [
    { value: "seba", label: "Seba" },
    { value: "emi", label: "Emi" },
  ],
  /** Occurrences in chronological order. The last one is the main event. */
  events: [
    {
      label: "Ceremonia civil",
      date: "Martes 20 de octubre",
      time: "11:30 horas",
      venue: "Municipio de Salinas",
      address: "Salinas, Canelones",
      mapUrl:
        "https://www.google.com/maps/search/?api=1&query=Municipio+de+Salinas+Canelones",
      icon: "rings",
    },
    {
      label: "Fiesta",
      date: "Viernes 23 de octubre",
      time: "20:30 horas",
      venue: "Parque Policial Solymar",
      address: "Solymar, Canelones",
      mapUrl:
        "https://www.google.com/maps/search/?api=1&query=Parque+Policial+Solymar",
      icon: "party",
      showDressCode: true,
    },
  ],
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
    "Pantalón de jean",
    "Championes",
    "Remeras informales",
    "Blanco (es el color de la novia)",
  ],
  photoUrl: "/sebayemi.jpeg",
  rsvpDeadline: "20 de setiembre",
  punctualityNote:
    "La fiesta comenzará puntualmente y queremos que disfrutes con nosotros de cada detalle.",
  giftMessage:
    "Su presencia y sus buenos deseos son un regalo invaluable. Si consideras realizar un regalo, estas son nuestras mejores opciones.",
  /** Banco, tipo de cuenta y titular: los tres hacen falta para transferir. */
  giftAccounts: [
    {
      bank: "PREX",
      label: "pesos",
      value: "1325987",
      holder: "Sebastián Consonni",
    },
    {
      bank: "BROU",
      label: "dólares",
      value: "001404446-00003",
      holder: "Sebastián Consonni",
    },
  ],
  /** Con track hay portada: el click habilita el autoplay del reproductor. */
  spotifyTrackUrl: "https://open.spotify.com/track/5wq9WMmC3FzC7k1x6yVfAG",
  /** Con audio propio suena el tema completo, desde el principio y en loop. */
  audioUrl: "/cancion.mp3",
  audioTitle: "Esquina de la sombra",
  audioArtist: "El Plan de la Mariposa",
};

/** La ocurrencia que titula la página: la última, o sea la fiesta. */
export function mainEvent(event: EventConfig): EventOccurrence | undefined {
  return event.events[event.events.length - 1];
}
