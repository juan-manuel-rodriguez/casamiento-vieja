import { useEffect, useMemo, useState } from "react";
import { FaSpotify, FaWhatsapp } from "react-icons/fa6";
import { LuLink, LuTrash2 } from "react-icons/lu";
import {
  checkAuth,
  listGuests,
  upsertGuest,
  deleteGuest,
  type Guest,
  type GuestInput,
} from "../api/guests";
import {
  listSongRecommendations,
  type SongRecommendation,
} from "../api/songs";
import { clearPassphrase, loadPassphrase, savePassphrase } from "../auth/passphrase";
import { GUEST_GROUPS, groupLabel } from "../lib/groups";
import { firstName } from "../lib/names";

type ViewState =
  | { kind: "needs-passphrase"; error?: string }
  | { kind: "loading" }
  | {
      kind: "ready";
      guests: Guest[];
      songRecommendations: SongRecommendation[];
    }
  | { kind: "error"; message: string };

type NewGuestDraft = Omit<GuestInput, "id" | "invitationSent">;

const EMPTY_DRAFT: NewGuestDraft = {
  name: "",
  adultSlots: 1,
  kidSlots: 0,
  side: "",
  group: "",
  contact: "",
  notes: "",
};

type Filters = {
  search: string;
  side: "all" | "vale" | "juan" | "unassigned";
  response: "all" | "pending" | "accept" | "decline";
  sent: "all" | "sent" | "unsent";
  /** "all", "none", or a group name. */
  group: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  side: "all",
  response: "all",
  sent: "all",
  group: "all",
};

function applyFilters(guests: Guest[], filters: Filters): Guest[] {
  const needle = filters.search.trim().toLowerCase();
  return guests.filter((guest) => {
    if (needle && !`${guest.name} ${guest.id}`.toLowerCase().includes(needle)) return false;

    const side = guest.side || "";
    if (filters.side === "unassigned" && side) return false;
    if (filters.side !== "all" && filters.side !== "unassigned" && side !== filters.side) {
      return false;
    }

    // An empty `response` is a guest who has not answered yet.
    const response = guest.response || "pending";
    if (filters.response !== "all" && response !== filters.response) return false;

    if (filters.sent === "sent" && !guest.invitationSent) return false;
    if (filters.sent === "unsent" && guest.invitationSent) return false;

    const group = guest.group || "";
    if (filters.group === "none" && group) return false;
    if (filters.group !== "all" && filters.group !== "none" && group !== filters.group) {
      return false;
    }

    return true;
  });
}

export function AdminPage() {
  const [auth, setAuth] = useState<string | null>(() => loadPassphrase());
  const [view, setView] = useState<ViewState>(
    auth ? { kind: "loading" } : { kind: "needs-passphrase" },
  );
  const [draft, setDraft] = useState<NewGuestDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [busy, setBusy] = useState(false);

  async function withBusy(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!auth) return;
    void refresh(auth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  async function refresh(activeAuth: string = auth!): Promise<void> {
    // Don't blank the screen if there's already data on it; the busy overlay
    // covers the in-flight state.
    setView((current) => (current.kind === "ready" ? current : { kind: "loading" }));
    try {
      const [guests, songRecommendations] = await Promise.all([
        listGuests(activeAuth),
        listSongRecommendations(activeAuth),
      ]);
      setView({
        kind: "ready",
        guests,
        songRecommendations,
      });
    } catch (err) {
      const message = errorMessage(err);
      if (message.toLowerCase().includes("passphrase")) {
        clearPassphrase();
        setAuth(null);
        setView({ kind: "needs-passphrase", error: "Contraseña incorrecta" });
        return;
      }
      setView({ kind: "error", message });
    }
  }

  async function handleSubmitPassphrase(value: string) {
    if (!value.trim()) return;
    setView({ kind: "loading" });
    try {
      await checkAuth(value);
      savePassphrase(value);
      setAuth(value);
    } catch (err) {
      const message = errorMessage(err);
      setView({
        kind: "needs-passphrase",
        error: message.toLowerCase().includes("passphrase") ? "Contraseña incorrecta" : message,
      });
    }
  }

  function handleSignOut() {
    clearPassphrase();
    setAuth(null);
    setView({ kind: "needs-passphrase" });
  }

  async function toggleInvitationSent(guest: Guest) {
    if (!auth) return;
    await withBusy(async () => {
      try {
        await upsertGuest(auth, { ...guest, invitationSent: !guest.invitationSent });
        await refresh();
      } catch (err) {
        setView({ kind: "error", message: errorMessage(err) });
      }
    });
  }

  async function changeGroup(guest: Guest, group: string) {
    if (!auth || group === (guest.group || "")) return;
    await withBusy(async () => {
      try {
        await upsertGuest(auth, { ...guest, group });
        await refresh();
      } catch (err) {
        setView({ kind: "error", message: errorMessage(err) });
      }
    });
  }

  async function handleDelete(guest: Guest) {
    if (!auth) return;
    if (!confirm(`¿Eliminar a ${guest.name}?`)) return;
    await withBusy(async () => {
      try {
        await deleteGuest(auth, guest.id);
        await refresh();
      } catch (err) {
        setView({ kind: "error", message: errorMessage(err) });
      }
    });
  }

  async function handleSubmitDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!auth) return;
    const name = draft.name.trim();
    if (!name) return;
    setSaving(true);
    await withBusy(async () => {
      try {
        await upsertGuest(auth, { ...draft, name, invitationSent: false });
        setDraft(EMPTY_DRAFT);
        await refresh();
      } catch (err) {
        setView({ kind: "error", message: errorMessage(err) });
      } finally {
        setSaving(false);
      }
    });
  }

  function copyGuestLink(id: string) {
    void navigator.clipboard.writeText(buildGuestLink(id));
  }

  function buildGuestLink(id: string): string {
    const base = window.location.origin + window.location.pathname.replace(/admin\/?$/, "");
    return `${base}?id=${id}`;
  }

  function normalizePhoneForWa(contact: string): string {
    return contact.replace(/\D/g, "");
  }

  function sendInvitationWhatsApp(guest: Guest) {
    const phone = normalizePhoneForWa(guest.contact ?? "");
    if (!phone) {
      alert("Este invitado no tiene un contacto válido para WhatsApp.");
      return;
    }
    const inviteLink = buildGuestLink(guest.id);
    const message = [
      `Hola ${firstName(guest.name)}!`,
      "Te compartimos tu invitación a nuestro casamiento:",
      inviteLink,
    ].join("\n");
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  if (view.kind === "needs-passphrase") {
    return <PassphraseGate error={view.error} onSubmit={handleSubmitPassphrase} />;
  }
  if (view.kind === "loading") {
    return <EmptyAdminState eyebrow="Un momento" title="Cargando…" />;
  }
  if (view.kind === "error") {
    return (
      <EmptyAdminState eyebrow="Algo salió mal" title="No pudimos cargar los datos">
        <div className="mt-4 px-4 py-3 rounded bg-danger-soft text-danger border border-danger-border text-sm">
          {view.message}
        </div>
        <div className="flex gap-3 mt-6">
          <button className="btn-primary" onClick={() => void refresh()}>
            Reintentar
          </button>
          <button className="btn-ghost" onClick={handleSignOut}>
            Salir
          </button>
        </div>
      </EmptyAdminState>
    );
  }

  const { guests, songRecommendations } = view;
  // Plain calls, not useMemo: this runs after the early returns above, where
  // hooks are off limits, and filtering a wedding-sized list is free.
  const filtered = applyFilters(guests, filters);
  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.side !== "all" ||
    filters.response !== "all" ||
    filters.sent !== "all" ||
    filters.group !== "all";

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 pb-24 font-sans">
      {busy && <BusyOverlay />}
      <Topbar onRefresh={() => void withBusy(() => refresh())} onSignOut={handleSignOut} />
      <Stats guests={guests} />

      <details className="bg-white border border-bone rounded-lg p-6 mb-8 shadow-sm group">
        <summary className="cursor-pointer font-medium text-sm flex items-center gap-3 list-none [&::-webkit-details-marker]:hidden">
          <span className="w-6 h-6 rounded-full bg-ink text-white inline-flex items-center justify-center text-base leading-none transition-transform group-open:rotate-45">
            +
          </span>
          Agregar invitado
        </summary>
        <form onSubmit={handleSubmitDraft}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-6">
            <DraftField label="Nombre" required>
              <input
                className="admin-input"
                placeholder="Juan Pérez"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </DraftField>
            <DraftField label="Cupos adultos">
              <input
                type="number"
                min={1}
                className="admin-input"
                value={draft.adultSlots}
                onChange={(e) =>
                  setDraft({ ...draft, adultSlots: Math.max(1, Number(e.target.value)) })
                }
              />
            </DraftField>
            <DraftField label="Cupos niños">
              <input
                type="number"
                min={0}
                className="admin-input"
                value={draft.kidSlots}
                onChange={(e) =>
                  setDraft({ ...draft, kidSlots: Math.max(0, Number(e.target.value)) })
                }
              />
            </DraftField>
            <DraftField label="Invita">
              <select
                className="admin-input"
                value={draft.side}
                onChange={(e) => setDraft({ ...draft, side: e.target.value as "vale" | "juan" | "" })}
              >
                <option value="">Sin asignar</option>
                <option value="vale">Vale</option>
                <option value="juan">Juan</option>
              </select>
            </DraftField>
            <DraftField label="Grupo">
              <select
                className="admin-input"
                value={draft.group}
                onChange={(e) => setDraft({ ...draft, group: e.target.value })}
              >
                <option value="">Sin grupo</option>
                {GUEST_GROUPS.map((group) => (
                  <option key={group.number} value={group.name}>
                    {groupLabel(group.name)}
                  </option>
                ))}
              </select>
            </DraftField>
            <DraftField label="Contacto">
              <input
                className="admin-input"
                placeholder="+54 9 11 …"
                value={draft.contact}
                onChange={(e) => setDraft({ ...draft, contact: e.target.value })}
              />
            </DraftField>
            <DraftField label="Notas">
              <input
                className="admin-input"
                placeholder="Alergias, asiento, etc."
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </DraftField>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setDraft(EMPTY_DRAFT)}
              disabled={saving}
            >
              Limpiar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </form>
      </details>

      <div className="flex flex-wrap gap-3 items-center mb-3">
        <input
          className="flex-1 min-w-[200px] px-4 py-3 border border-bone rounded bg-white focus:outline-none focus:border-gold"
          placeholder="Buscar por nombre o id…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <FilterSelect
          label="Invita"
          value={filters.side}
          onChange={(side) => setFilters({ ...filters, side })}
          options={[
            { value: "all", label: "Invita: todos" },
            { value: "vale", label: "Invita Vale" },
            { value: "juan", label: "Invita Juan" },
            { value: "unassigned", label: "Sin asignar" },
          ]}
        />
        <FilterSelect
          label="Respuesta"
          value={filters.response}
          onChange={(response) => setFilters({ ...filters, response })}
          options={[
            { value: "all", label: "Respuesta: todas" },
            { value: "pending", label: "Pendientes" },
            { value: "accept", label: "Aceptaron" },
            { value: "decline", label: "No pueden" },
          ]}
        />
        <FilterSelect
          label="Invitación"
          value={filters.sent}
          onChange={(sent) => setFilters({ ...filters, sent })}
          options={[
            { value: "all", label: "Invitación: todas" },
            { value: "sent", label: "Enviadas" },
            { value: "unsent", label: "Sin enviar" },
          ]}
        />
        <FilterSelect
          label="Grupo"
          value={filters.group}
          onChange={(group) => setFilters({ ...filters, group })}
          options={[
            { value: "all", label: "Grupo: todos" },
            ...GUEST_GROUPS.map((group) => ({
              value: group.name,
              label: groupLabel(group.name),
            })),
            { value: "none", label: "Sin grupo" },
          ]}
        />
      </div>

      <div className="flex flex-wrap gap-3 items-center mb-4 text-sm text-muted">
        <span className="tabular-nums">
          {filtered.length === guests.length
            ? `${guests.length} invitados`
            : `${filtered.length} de ${guests.length} invitados`}
        </span>
        {hasActiveFilters && (
          <button
            className="underline underline-offset-4 hover:text-ink transition-colors cursor-pointer"
            onClick={() => setFilters(EMPTY_FILTERS)}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <GuestTable
        guests={filtered}
        totalGuests={guests.length}
        onChangeGroup={changeGroup}
        onToggleInvitation={toggleInvitationSent}
        onCopyLink={copyGuestLink}
        onSendWhatsApp={sendInvitationWhatsApp}
        onDelete={handleDelete}
      />

      <SongRecommendationsSection
        recommendations={songRecommendations}
        guests={guests}
      />
    </main>
  );
}

/* ---------- Subcomponents ---------- */

function PassphraseGate({
  error,
  onSubmit,
}: {
  error?: string;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <main className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 py-12 gap-4 font-sans">
      <p className="text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium m-0">
        Acceso
      </p>
      <h1 className="font-display italic text-4xl sm:text-5xl m-0">Panel de administración</h1>
      <p className="text-muted max-w-md">
        Ingresá la contraseña que pusiste en el Apps Script para gestionar la lista.
      </p>
      <form
        className="flex flex-col items-stretch gap-3 w-full max-w-sm"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(value);
        }}
      >
        <input
          type="password"
          autoFocus
          className="admin-input text-center text-lg"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="contraseña"
        />
        {error && (
          <div className="px-4 py-3 rounded bg-danger-soft text-danger border border-danger-border text-sm">
            {error}
          </div>
        )}
        <button className="btn-primary mt-2" type="submit">
          Entrar
        </button>
      </form>
    </main>
  );
}

function Topbar({ onRefresh, onSignOut }: { onRefresh: () => void; onSignOut: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-bone mb-8">
      <h1 className="font-display italic text-3xl m-0">Lista de invitados</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <button className="btn-ghost" onClick={onRefresh}>
          Refrescar
        </button>
        <button className="btn-ghost" onClick={onSignOut}>
          Salir
        </button>
      </div>
    </header>
  );
}

function Stats({ guests }: { guests: Guest[] }) {
  const stats = useMemo(() => {
    const total = guests.length;
    const accepted = guests.filter((g) => g.response === "accept");
    const declined = guests.filter((g) => g.response === "decline");
    const pending = total - accepted.length - declined.length;
    const invitationsSent = guests.filter((g) => g.invitationSent).length;
    let adultsConfirmed = 0;
    let kidsConfirmed = 0;
    for (const g of accepted) {
      adultsConfirmed += g.adultsConfirmed;
      kidsConfirmed += g.kidsConfirmed;
    }
    const adultSlotsTotal = guests.reduce((acc, g) => acc + g.adultSlots, 0);
    const kidSlotsTotal = guests.reduce((acc, g) => acc + g.kidSlots, 0);
    return {
      total,
      accepted,
      declined,
      pending,
      invitationsSent,
      adultsConfirmed,
      kidsConfirmed,
      adultSlotsTotal,
      kidSlotsTotal,
    };
  }, [guests]);

  return (
    <section className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-10">
      <StatCard label="Invitaciones" value={stats.total} />
      <StatCard label="Enviadas" value={stats.invitationsSent} total={stats.total} />
      <StatCard label="Aceptaron" value={stats.accepted.length} />
      <StatCard label="No pueden" value={stats.declined.length} />
      <StatCard
        label="Adultos"
        value={stats.adultsConfirmed}
        total={stats.adultSlotsTotal}
        accent
      />
      <StatCard
        label="Niños"
        value={stats.kidsConfirmed}
        total={stats.kidSlotsTotal}
        accent
      />
    </section>
  );
}

function StatCard({
  label,
  value,
  total,
  accent,
}: {
  label: string;
  value: number;
  total?: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-5 shadow-sm flex flex-col gap-3 ${
        accent ? "bg-soft border-sand" : "bg-white border-bone"
      }`}
    >
      <span className="text-[0.78rem] uppercase tracking-[0.16em] text-subtle">{label}</span>
      <span className="font-sans leading-none text-ink tabular-nums flex items-baseline gap-1">
        <span className="text-4xl font-semibold">{value}</span>
        {total != null && (
          <span className="text-xl font-medium text-subtle">/ {total}</span>
        )}
      </span>
    </div>
  );
}

function DraftField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-[0.78rem] uppercase tracking-[0.16em] text-muted font-medium">
      <span>
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * A labelled dropdown for the filter bar. The label is only exposed to screen
 * readers — on screen the selected option already reads as "Invita: todos",
 * so a visible label would just repeat it.
 */
function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <select
      className="px-4 py-3 border border-bone rounded bg-white focus:outline-none focus:border-gold cursor-pointer"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type TableProps = {
  /** Already filtered by the caller. */
  guests: Guest[];
  /** Unfiltered count, so the empty state can tell "no guests" from "no matches". */
  totalGuests: number;
  onChangeGroup: (guest: Guest, group: string) => void;
  onToggleInvitation: (guest: Guest) => void;
  onCopyLink: (id: string) => void;
  onSendWhatsApp: (guest: Guest) => void;
  onDelete: (guest: Guest) => void;
};

function GuestTable({
  guests,
  totalGuests,
  onChangeGroup,
  onToggleInvitation,
  onCopyLink,
  onSendWhatsApp,
  onDelete,
}: TableProps) {
  return (
    <div className="bg-white border border-bone rounded-lg overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-cream">
            <Th>Invitado</Th>
            <Th>Invita</Th>
            <Th>Grupo</Th>
            <Th>Cupos</Th>
            <Th>Enviada</Th>
            <Th>Respuesta</Th>
            <Th>Confirmados</Th>
            <Th>Comentario</Th>
            <Th aria-label="Acciones"></Th>
          </tr>
        </thead>
        <tbody>
          {guests.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center text-subtle italic py-12 px-4">
                {totalGuests === 0
                  ? "Todavía no hay invitados. Agregá el primero arriba."
                  : "Ningún invitado coincide con los filtros."}
              </td>
            </tr>
          )}
          {guests.map((guest) => {
            return (
              <tr key={guest.id} className="border-t border-bone hover:bg-soft/30 transition-colors">
                <Td>
                  <div className="font-medium text-ink whitespace-nowrap">{guest.name}</div>
                  {/* The full uuid wrapped onto four lines and blew up the row
                      height; the prefix is enough to eyeball, and the whole id
                      is one hover (or the copy-link button) away. */}
                  <div className="text-[0.78rem] text-subtle font-mono" title={guest.id}>
                    {guest.id.slice(0, 8)}…
                  </div>
                </Td>
                <Td>{guestSideLabel(guest.side)}</Td>
                <Td>
                  <select
                    className="w-44 px-2 py-1.5 border border-bone rounded bg-white text-sm text-ink cursor-pointer hover:border-sand focus:outline-none focus:border-gold"
                    value={guest.group || ""}
                    aria-label={`Grupo de ${guest.name}`}
                    onChange={(e) => onChangeGroup(guest, e.target.value)}
                  >
                    <option value="">Sin grupo</option>
                    {GUEST_GROUPS.map((group) => (
                      <option key={group.number} value={group.name}>
                        {groupLabel(group.name)}
                      </option>
                    ))}
                    {guest.group && !GUEST_GROUPS.some((g) => g.name === guest.group) && (
                      <option value={guest.group}>{guest.group}</option>
                    )}
                  </select>
                </Td>
                <Td>
                  <SlotsCell adults={guest.adultSlots} kids={guest.kidSlots} />
                </Td>
                <Td>
                  <input
                    type="checkbox"
                    className="admin-checkbox"
                    checked={guest.invitationSent}
                    onChange={() => onToggleInvitation(guest)}
                    aria-label={`Invitación enviada a ${guest.name}`}
                    title={guest.invitationSent ? "Invitación enviada" : "Invitación sin enviar"}
                  />
                </Td>
                <Td>
                  <ResponsePill response={guest.response} />
                </Td>
                <Td>
                  {guest.response === "accept" ? (
                    <SlotsCell adults={guest.adultsConfirmed} kids={guest.kidsConfirmed} />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td wrap>{guest.comment ?? ""}</Td>
                <Td>
                  <div className="flex gap-1.5 justify-end">
                    <button
                      className="icon-action icon-action--brand"
                      onClick={() => onSendWhatsApp(guest)}
                      title="Enviar por WhatsApp"
                      aria-label={`Enviar invitación por WhatsApp a ${guest.name}`}
                    >
                      <FaWhatsapp size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-action"
                      onClick={() => onCopyLink(guest.id)}
                      title="Copiar link"
                      aria-label={`Copiar link de ${guest.name}`}
                    >
                      <LuLink size={16} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-action icon-action--danger"
                      onClick={() => onDelete(guest)}
                      title="Eliminar"
                      aria-label={`Eliminar a ${guest.name}`}
                    >
                      <LuTrash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function guestSideLabel(side: Guest["side"]) {
  if (side === "vale") return "Vale";
  if (side === "juan") return "Juan";
  return "Sin asignar";
}

function Th({ children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className="text-left px-4 py-3 text-[0.78rem] uppercase tracking-[0.16em] font-medium text-muted whitespace-nowrap"
      {...rest}
    >
      {children}
    </th>
  );
}

/**
 * Cells default to a single line so rows stay one height and the table reads
 * as a grid. `wrap` is for free text (comments), the only column where
 * breaking is better than a wide cell.
 */
function Td({ children, wrap = false }: { children: React.ReactNode; wrap?: boolean }) {
  return (
    <td className={`px-4 py-3 align-middle ${wrap ? "max-w-xs" : "whitespace-nowrap"}`}>
      {children}
    </td>
  );
}

function SongRecommendationsSection({
  recommendations,
  guests,
}: {
  recommendations: SongRecommendation[];
  guests: Guest[];
}) {
  const guestNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of guests) map.set(g.id, g.name);
    return map;
  }, [guests]);

  const sorted = useMemo(() => {
    return [...recommendations].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  }, [recommendations]);

  return (
    <section className="mt-12">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="font-display italic text-2xl m-0">Canciones recomendadas</h2>
        <span className="text-sm text-muted tabular-nums">{sorted.length}</span>
      </header>
      <div className="bg-white border border-bone rounded-lg overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-cream">
              <Th>Invitado</Th>
              <Th>Canción</Th>
              <Th>Artistas</Th>
              <Th aria-label="Link"></Th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-subtle italic py-10 px-4">
                  Todavía no hay recomendaciones.
                </td>
              </tr>
            )}
            {sorted.map((rec, idx) => (
              <tr
                key={`${rec.timestamp}-${rec.trackId}-${idx}`}
                className="border-t border-bone hover:bg-soft/30 transition-colors"
              >
                <Td>{guestNameById.get(rec.guestId) ?? rec.guestId}</Td>
                <Td>
                  <span className="font-medium text-ink">{rec.trackName}</span>
                </Td>
                <Td>{rec.artists}</Td>
                <Td>
                  {rec.spotifyUrl && (
                    <a
                      className="icon-action icon-action--brand"
                      href={rec.spotifyUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="Abrir en Spotify"
                      aria-label={`Abrir ${rec.trackName} en Spotify`}
                    >
                      <FaSpotify size={17} aria-hidden="true" />
                    </a>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BusyOverlay() {
  return (
    <div
      className="fixed inset-0 z-50 bg-ivory/55 backdrop-blur-[1px] flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white border border-bone rounded-xl shadow-lg px-6 py-5 flex items-center gap-4">
        <Spinner />
        <span className="text-sm font-medium text-ink">Guardando…</span>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="block w-5 h-5 border-2 border-bone border-t-ink rounded-full animate-spin"
      aria-hidden="true"
    />
  );
}

function SlotsCell({ adults, kids }: { adults: number; kids: number }) {
  return (
    <div className="flex gap-2 items-baseline tabular-nums text-ink">
      <span className="font-medium">{adults}A</span>
      {kids > 0 && <span className="text-muted">·</span>}
      {kids > 0 && <span className="font-medium">{kids}N</span>}
    </div>
  );
}

function ResponsePill({ response }: { response?: "accept" | "decline" | "" }) {
  if (response === "accept") return <Pill variant="accept">Acepta</Pill>;
  if (response === "decline") return <Pill variant="decline">No puede</Pill>;
  return <Pill variant="neutral">Pendiente</Pill>;
}

function Pill({
  variant,
  children,
}: {
  variant: "neutral" | "accept" | "decline";
  children: React.ReactNode;
}) {
  const styles: Record<typeof variant, string> = {
    neutral: "bg-cream text-muted border-bone",
    accept: "bg-success-soft text-success border-success-border",
    decline: "bg-danger-soft text-danger border-danger-border",
  };
  return (
    <span
      className={`inline-flex items-center px-3 py-0.5 rounded-full border text-[0.78rem] uppercase tracking-[0.14em] font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

function EmptyAdminState({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 py-12 gap-4 font-sans">
      <p className="font-sans text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium m-0">
        {eyebrow}
      </p>
      <h1 className="font-display italic text-4xl sm:text-5xl m-0">{title}</h1>
      <div className="text-muted max-w-md">{children}</div>
    </main>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}
