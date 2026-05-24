// App configuration. Nothing here is a secret:
// - APPS_SCRIPT_URL is the public Web App URL. Anyone can call it, but admin
//   actions verify the OAuth token against ADMIN_EMAILS server-side.
// - GOOGLE_CLIENT_ID is public by design of Google's OAuth implicit flow.
// - ADMIN_EMAILS controls who can use the admin view. Keep this list in sync
//   with ADMIN_EMAILS in apps-script/Code.gs.

/** Web App URL from the Apps Script deployment. Ends in /exec. */
export const APPS_SCRIPT_URL = "https://script.google.com/u/0/home/projects/1m1fADkT848jZUVAvHAFF9i3-v63oFJy8kwSgtM76WXEPFioHx992iyrw/exec";

/** OAuth Web Client ID from Google Cloud Console → Credentials. */
export const GOOGLE_CLIENT_ID = "REEMPLAZAR.apps.googleusercontent.com";

/** Emails allowed into the admin view. */
export const ADMIN_EMAILS = ["juanm.rodriguez2@gmail.com"];

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
  mapUrl: "https://maps.app.goo.gl/SFZL2KjHdDynPJYC6",
  photoUrl: "",
  rsvpDeadline: "20 de septiembre",
} as const;
