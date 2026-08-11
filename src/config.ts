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

/**
 * Event metadata shown on the guest page. `photoUrl` is optional; when set it
 * is used as the hero background. Leave empty to fall back to a CSS-only hero.
 */
export const EVENT = {
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
  ] as readonly InvitationSide[],
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
  ] as readonly GiftAccount[],
  /** Con track hay portada: el click habilita el autoplay del reproductor. */
  spotifyTrackUrl: "https://open.spotify.com/track/5wq9WMmC3FzC7k1x6yVfAG",
} as const;

/** The occurrence that headlines the page: the last one, i.e. the party. */
export const MAIN_EVENT = EVENT.events[EVENT.events.length - 1];
