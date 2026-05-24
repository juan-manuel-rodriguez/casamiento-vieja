// App configuration. APPS_SCRIPT_URL is the public Web App URL from the
// Apps Script deployment (ends in /exec). Nothing here is a secret.
// The admin passphrase lives ONLY inside apps-script/Code.gs.

/** Web App URL from the Apps Script deployment. Ends in /exec. */
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxAuHHq2B5_3RH_6RX3T3eLxqJw20Df2qEsA7GEDzviAkvhCrNtvnujf7zUlC3Aiwv4PA/exec";

/**
 * Event metadata shown on the guest page. `photoUrl` is optional; when set it
 * is used as the hero background. Leave empty to fall back to a CSS-only hero.
 */
export const EVENT = {
  couple: "Juan Manuel & Valentina",
  date: "3 de octubre de 2026",
  shortDate: "03.10.26",
  time: "20:00 hs",
  venue: "Verne Restó & Eventos",
  address: "Rambla Costanera M29 S09, Ciudad de la Costa, Canelones",
  dressCode: "Sport Casual",
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
    "Championes u ojotas",
    "Remeras informales",
    "Vestido largo de gala o traje de etiqueta",
    "Blanco (es el color de la novia)",
  ],
  mapUrl: "https://maps.app.goo.gl/SFZL2KjHdDynPJYC6",
  photoUrl: "",
  rsvpDeadline: "20 de septiembre",
} as const;
