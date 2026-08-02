/**
 * Guest names are stored in full ("Imanol de los Santos") because the admin
 * table needs to tell people apart, but anywhere we address someone — the
 * greeting on the guest page, the WhatsApp invitation — we use just the first
 * name. Compound first names collapse to the first word ("Juan Pablo Piano"
 * becomes "Juan"); rename the guest in the sheet if that reads wrong.
 */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}
