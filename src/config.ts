// App configuration. APPS_SCRIPT_URL is the public Web App URL from the
// Apps Script deployment (ends in /exec). Nothing here is a secret.
// The admin passphrase lives ONLY inside apps-script/Code.gs.

/** Web App URL from the Apps Script deployment. Ends in /exec. */
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxAuHHq2B5_3RH_6RX3T3eLxqJw20Df2qEsA7GEDzviAkvhCrNtvnujf7zUlC3Aiwv4PA/exec";

/** Who invited a guest. `value` is stored in the sheet; `label` is displayed. */
export type InvitationSide = { value: string; label: string };

/** One occurrence of the wedding: civil ceremony, party, etc. */
export type EventOccurrence = {
  /** Short label, only rendered when there is more than one occurrence. */
  label: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  mapUrl: string;
  /** Optional extra line inside the "when" tile. */
  note?: string;
};

/** An account guests can transfer a gift to. */
export type GiftAccount = {
  /** Full chip text, e.g. "Banco BBVA" or "PREX". */
  bank: string;
  label: string;
  value: string;
  holder: string;
};

/**
 * Event metadata shown on the guest page. `photoUrl` is optional; when set it
 * is used as the hero background. Leave empty to fall back to a CSS-only hero.
 */
export const EVENT = {
  couple: "Juan Manuel & Valentina",
  /** Headline date, shown in the cover and the hero. */
  date: "3 de octubre de 2026",
  shortDate: "03.10.26",
  /** Invitation sides. Keep `value` lowercase and space-free. */
  sides: [
    { value: "vale", label: "Vale" },
    { value: "juan", label: "Juan" },
  ] as readonly InvitationSide[],
  /** Occurrences in chronological order. The last one is the main event. */
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
  dressCode: "Semi formal",
  dressCodeDescription:
    "Un estilo semi-formal: prolijo y cómodo, sin caer en lo de etiqueta.",
  dressCodeWomen: [
    "Vestido corto o midi, pollera midi o mono",
    "Pantalón de vestir con blusa o camisa",
    "Sandalias prolijas, plataformas o taco medio",
  ],
  dressCodeMen: [
    "Pantalón de vestir y camisa",
    "Saco o blazer liviano (opcional, sin corbata)",
    "Zapatos cerrados o mocasines",
  ],
  dressCodeAvoid: [
    "Pantalón de jean",
    "Championes",
    "Remeras informales",
    "Vestido largo de gala o traje de etiqueta",
    "Blanco (es el color de la novia)",
  ],
  photoUrl: "",
  rsvpDeadline: "20 de septiembre",
  giftMessage:
    "El mejor regalo es que nos acompañen en este día, pero si igual nos quieren hacer un regalo, pueden hacerlo acá.",
  /** Banco, tipo de cuenta y titular: los tres hacen falta para transferir. */
  giftAccounts: [
    {
      bank: "Banco BBVA",
      label: "Cuenta única",
      value: "22975926",
      holder: "Juan Rodríguez",
    },
  ] as readonly GiftAccount[],
  /** Spotify track URL para el reproductor que se muestra en la página del invitado. */
  spotifyTrackUrl: "https://open.spotify.com/track/6lanRgr6wXibZr8KgzXxBl",
} as const;

/** The occurrence that headlines the page: the last one, i.e. the party. */
export const MAIN_EVENT = EVENT.events[EVENT.events.length - 1];
