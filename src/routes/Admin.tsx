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
import { firstName } from "../lib/names";
import {
  PLAN_VIEWBOX,
  TABLE_PLACEMENTS,
  TOTAL_SEATS,
  TOTAL_TABLES,
  VENUE_TABLES,
  type VenueTable,
  seatPositions,
} from "../lib/tables";

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
  table: "",
  contact: "",
  notes: "",
};

type Filters = {
  search: string;
  side: "all" | "vale" | "juan" | "unassigned";
  response: "all" | "pending" | "accept" | "decline";
  sent: "all" | "sent" | "unsent";
  /** "all", "none", or a table number as text. */
  table: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  side: "all",
  response: "all",
  sent: "all",
  table: "all",
};

type TabId = "guests" | "tables" | "songs";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "guests", label: "Invitados" },
  { id: "tables", label: "Mesas" },
  { id: "songs", label: "Canciones" },
];

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

    const table = guest.table || "";
    if (filters.table === "none" && table) return false;
    if (filters.table !== "all" && filters.table !== "none" && table !== filters.table) {
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
  const [tab, setTab] = useState<TabId>("guests");
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

  async function changeTable(guest: Guest, table: string) {
    if (!auth || table === (guest.table || "")) return;
    await withBusy(async () => {
      try {
        await upsertGuest(auth, { ...guest, table });
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
    filters.table !== "all";

  return (
    // Wider than the guest page on purpose: this is a data table, and 6xl was
    // squeezing it into a horizontal scroll on a laptop screen.
    <main className="max-w-400 mx-auto px-4 sm:px-6 py-8 pb-24 font-sans">
      {busy && <BusyOverlay />}
      <Topbar onRefresh={() => void withBusy(() => refresh())} onSignOut={handleSignOut} />
      <Stats guests={guests} />

      <div className="flex gap-5 sm:gap-6 border-b border-bone mb-8 overflow-x-auto">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`-mb-px px-1 pb-3 text-sm font-medium tracking-[0.04em] border-b-2 cursor-pointer transition-colors ${
              tab === entry.id
                ? "border-ink text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "guests" && (
        <>
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
            <DraftField label="Mesa">
              <select
                className="admin-input"
                value={draft.table}
                onChange={(e) => setDraft({ ...draft, table: e.target.value })}
              >
                <option value="">Sin mesa</option>
                {VENUE_TABLES.map((table) => (
                  <option key={table.number} value={String(table.number)}>
                    Mesa {table.number} · {table.seats} lugares
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
          className="w-full sm:flex-1 sm:w-auto sm:min-w-52 px-4 py-3 border border-bone rounded bg-white focus:outline-none focus:border-gold"
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
          label="Mesa"
          value={filters.table}
          onChange={(table) => setFilters({ ...filters, table })}
          options={[
            { value: "all", label: "Mesa: todas" },
            ...VENUE_TABLES.map((table) => ({
              value: String(table.number),
              label: `Mesa ${table.number} · ${table.seats}`,
            })),
            { value: "none", label: "Sin mesa" },
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
        onChangeTable={changeTable}
        onToggleInvitation={toggleInvitationSent}
        onCopyLink={copyGuestLink}
        onSendWhatsApp={sendInvitationWhatsApp}
        onDelete={handleDelete}
      />
        </>
      )}

      {tab === "tables" && <TablesTab guests={guests} onChangeTable={changeTable} />}

      {tab === "songs" && (
        <SongRecommendationsSection recommendations={songRecommendations} guests={guests} />
      )}
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
      className="flex-1 min-w-36 sm:flex-none px-4 py-3 border border-bone rounded bg-white focus:outline-none focus:border-gold cursor-pointer"
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
  onChangeTable: (guest: Guest, table: string) => void;
  onToggleInvitation: (guest: Guest) => void;
  onCopyLink: (id: string) => void;
  onSendWhatsApp: (guest: Guest) => void;
  onDelete: (guest: Guest) => void;
};

/** Table picker, shared by the desktop row and the mobile card. */
function TablePicker({
  guest,
  onChange,
  className = "",
}: {
  guest: Guest;
  onChange: (guest: Guest, table: string) => void;
  className?: string;
}) {
  return (
    <select
      className={`px-2 py-1.5 border border-bone rounded bg-white text-sm text-ink cursor-pointer hover:border-sand focus:outline-none focus:border-gold ${className}`}
      value={guest.table || ""}
      aria-label={`Mesa de ${guest.name}`}
      onChange={(e) => onChange(guest, e.target.value)}
    >
      <option value="">Sin mesa</option>
      {VENUE_TABLES.map((table) => (
        <option key={table.number} value={String(table.number)}>
          Mesa {table.number} · {table.seats}
        </option>
      ))}
    </select>
  );
}

function SentCheckbox({ guest, onToggle }: { guest: Guest; onToggle: (guest: Guest) => void }) {
  return (
    <input
      type="checkbox"
      className="admin-checkbox"
      checked={guest.invitationSent}
      onChange={() => onToggle(guest)}
      aria-label={`Invitación enviada a ${guest.name}`}
      title={guest.invitationSent ? "Invitación enviada" : "Invitación sin enviar"}
    />
  );
}

function GuestActions({
  guest,
  onCopyLink,
  onSendWhatsApp,
  onDelete,
}: {
  guest: Guest;
  onCopyLink: (id: string) => void;
  onSendWhatsApp: (guest: Guest) => void;
  onDelete: (guest: Guest) => void;
}) {
  return (
    <div className="flex gap-1.5">
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
  );
}

function GuestSlots({ guest }: { guest: Guest }) {
  return (
    <>
      <SlotsCell adults={guest.adultSlots} kids={guest.kidSlots} />
      {guest.response === "accept" && (
        <div className="text-[0.78rem] text-success tabular-nums">
          vienen {guest.adultsConfirmed}A
          {guest.kidsConfirmed > 0 && ` · ${guest.kidsConfirmed}N`}
        </div>
      )}
    </>
  );
}

function GuestTable({
  guests,
  totalGuests,
  onChangeTable,
  onToggleInvitation,
  onCopyLink,
  onSendWhatsApp,
  onDelete,
}: TableProps) {
  const emptyMessage =
    totalGuests === 0
      ? "Todavía no hay invitados. Agregá el primero arriba."
      : "Ningún invitado coincide con los filtros.";

  return (
    <>
      {/* Phones get cards: six columns of table never fit, and a sideways
          scroll on a list you scan every day is miserable. */}
      <div className="flex flex-col gap-3 md:hidden">
        {guests.length === 0 && (
          <p className="bg-white border border-bone rounded-lg shadow-sm text-center text-subtle italic py-10 px-4 m-0">
            {emptyMessage}
          </p>
        )}
        {guests.map((guest) => (
          <article key={guest.id} className="bg-white border border-bone rounded-lg shadow-sm p-4">
            <header className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="font-medium text-ink">{guest.name}</div>
                <div className="text-[0.78rem] text-subtle">
                  {guestSideLabel(guest.side)}
                  <span className="mx-1.5 text-bone">|</span>
                  <span className="font-mono" title={guest.id}>
                    {guest.id.slice(0, 8)}
                  </span>
                </div>
              </div>
              <ResponsePill response={guest.response} />
            </header>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <div>
                <GuestSlots guest={guest} />
              </div>
              <label className="flex items-center gap-2 text-muted cursor-pointer">
                <SentCheckbox guest={guest} onToggle={onToggleInvitation} />
                Enviada
              </label>
              <TablePicker guest={guest} onChange={onChangeTable} className="w-36" />
            </div>

            {guest.comment && <p className="text-sm text-muted mt-3 mb-0">{guest.comment}</p>}

            <footer className="flex justify-end mt-4">
              <GuestActions
                guest={guest}
                onCopyLink={onCopyLink}
                onSendWhatsApp={onSendWhatsApp}
                onDelete={onDelete}
              />
            </footer>
          </article>
        ))}
      </div>

      <div className="hidden md:block bg-white border border-bone rounded-lg overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-cream">
              <Th>Invitado</Th>
              <Th>Mesa</Th>
              <Th>Cupos</Th>
              <Th>Estado</Th>
              <Th>Comentario</Th>
              <Th aria-label="Acciones"></Th>
            </tr>
          </thead>
          <tbody>
            {guests.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-subtle italic py-12 px-4">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {guests.map((guest) => (
              <tr key={guest.id} className="border-t border-bone hover:bg-soft/30 transition-colors">
                <Td>
                  <div className="font-medium text-ink">{guest.name}</div>
                  {/* Side and id ride along under the name: both are worth a
                      glance, neither deserves a column of its own. The full
                      uuid is on hover — spelled out it wrapped over four lines
                      and stretched every row. */}
                  <div className="text-[0.78rem] text-subtle">
                    {guestSideLabel(guest.side)}
                    <span className="mx-1.5 text-bone">|</span>
                    <span className="font-mono" title={guest.id}>
                      {guest.id.slice(0, 8)}
                    </span>
                  </div>
                </Td>
                <Td>
                  <TablePicker guest={guest} onChange={onChangeTable} className="w-36" />
                </Td>
                {/* Invited vs confirmed in one column: the second number only
                    means anything next to the first one. */}
                <Td>
                  <GuestSlots guest={guest} />
                </Td>
                {/* Sent + answered is a single workflow state, so one column. */}
                <Td>
                  <div className="flex items-center gap-2.5">
                    <SentCheckbox guest={guest} onToggle={onToggleInvitation} />
                    <ResponsePill response={guest.response} />
                  </div>
                </Td>
                <Td wrap>{guest.comment ?? ""}</Td>
                <Td>
                  <div className="flex justify-end">
                    <GuestActions
                      guest={guest}
                      onCopyLink={onCopyLink}
                      onSendWhatsApp={onSendWhatsApp}
                      onDelete={onDelete}
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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

type TableOccupancy = {
  table: VenueTable;
  /** Guests seated here, declined ones dropped: they free their seats. */
  guests: Guest[];
  confirmed: number;
  pending: number;
};

/**
 * Headcount per table. A guest who has not answered still holds their full
 * slots, since that is what the table has to absorb if they show up.
 */
function buildOccupancy(guests: Guest[]): {
  tables: TableOccupancy[];
  unseated: Guest[];
  unseatedPeople: number;
} {
  const byTable = new Map<number, TableOccupancy>();
  for (const table of VENUE_TABLES) {
    byTable.set(table.number, { table, guests: [], confirmed: 0, pending: 0 });
  }

  const unseated: Guest[] = [];
  let unseatedPeople = 0;

  for (const guest of guests) {
    if (guest.response === "decline") continue;
    const people =
      guest.response === "accept"
        ? guest.adultsConfirmed + guest.kidsConfirmed
        : guest.adultSlots + guest.kidSlots;
    const seat = byTable.get(Number(guest.table));
    if (!guest.table || !seat) {
      unseated.push(guest);
      unseatedPeople += people;
      continue;
    }
    seat.guests.push(guest);
    if (guest.response === "accept") seat.confirmed += people;
    else seat.pending += people;
  }

  return { tables: [...byTable.values()], unseated, unseatedPeople };
}

function TablesTab({
  guests,
  onChangeTable,
}: {
  guests: Guest[];
  onChangeTable: (guest: Guest, table: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const { tables, unseated, unseatedPeople } = useMemo(() => buildOccupancy(guests), [guests]);
  const byNumber = new Map(tables.map((entry) => [entry.table.number, entry]));
  const seated = tables.reduce((sum, entry) => sum + entry.confirmed + entry.pending, 0);
  const current = selected == null ? null : (byNumber.get(selected) ?? null);

  return (
    <section>
      <div className="flex flex-wrap gap-3 items-baseline mb-6 text-sm">
        <span className="text-muted tabular-nums">
          {seated} de {TOTAL_SEATS} lugares ocupados
        </span>
        <span className="text-subtle">·</span>
        <span className="text-muted tabular-nums">{TOTAL_TABLES} mesas</span>
        {unseatedPeople > 0 && (
          <>
            <span className="text-subtle">·</span>
            <span className="text-danger tabular-nums">{unseatedPeople} personas sin mesa</span>
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] items-start">
        <FloorPlan
          tables={tables}
          selected={selected}
          onSelect={(number) => setSelected((prev) => (prev === number ? null : number))}
        />

        <div className="flex flex-col gap-4">
          {current ? (
            <TableDetail
              occupancy={current}
              unseated={unseated}
              onUnseat={(guest) => onChangeTable(guest, "")}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="bg-white border border-bone rounded-lg shadow-sm p-6">
              <p className="text-muted text-sm m-0">
                Tocá una mesa en el plano para ver quién está sentado ahí y sentar gente.
              </p>
            </div>
          )}

          <div className="bg-white border border-bone rounded-lg shadow-sm p-5">
            <h3 className="text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium mb-3">
              Sin mesa · {unseatedPeople} personas
            </h3>
            {unseated.length === 0 ? (
              <p className="text-sm text-subtle italic m-0">No queda nadie por sentar.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {unseated.map((guest) => (
                  <GuestChip
                    key={guest.id}
                    guest={guest}
                    action={current ? `Sentar en la mesa ${current.table.number}` : undefined}
                    onClick={
                      current ? () => onChangeTable(guest, String(current.table.number)) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** People a guest brings: what they confirmed, or their full slots if silent. */
function guestHeadcount(guest: Guest): number {
  return guest.response === "accept"
    ? guest.adultsConfirmed + guest.kidsConfirmed
    : guest.adultSlots + guest.kidSlots;
}

function FloorPlan({
  tables,
  selected,
  onSelect,
}: {
  tables: TableOccupancy[];
  selected: number | null;
  onSelect: (number: number) => void;
}) {
  const byNumber = new Map(tables.map((entry) => [entry.table.number, entry]));

  return (
    <div className="bg-white border border-bone rounded-lg shadow-sm p-4 lg:sticky lg:top-4">
      <svg
        viewBox={`-16 -16 ${PLAN_VIEWBOX.width + 32} ${PLAN_VIEWBOX.height + 32}`}
        className="w-full h-auto max-h-[60vh] lg:max-h-[75vh]"
        role="img"
        aria-label="Plano de mesas"
      >
        {TABLE_PLACEMENTS.map((placement) => {
          const entry = byNumber.get(placement.number);
          if (!entry) return null;
          const taken = entry.confirmed + entry.pending;
          const seats = entry.table.seats;
          const isSelected = selected === placement.number;
          const tone =
            taken > seats
              ? { fill: "fill-danger-soft", stroke: "stroke-danger-border", seat: "fill-danger" }
              : taken === seats
                ? { fill: "fill-success-soft", stroke: "stroke-success-border", seat: "fill-success" }
                : taken > 0
                  ? { fill: "fill-soft", stroke: "stroke-sand", seat: "fill-gold-dark" }
                  : { fill: "fill-cream", stroke: "stroke-bone", seat: "fill-transparent" };

          return (
            <g
              key={placement.number}
              onClick={() => onSelect(placement.number)}
              className="cursor-pointer"
              role="button"
              aria-label={`Mesa ${placement.number}, ${taken} de ${seats} lugares`}
            >
              <title>{`Mesa ${placement.number} · ${taken}/${seats}`}</title>
              {seatPositions(placement, seats).map((seat, index) => (
                <circle
                  key={index}
                  cx={seat.x}
                  cy={seat.y}
                  r={7}
                  className={`${index < taken ? tone.seat : "fill-white"} stroke-bone`}
                  strokeWidth={1}
                />
              ))}
              <rect
                x={placement.x}
                y={placement.y}
                width={placement.width}
                height={placement.height}
                rx={6}
                className={`${tone.fill} ${isSelected ? "stroke-ink" : tone.stroke}`}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              <text
                x={placement.x + placement.width / 2}
                y={placement.y + placement.height / 2 - 1}
                textAnchor="middle"
                className="fill-ink text-[13px] font-medium"
              >
                {placement.number}
              </text>
              <text
                x={placement.x + placement.width / 2}
                y={placement.y + placement.height / 2 + 11}
                textAnchor="middle"
                className="fill-muted text-[8px] tabular-nums"
              >
                {taken}/{seats}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TableDetail({
  occupancy,
  unseated,
  onUnseat,
  onClose,
}: {
  occupancy: TableOccupancy;
  unseated: Guest[];
  onUnseat: (guest: Guest) => void;
  onClose: () => void;
}) {
  const taken = occupancy.confirmed + occupancy.pending;
  const free = occupancy.table.seats - taken;

  return (
    <div className="bg-white border border-bone rounded-lg shadow-sm p-6">
      <header className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="font-display italic text-2xl m-0">Mesa {occupancy.table.number}</h3>
        <button
          className="text-sm text-muted hover:text-ink underline underline-offset-4 cursor-pointer"
          onClick={onClose}
        >
          Cerrar
        </button>
      </header>
      <p className="text-sm text-muted m-0 mb-5">
        {occupancy.table.zone} · {taken} de {occupancy.table.seats} lugares
        {free > 0 && ` · ${free} libres`}
        {free < 0 && ` · ${Math.abs(free)} de más`}
        {occupancy.pending > 0 && ` · ${occupancy.pending} sin confirmar`}
      </p>

      {occupancy.guests.length === 0 ? (
        <p className="text-sm text-subtle italic m-0">
          Mesa vacía. Sentá gente desde la lista de abajo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 m-0 p-0 list-none">
          {occupancy.guests.map((guest) => (
            <li
              key={guest.id}
              className="flex items-baseline justify-between gap-3 border-b border-bone pb-2 last:border-0"
            >
              <span className={guest.response === "accept" ? "text-ink" : "text-muted"}>
                {guest.name}
                {guest.response !== "accept" && (
                  <span className="text-subtle text-[0.78rem]"> · sin confirmar</span>
                )}
              </span>
              <span className="flex items-baseline gap-3 shrink-0">
                <span className="tabular-nums text-subtle">{guestHeadcount(guest)}</span>
                <button
                  className="text-sm text-muted hover:text-danger underline underline-offset-4 cursor-pointer"
                  onClick={() => onUnseat(guest)}
                >
                  Sacar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {unseated.length > 0 && (
        <p className="text-[0.78rem] text-subtle mt-5 mb-0">
          Tocá un nombre de "Sin mesa" para sentarlo acá.
        </p>
      )}
    </div>
  );
}

function GuestChip({
  guest,
  action,
  onClick,
}: {
  guest: Guest;
  action?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={guest.response === "accept" ? "text-ink" : "text-muted"}>{guest.name}</span>
      <span className="tabular-nums text-subtle">
        {guestHeadcount(guest)}
        {guest.response !== "accept" && "?"}
      </span>
    </>
  );
  const className =
    "inline-flex items-baseline gap-2 rounded-full border border-bone bg-cream/50 px-3 py-1 text-sm";

  if (!onClick) return <span className={className}>{content}</span>;
  return (
    <button
      className={`${className} cursor-pointer hover:border-ink hover:bg-soft/60 transition-colors`}
      onClick={onClick}
      title={action}
    >
      {content}
    </button>
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
    <section>
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
