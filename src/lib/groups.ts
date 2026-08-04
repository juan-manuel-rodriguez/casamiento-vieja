/**
 * Guest groups. The number is the shorthand for talking about a group ("los
 * del 4 son los del 2inn"); the name is what gets stored in the sheet, so the
 * spreadsheet still reads on its own without decoding ids.
 *
 * Append new groups at the end so the existing numbers keep meaning the same
 * thing. Renaming one leaves the old name in the sheet until those guests are
 * reassigned — unknown values are shown verbatim rather than dropped.
 */
export type GuestGroup = {
  number: number;
  name: string;
};

export const GUEST_GROUPS: GuestGroup[] = [
  { number: 1, name: "Carone" },
  { number: 2, name: "Amigos Vale" },
  { number: 3, name: "Amigos Juan Solymar" },
  { number: 4, name: "Amigos 2inn" },
  { number: 5, name: "Amigos Warzone" },
  { number: 6, name: "Familia Juan" },
  { number: 7, name: "Familia Vale" },
  { number: 8, name: "Amoeba" },
  { number: 9, name: "Familia Andino" },
];

/** "4 · Amigos 2inn" for known groups, the raw value for anything else. */
export function groupLabel(group: string): string {
  if (!group) return "Sin grupo";
  const known = GUEST_GROUPS.find((candidate) => candidate.name === group);
  return known ? `${known.number} · ${known.name}` : group;
}
