import { useEffect, useMemo, useState } from "react";
import { FaSpotify, FaWhatsapp } from "react-icons/fa6";
import { LuPencil, LuTrash2 } from "react-icons/lu";
import { normalizePhone } from "../lib/phone";
import { nameProblem, phoneProblem } from "../lib/guestForm";
import {
  checkAuth,
  deleteGuest,
  fetchInviteCode,
  listGuests,
  upsertGuest,
  type Guest,
  type GuestInput,
} from "../api/guests";
import {
  deleteSongRecommendation,
  listSongRecommendations,
  type SongRecommendation,
} from "../api/songs";
import { clearPassphrase, loadPassphrase, savePassphrase } from "../auth/passphrase";
import type { EventConfig, EventOccurrence, GiftAccount } from "../config";
import { useEvent, applyEventOverrides } from "../lib/event";
import {
  planLayout,
  seatPositions,
  totalSeats,
  type VenueTable,
} from "../lib/tables";
import { listTables, saveTables } from "../api/tables";
import { fetchSettings, saveSettings } from "../api/settings";

type ViewState =
  | { kind: "needs-passphrase"; error?: string }
  | { kind: "loading" }
  | {
      kind: "ready";
      guests: Guest[];
      songRecommendations: SongRecommendation[];
      venueTables: VenueTable[];
      inviteCode: string;
    }
  | { kind: "error"; message: string };

type NewGuestDraft = Omit<GuestInput, "id">;

const EMPTY_DRAFT: NewGuestDraft = {
  name: "",
  phone: "",
  response: "accept",
  adultsConfirmed: 1,
  kidsConfirmed: 0,
  table: "",
  notes: "",
};

type Filters = {
  search: string;
  response: "all" | "pending" | "accept" | "decline";
  /** "all", "self" (se anotó solo) o "manual" (lo cargó el admin). */
  origin: "all" | "self" | "manual";
  /** "all", "none", or a table number as text. */
  table: string;
};

const EMPTY_FILTERS: Filters = {
  search: "",
  response: "all",
  origin: "all",
  table: "all",
};

type TabId = "guests" | "tables" | "songs" | "invitation";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "guests", label: "Invitados" },
  { id: "tables", label: "Mesas" },
  { id: "songs", label: "Canciones" },
  { id: "invitation", label: "Invitación" },
];

function applyFilters(guests: Guest[], filters: Filters): Guest[] {
  const needle = filters.search.trim().toLowerCase();
  return guests.filter((guest) => {
    if (needle && !`${guest.name} ${guest.phone}`.toLowerCase().includes(needle)) return false;

    // An empty `response` is a guest who has not answered yet.
    const response = guest.response || "pending";
    if (filters.response !== "all" && response !== filters.response) return false;

    // Quien tiene fecha de respuesta se anotó solo desde la invitación.
    if (filters.origin === "self" && !guest.rsvpTimestamp) return false;
    if (filters.origin === "manual" && guest.rsvpTimestamp) return false;

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
  /** Id del invitado que se está editando; null cuando el formulario da de alta. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Error del formulario de invitado. Va al lado del form, no tapa el panel. */
  const [draftError, setDraftError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [tab, setTab] = useState<TabId>("guests");
  const [busy, setBusy] = useState(false);
  const invitation = useEvent();

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
      // Las mesas y el contenido de la invitación son endpoints nuevos: si el
      // Apps Script todavía no se redeployó, no existen. En ese caso el admin
      // tiene que seguir sirviendo para lo de siempre en vez de morirse.
      const [guests, songRecommendations, venueTables, settings, inviteCode] = await Promise.all([
        listGuests(activeAuth),
        listSongRecommendations(activeAuth),
        listTables(activeAuth).catch(() => [] as VenueTable[]),
        fetchSettings(activeAuth).catch(() => ({})),
        fetchInviteCode(activeAuth).catch(() => ""),
      ]);
      applyEventOverrides(settings);
      setView({
        kind: "ready",
        guests,
        songRecommendations,
        venueTables,
        inviteCode,
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

  /**
   * Guarda un cambio puntual de un invitado pintándolo en pantalla de
   * inmediato, sin overlay ni recarga.
   *
   * Antes esto hacía la escritura y después un refresh completo: dos viajes a
   * Apps Script, con la pantalla bloqueada, para tildar una casilla. Ahora el
   * cambio se ve al toque y la escritura viaja de fondo; si falla, se avisa y
   * se recarga para no dejar la pantalla mintiendo.
   */
  async function saveGuestChange(guest: Guest, patch: Partial<Guest>) {
    if (!auth) return;
    const next = { ...guest, ...patch };
    setView((current) =>
      current.kind === "ready"
        ? { ...current, guests: current.guests.map((g) => (g.id === guest.id ? next : g)) }
        : current,
    );
    try {
      await upsertGuest(auth, next);
    } catch (err) {
      setView({ kind: "error", message: errorMessage(err) });
      await refresh();
    }
  }

  async function changeTable(guest: Guest, table: string) {
    if (table === (guest.table || "")) return;
    await saveGuestChange(guest, { table });
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

  /**
   * Carga un invitado en el formulario para editarlo. El formulario de alta y
   * el de edición son el mismo: lo único que cambia es si viaja el id, y si
   * viaja, el backend actualiza la fila en vez de crear una.
   */
  function startEditing(guest: Guest) {
    setEditingId(guest.id);
    setDraft({
      name: guest.name,
      phone: guest.phone,
      response: guest.response,
      adultsConfirmed: guest.adultsConfirmed,
      kidsConfirmed: guest.kidsConfirmed,
      table: guest.table,
      notes: guest.notes,
    });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setDraftError(null);
    // Cancelar cierra el formulario. Dejarlo abierto y vacío parece que se
    // estuviera por dar de alta a alguien, que es lo contrario de cancelar.
    setFormOpen(false);
  }

  async function handleSubmitDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!auth) return;
    // Antes esto hacía setView({kind:"error"}), que reemplazaba el panel
    // entero por un cartel: un dedazo en el teléfono te sacaba de la pantalla.
    const problem = nameProblem(draft.name) ?? phoneProblem(draft.phone);
    if (problem) return setDraftError(problem);
    setDraftError(null);
    const name = draft.name.trim();
    setSaving(true);
    await withBusy(async () => {
      try {
        await upsertGuest(auth, {
          ...draft,
          name,
          phone: normalizePhone(draft.phone),
          id: editingId ?? undefined,
        });
        setDraft(EMPTY_DRAFT);
        setEditingId(null);
        setFormOpen(false);
        await refresh();
      } catch (err) {
        setView({ kind: "error", message: errorMessage(err) });
      } finally {
        setSaving(false);
      }
    });
  }


  function buildInviteLink(code: string): string {
    const { origin, pathname } = window.location;
    return `${origin}${pathname.replace(/admin\/?$/, "")}?code=${code}`;
  }

  /** Manda el link único de la invitación al teléfono de ese invitado. */
  function sendInvitationWhatsApp(guest: Guest) {
    if (!guest.phone) {
      alert("Este invitado no tiene teléfono cargado.");
      return;
    }
    const code = view.kind === "ready" ? view.inviteCode : "";
    if (!code) {
      alert("Todavía no se pudo leer el código de la invitación.");
      return;
    }
    const inviteLink = buildInviteLink(code);
    // Sin el nombre del invitado: la invitación tampoco lo nombra. El texto
    // sale de la frase de la invitación, así se edita desde el admin y no
    // queda otra copia suelta en el código.
    const message = [
      `¡Nos casamos! ${invitation.tagline}.`,
      "Acá está tu invitación:",
      inviteLink,
    ].join("\n");
    const waUrl = `https://wa.me/${guest.phone}?text=${encodeURIComponent(message)}`;
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

  const { guests, songRecommendations, venueTables, inviteCode } = view;
  // Plain calls, not useMemo: this runs after the early returns above, where
  // hooks are off limits, and filtering a wedding-sized list is free.
  const filtered = applyFilters(guests, filters);
  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.response !== "all" ||
    filters.origin !== "all" ||
    filters.table !== "all";

  return (
    // Wider than the guest page on purpose: this is a data table, and 6xl was
    // squeezing it into a horizontal scroll on a laptop screen.
    <main className="max-w-400 mx-auto px-4 sm:px-6 py-8 pb-24 font-sans">
      {busy && <BusyOverlay />}
      <Topbar onRefresh={() => void withBusy(() => refresh())} onSignOut={handleSignOut} />
      <InviteLinkBar code={inviteCode} tagline={invitation.tagline} />
      <Stats guests={guests} seats={totalSeats(venueTables)} />

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
      <details
        className="bg-white border border-bone rounded-lg p-6 mb-8 shadow-sm group"
        open={formOpen}
        onToggle={(e) => setFormOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer font-medium text-sm flex items-center gap-3 list-none [&::-webkit-details-marker]:hidden">
          <span className="w-6 h-6 rounded-full bg-ink text-white inline-flex items-center justify-center text-base leading-none transition-transform group-open:rotate-45">
            +
          </span>
          {editingId ? `Editando a ${draft.name || "este invitado"}` : "Agregar invitado"}
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
            <DraftField label="Teléfono" required>
              <input
                className="admin-input"
                inputMode="numeric"
                placeholder="099123456"
                value={draft.phone}
                // Solo dígitos: es la clave que identifica al invitado, y un
                // espacio de más lo convertiría en otra persona.
                onChange={(e) =>
                  setDraft({ ...draft, phone: e.target.value.replace(/\D/g, "") })
                }
                required
              />
            </DraftField>
            <DraftField label="Respuesta">
              <select
                className="admin-input"
                value={draft.response}
                onChange={(e) =>
                  setDraft({ ...draft, response: e.target.value as Guest["response"] })
                }
              >
                <option value="accept">Viene</option>
                <option value="decline">No puede</option>
                <option value="">Sin responder</option>
              </select>
            </DraftField>
            <DraftField label="Adultos">
              <input
                type="number"
                min={0}
                className="admin-input"
                value={draft.adultsConfirmed}
                onChange={(e) =>
                  setDraft({ ...draft, adultsConfirmed: Math.max(0, Number(e.target.value)) })
                }
              />
            </DraftField>
            <DraftField label="Niños">
              <input
                type="number"
                min={0}
                className="admin-input"
                value={draft.kidsConfirmed}
                onChange={(e) =>
                  setDraft({ ...draft, kidsConfirmed: Math.max(0, Number(e.target.value)) })
                }
              />
            </DraftField>
            <DraftField label="Mesa">
              <select
                className="admin-input"
                value={draft.table}
                onChange={(e) => setDraft({ ...draft, table: e.target.value })}
              >
                <option value="">Sin mesa</option>
                {venueTables.map((table) => (
                  <option key={table.number} value={String(table.number)}>
                    Mesa {table.number} · {table.seats} lugares
                  </option>
                ))}
              </select>
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
          {draftError && (
            <p className="text-sm text-danger mt-4 mb-0" role="alert">
              {draftError}
            </p>
          )}
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => (editingId ? cancelEditing() : setDraft(EMPTY_DRAFT))}
              disabled={saving}
            >
              {editingId ? "Cancelar" : "Limpiar"}
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar"}
            </button>
          </div>
        </form>
      </details>

      <div className="flex flex-wrap gap-3 items-center mb-3">
        <input
          className="w-full sm:flex-1 sm:w-auto sm:min-w-52 px-4 py-3 border border-bone rounded bg-white focus:outline-none focus:border-gold"
          placeholder="Buscar por nombre o cédula…"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
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
          label="Origen"
          value={filters.origin}
          onChange={(origin) => setFilters({ ...filters, origin })}
          options={[
            { value: "all", label: "Origen: todos" },
            { value: "self", label: "Se anotaron solos" },
            { value: "manual", label: "Cargados a mano" },
          ]}
        />
        <FilterSelect
          label="Mesa"
          value={filters.table}
          onChange={(table) => setFilters({ ...filters, table })}
          options={[
            { value: "all", label: "Mesa: todas" },
            ...venueTables.map((table) => ({
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
        venueTables={venueTables}
        onEdit={startEditing}
        onChangeTable={changeTable}
        onSendWhatsApp={sendInvitationWhatsApp}
        onDelete={handleDelete}
      />
        </>
      )}

      {tab === "tables" && (
        <TablesTab
          guests={guests}
          venueTables={venueTables}
          onChangeTable={changeTable}
          onSaveTables={(next) =>
            withBusy(async () => {
              await saveTables(auth!, next);
              await refresh();
            })
          }
        />
      )}

      {tab === "songs" && (
        <SongRecommendationsSection
          recommendations={songRecommendations}
          onDelete={(rowIndex) =>
            withBusy(async () => {
              await deleteSongRecommendation(auth!, rowIndex);
              await refresh();
            })
          }
        />
      )}

      {tab === "invitation" && (
        <InvitationTab
          invitation={invitation}
          onSave={(next) =>
            withBusy(async () => {
              await saveSettings(auth!, next);
              await refresh();
            })
          }
        />
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

/**
 * El link de la invitación, que ahora es uno solo para todos. Reemplaza al
 * "copiar link" que había por invitado, que dejó de tener sentido cuando la
 * gente pasó a anotarse sola.
 */
function InviteLinkBar({ code, tagline }: { code: string; tagline: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!code) {
    return (
      <div className="bg-white border border-bone rounded-lg shadow-sm px-4 py-3 mb-6 text-sm text-muted">
        No se pudo leer el código de la invitación. Si acabás de cambiar el Apps
        Script, redeployalo y recargá.
      </div>
    );
  }

  const link = `${window.location.origin}${window.location.pathname.replace(/admin\/?$/, "")}?code=${code}`;
  const message = [`¡Nos casamos! ${tagline}.`, "Acá está tu invitación:", link].join("\n");

  return (
    <div className="bg-white border border-bone rounded-lg shadow-sm px-4 py-3 mb-6 flex flex-wrap items-center gap-3">
      <span className="text-[0.78rem] uppercase tracking-[0.16em] text-muted font-medium shrink-0">
        Link de la invitación
      </span>
      <code className="flex-1 min-w-0 truncate text-sm text-ink" title={link}>
        {link}
      </code>
      <button
        type="button"
        className="btn-ghost py-2 px-4 text-[0.8rem]"
        onClick={() => {
          navigator.clipboard?.writeText(link).then(() => setCopied(true), () => undefined);
        }}
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
      <a
        className="icon-action icon-action--brand"
        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
        target="_blank"
        rel="noreferrer noopener"
        title="Compartir por WhatsApp"
        aria-label="Compartir la invitación por WhatsApp"
      >
        <FaWhatsapp size={17} aria-hidden="true" />
      </a>
    </div>
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

function Stats({ guests, seats }: { guests: Guest[]; seats: number }) {
  const stats = useMemo(() => {
    const accepted = guests.filter((g) => g.response === "accept");
    const declined = guests.filter((g) => g.response === "decline");
    let adultsConfirmed = 0;
    let kidsConfirmed = 0;
    for (const g of accepted) {
      adultsConfirmed += g.adultsConfirmed;
      kidsConfirmed += g.kidsConfirmed;
    }
    return {
      total: guests.length,
      accepted,
      declined,
      pending: guests.length - accepted.length - declined.length,
      // Quien tiene fecha de respuesta se anotó solo desde la invitación.
      selfRegistered: guests.filter((g) => g.rsvpTimestamp).length,
      adultsConfirmed,
      kidsConfirmed,
    };
  }, [guests]);

  return (
    <section className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-10">
      <StatCard label="Invitados" value={stats.total} />
      <StatCard label="Se anotaron solos" value={stats.selfRegistered} total={stats.total} />
      <StatCard label="Vienen" value={stats.accepted.length} />
      <StatCard label="No pueden" value={stats.declined.length} />
      <StatCard label="Adultos" value={stats.adultsConfirmed} accent />
      {/* Contra los lugares del salón: es el número con el que importa comparar. */}
      <StatCard
        label="Personas"
        value={stats.adultsConfirmed + stats.kidsConfirmed}
        total={seats}
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
  venueTables: readonly VenueTable[];
  onEdit: (guest: Guest) => void;
  onChangeTable: (guest: Guest, table: string) => void;
  onSendWhatsApp: (guest: Guest) => void;
  onDelete: (guest: Guest) => void;
};

/** Table picker, shared by the desktop row and the mobile card. */
function TablePicker({
  guest,
  venueTables,
  onChange,
  className = "",
}: {
  guest: Guest;
  venueTables: readonly VenueTable[];
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
      {venueTables.map((table) => (
        <option key={table.number} value={String(table.number)}>
          Mesa {table.number} · {table.seats}
        </option>
      ))}
    </select>
  );
}


function GuestActions({
  guest,
  onEdit,
  onSendWhatsApp,
  onDelete,
}: {
  guest: Guest;
  onEdit: (guest: Guest) => void;
  onSendWhatsApp: (guest: Guest) => void;
  onDelete: (guest: Guest) => void;
}) {
  return (
    <div className="flex gap-1.5">
      <button
        className="icon-action"
        onClick={() => onEdit(guest)}
        title="Editar"
        aria-label={`Editar los datos de ${guest.name}`}
      >
        <LuPencil size={16} aria-hidden="true" />
      </button>
      <button
        className="icon-action icon-action--brand"
        onClick={() => onSendWhatsApp(guest)}
        title="Enviar por WhatsApp"
        aria-label={`Enviar invitación por WhatsApp a ${guest.name}`}
      >
        <FaWhatsapp size={17} aria-hidden="true" />
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


function GuestTable({
  guests,
  totalGuests,
  venueTables,
  onEdit,
  onChangeTable,
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
                  {guest.phone || <span className="italic">Sin teléfono</span>}
                </div>
              </div>
              <ResponsePill response={guest.response} />
            </header>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <PeopleCell guest={guest} />
              <TablePicker guest={guest} venueTables={venueTables} onChange={onChangeTable} className="w-36" />
            </div>

            {guest.comment && <p className="text-sm text-muted mt-3 mb-0">{guest.comment}</p>}

            <footer className="flex justify-end mt-4">
              <GuestActions
                guest={guest}
                onEdit={onEdit}
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
                  {/* El teléfono va bajo el nombre: es la clave del invitado
                      y lo que se usa para ubicarlo. */}
                  <div className="text-[0.78rem] text-subtle">
                    {guest.phone || <span className="italic">Sin teléfono</span>}
                  </div>
                </Td>
                <Td>
                  <TablePicker guest={guest} venueTables={venueTables} onChange={onChangeTable} className="w-36" />
                </Td>
                <Td>
                  <PeopleCell guest={guest} />
                </Td>
                <Td>
                  <ResponsePill response={guest.response} />
                </Td>
                <Td wrap>{guest.comment ?? ""}</Td>
                <Td>
                  <div className="flex justify-end">
                    <GuestActions
                      guest={guest}
                      onEdit={onEdit}
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



/** Cuánta gente trae. Es el número que cuenta para las mesas y para el salón. */
function PeopleCell({ guest }: { guest: Guest }) {
  if (guest.response === "decline") {
    return <span className="text-sm text-subtle italic">No viene</span>;
  }
  return <PeopleCellInner adults={guest.adultsConfirmed} kids={guest.kidsConfirmed} />;
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
function buildOccupancy(
  guests: Guest[],
  venueTables: readonly VenueTable[],
): {
  tables: TableOccupancy[];
  unseated: Guest[];
  unseatedPeople: number;
} {
  const byTable = new Map<number, TableOccupancy>();
  for (const table of venueTables) {
    byTable.set(table.number, { table, guests: [], confirmed: 0, pending: 0 });
  }

  const unseated: Guest[] = [];
  let unseatedPeople = 0;

  for (const guest of guests) {
    if (guest.response === "decline") continue;
    const people = guestHeadcount(guest);
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
  venueTables,
  onChangeTable,
  onSaveTables,
}: {
  guests: Guest[];
  venueTables: readonly VenueTable[];
  onChangeTable: (guest: Guest, table: string) => void;
  onSaveTables: (tables: VenueTable[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const { tables, unseated, unseatedPeople } = useMemo(
    () => buildOccupancy(guests, venueTables),
    [guests, venueTables],
  );
  const byNumber = new Map(tables.map((entry) => [entry.table.number, entry]));
  const seated = tables.reduce((sum, entry) => sum + entry.confirmed + entry.pending, 0);
  const current = selected == null ? null : (byNumber.get(selected) ?? null);

  return (
    <section>
      <div className="flex flex-wrap gap-3 items-baseline mb-6 text-sm">
        <span className="text-muted tabular-nums">
          {seated} de {totalSeats(venueTables)} lugares ocupados
        </span>
        <span className="text-subtle">·</span>
        <span className="text-muted tabular-nums">{venueTables.length} mesas</span>
        {unseatedPeople > 0 && (
          <>
            <span className="text-subtle">·</span>
            <span className="text-danger tabular-nums">{unseatedPeople} personas sin mesa</span>
          </>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="ml-auto text-sm font-medium text-gold-dark underline underline-offset-4 decoration-soft hover:text-ink cursor-pointer bg-transparent border-0 p-0"
        >
          {editing ? "Cerrar" : "Editar mesas"}
        </button>
      </div>

      {editing && (
        <TablesEditor
          venueTables={venueTables}
          onSave={async (next) => {
            await onSaveTables(next);
            setEditing(false);
          }}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] items-start">
        <FloorPlan
          tables={tables}
          venueTables={venueTables}
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

/**
 * Cuánta gente ocupa. Ya no hay cupos a los que caer: lo que trae es lo que el
 * invitado declaró al confirmar, o lo que el admin le anotó al cargarlo.
 */
function guestHeadcount(guest: Guest): number {
  return guest.response === "decline" ? 0 : guest.adultsConfirmed + guest.kidsConfirmed;
}

/**
 * El plano se arma solo a partir de la lista de mesas: una franja por sector y
 * una grilla adentro. Antes las coordenadas estaban dibujadas a mano para un
 * salón puntual, que es justo lo que impedía reusar la app en otro casamiento.
 */
function FloorPlan({
  tables,
  venueTables,
  selected,
  onSelect,
}: {
  tables: TableOccupancy[];
  venueTables: readonly VenueTable[];
  selected: number | null;
  onSelect: (number: number) => void;
}) {
  const byNumber = new Map(tables.map((entry) => [entry.table.number, entry]));
  const plan = useMemo(() => planLayout(venueTables), [venueTables]);

  if (venueTables.length === 0) {
    return (
      <div className="bg-white border border-bone rounded-lg shadow-sm p-6">
        <p className="text-muted text-sm m-0">
          Todavía no cargaste ninguna mesa. Usá "Editar mesas" para armar el salón.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-bone rounded-lg shadow-sm p-4 lg:sticky lg:top-4">
      <svg
        viewBox={`-20 -16 ${plan.viewBox.width + 40} ${plan.viewBox.height + 32}`}
        className="w-full h-auto max-h-[60vh] lg:max-h-[75vh]"
        role="img"
        aria-label="Plano de mesas"
      >
        {plan.zoneBands.map((band) =>
          band.zone ? (
            <text
              key={`${band.zone}-${band.y}`}
              x={0}
              y={band.y + 18}
              className="fill-muted"
              style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase" }}
            >
              {band.zone}
            </text>
          ) : null,
        )}
        {plan.placements.map((placement) => {
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
  onDelete,
}: {
  recommendations: SongRecommendation[];
  onDelete: (rowIndex: number) => Promise<void>;
}) {
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
              <Th>Canción</Th>
              <Th>Artistas</Th>
              <Th aria-label="Acciones"></Th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-subtle italic py-10 px-4">
                  Todavía no hay recomendaciones.
                </td>
              </tr>
            )}
            {sorted.map((rec, idx) => (
              <tr
                key={`${rec.timestamp}-${rec.trackId}-${idx}`}
                className="border-t border-bone hover:bg-soft/30 transition-colors"
              >
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
                  <button
                    type="button"
                    className="icon-action icon-action--danger ml-2"
                    title="Borrar recomendación"
                    aria-label={`Borrar ${rec.trackName}`}
                    onClick={() => {
                      if (confirm(`¿Borrar "${rec.trackName}" de la lista?`)) void onDelete(rec.rowIndex);
                    }}
                  >
                    <LuTrash2 size={17} aria-hidden="true" />
                  </button>
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

function PeopleCellInner({ adults, kids }: { adults: number; kids: number }) {
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


/**
 * Alta y baja de mesas. Se edita la lista entera y se guarda de una: el
 * backend pisa la pestaña completa, así nunca queda a mitad de camino.
 *
 * El número de mesa es lo que se guarda junto a cada invitado, así que
 * cambiarlo resienta gente en silencio. Por eso el número no se edita: se
 * borra la mesa y se crea otra.
 */
function TablesEditor({
  venueTables,
  onSave,
}: {
  venueTables: readonly VenueTable[];
  onSave: (tables: VenueTable[]) => Promise<void>;
}) {
  const [rows, setRows] = useState<VenueTable[]>(() => venueTables.map((t) => ({ ...t })));
  const [error, setError] = useState<string | null>(null);

  const nextNumber = rows.reduce((max, row) => Math.max(max, row.number), 0) + 1;

  function update(index: number, patch: Partial<VenueTable>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="bg-white border border-bone rounded-lg shadow-sm p-5 mb-6">
      <h3 className="text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium mb-4">
        Mesas del salón
      </h3>

      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={row.number} className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm text-muted tabular-nums shrink-0">Mesa {row.number}</span>
            <label className="flex items-center gap-2 text-sm text-muted">
              Lugares
              <input
                type="number"
                min={1}
                className="admin-input w-20"
                value={row.seats}
                onChange={(e) => update(index, { seats: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
            <input
              className="admin-input flex-1 min-w-40"
              placeholder="Sector (opcional)"
              value={row.zone}
              onChange={(e) => update(index, { zone: e.target.value })}
            />
            <button
              type="button"
              className="icon-action icon-action--danger"
              title={`Borrar la mesa ${row.number}`}
              aria-label={`Borrar la mesa ${row.number}`}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              <LuTrash2 size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-subtle italic m-0">No hay mesas todavía.</p>
        )}
      </div>

      {error && <p className="text-sm text-danger mt-3 mb-0">{error}</p>}

      <div className="flex flex-wrap gap-3 mt-5">
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            setRows((current) => [...current, { number: nextNumber, seats: 10, zone: "" }])
          }
        >
          Agregar mesa
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setError(null);
            void onSave(rows).catch((err: unknown) => setError(errorMessage(err)));
          }}
        >
          Guardar mesas
        </button>
      </div>
    </div>
  );
}

/** Una lista de textos se edita como un renglón por ítem. */
function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function InvitationField({
  label,
  hint,
  value,
  rows = 1,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  rows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.78rem] uppercase tracking-[0.16em] text-muted font-medium">
        {label}
      </span>
      {rows > 1 ? (
        <textarea
          className="admin-input resize-y"
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input className="admin-input" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <span className="text-[0.78rem] text-subtle">{hint}</span>}
    </label>
  );
}

/**
 * Edición del contenido de la invitación. Guarda el objeto entero de una, no
 * campo por campo, así el Sheet nunca queda con una mezcla de dos versiones.
 */
function InvitationTab({
  invitation,
  onSave,
}: {
  invitation: EventConfig;
  onSave: (next: EventConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState<EventConfig>(() => structuredClone(invitation));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof EventConfig>(key: K, value: EventConfig[K]) {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setEvent(index: number, patch: Partial<EventOccurrence>) {
    set(
      "events",
      draft.events.map((occurrence, i) => (i === index ? { ...occurrence, ...patch } : occurrence)),
    );
  }

  function setAccount(index: number, patch: Partial<GiftAccount>) {
    set(
      "giftAccounts",
      draft.giftAccounts.map((account, i) => (i === index ? { ...account, ...patch } : account)),
    );
  }

  return (
    <section className="max-w-3xl">
      <p className="text-sm text-muted mb-6">
        Lo que guardes acá se ve en la invitación al instante, sin republicar el sitio.
      </p>

      <div className="bg-white border border-bone rounded-lg shadow-sm p-5 mb-5 grid gap-4">
        <h3 className="text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium m-0">
          Encabezado
        </h3>
        <InvitationField label="Pareja" value={draft.couple} onChange={(v) => set("couple", v)} />
        <InvitationField
          label="Firma del pie"
          value={draft.signature}
          onChange={(v) => set("signature", v)}
        />
        <InvitationField label="Frase" value={draft.tagline} onChange={(v) => set("tagline", v)} />
        <InvitationField
          label="Fecha del titular"
          hint="La que se muestra en la portada y el hero."
          value={draft.date}
          onChange={(v) => set("date", v)}
        />
        <InvitationField
          label="Foto"
          hint="Ruta dentro del sitio, por ejemplo /sebayemi.jpeg, o una URL completa."
          value={draft.photoUrl}
          onChange={(v) => set("photoUrl", v)}
        />
        <InvitationField
          label="Audio propio"
          hint="Ruta del mp3 en el sitio, ej. /cancion.mp3. Si lo cargás, suena el tema entero desde el principio y se ignora Spotify."
          value={draft.audioUrl}
          onChange={(v) => set("audioUrl", v)}
        />
        <InvitationField
          label="Título de la canción"
          value={draft.audioTitle}
          onChange={(v) => set("audioTitle", v)}
        />
        <InvitationField
          label="Artista"
          value={draft.audioArtist}
          onChange={(v) => set("audioArtist", v)}
        />
        <InvitationField
          label="Tema de Spotify"
          hint="Vacío quita la portada con el botón Ver invitación."
          value={draft.spotifyTrackUrl}
          onChange={(v) => set("spotifyTrackUrl", v)}
        />
      </div>

      {draft.events.map((occurrence, index) => (
        <div key={index} className="bg-white border border-bone rounded-lg shadow-sm p-5 mb-5 grid gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium m-0">
              Evento {index + 1}
            </h3>
            <button
              type="button"
              className="icon-action icon-action--danger"
              title="Borrar este evento"
              aria-label={`Borrar el evento ${index + 1}`}
              onClick={() => set("events", draft.events.filter((_, i) => i !== index))}
            >
              <LuTrash2 size={16} aria-hidden="true" />
            </button>
          </div>
          <InvitationField
            label="Título"
            value={occurrence.label}
            onChange={(v) => setEvent(index, { label: v })}
          />
          <InvitationField
            label="Fecha"
            value={occurrence.date}
            onChange={(v) => setEvent(index, { date: v })}
          />
          <InvitationField
            label="Hora"
            value={occurrence.time}
            onChange={(v) => setEvent(index, { time: v })}
          />
          <InvitationField
            label="Lugar"
            value={occurrence.venue}
            onChange={(v) => setEvent(index, { venue: v })}
          />
          <InvitationField
            label="Dirección"
            value={occurrence.address}
            onChange={(v) => setEvent(index, { address: v })}
          />
          <InvitationField
            label="Link del mapa"
            value={occurrence.mapUrl}
            onChange={(v) => setEvent(index, { mapUrl: v })}
          />
          <InvitationField
            label="Nota"
            hint="Renglón extra bajo el lugar. Opcional."
            value={occurrence.note ?? ""}
            onChange={(v) => setEvent(index, { note: v })}
          />
          <label className="flex flex-wrap items-center gap-4 text-sm text-muted">
            <span className="flex items-center gap-2">
              Ícono
              <select
                className="admin-input"
                value={occurrence.icon}
                onChange={(e) => setEvent(index, { icon: e.target.value as "rings" | "party" })}
              >
                <option value="rings">Alianzas</option>
                <option value="party">Copas</option>
              </select>
            </span>
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                className="admin-checkbox"
                checked={Boolean(occurrence.showDressCode)}
                onChange={(e) => setEvent(index, { showDressCode: e.target.checked })}
              />
              Mostrar la vestimenta acá
            </span>
          </label>
        </div>
      ))}

      <button
        type="button"
        className="btn-ghost mb-6"
        onClick={() =>
          set("events", [
            ...draft.events,
            { label: "", date: "", time: "", venue: "", address: "", mapUrl: "", icon: "party" },
          ])
        }
      >
        Agregar evento
      </button>

      <div className="bg-white border border-bone rounded-lg shadow-sm p-5 mb-5 grid gap-4">
        <h3 className="text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium m-0">
          Vestimenta
        </h3>
        <InvitationField
          label="Vestimenta"
          value={draft.dressCode}
          onChange={(v) => set("dressCode", v)}
        />
        <InvitationField
          label="Descripción"
          rows={2}
          value={draft.dressCodeDescription}
          onChange={(v) => set("dressCodeDescription", v)}
        />
        <InvitationField
          label="Ellas"
          hint="Un renglón por ítem."
          rows={4}
          value={draft.dressCodeWomen.join("\n")}
          onChange={(v) => set("dressCodeWomen", linesToArray(v))}
        />
        <InvitationField
          label="Ellos"
          hint="Un renglón por ítem."
          rows={4}
          value={draft.dressCodeMen.join("\n")}
          onChange={(v) => set("dressCodeMen", linesToArray(v))}
        />
        <InvitationField
          label="Evitar"
          hint="Un renglón por ítem."
          rows={4}
          value={draft.dressCodeAvoid.join("\n")}
          onChange={(v) => set("dressCodeAvoid", linesToArray(v))}
        />
      </div>

      <div className="bg-white border border-bone rounded-lg shadow-sm p-5 mb-5 grid gap-4">
        <h3 className="text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium m-0">
          Regalo y confirmación
        </h3>
        <InvitationField
          label="Texto del regalo"
          rows={3}
          value={draft.giftMessage}
          onChange={(v) => set("giftMessage", v)}
        />
        {draft.giftAccounts.map((account, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-2 border-t border-bone pt-4">
            <InvitationField
              label="Banco"
              value={account.bank}
              onChange={(v) => setAccount(index, { bank: v })}
            />
            <InvitationField
              label="Moneda"
              hint='Se compone como "Cuenta PREX pesos".'
              value={account.label}
              onChange={(v) => setAccount(index, { label: v })}
            />
            <InvitationField
              label="Número"
              value={account.value}
              onChange={(v) => setAccount(index, { value: v })}
            />
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <InvitationField
                  label="Titular"
                  value={account.holder}
                  onChange={(v) => setAccount(index, { holder: v })}
                />
              </div>
              <button
                type="button"
                className="icon-action icon-action--danger mb-1"
                title="Borrar esta cuenta"
                aria-label={`Borrar la cuenta ${account.bank}`}
                onClick={() => set("giftAccounts", draft.giftAccounts.filter((_, i) => i !== index))}
              >
                <LuTrash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="btn-ghost justify-self-start"
          onClick={() =>
            set("giftAccounts", [
              ...draft.giftAccounts,
              { bank: "", label: "", value: "", holder: "" },
            ])
          }
        >
          Agregar cuenta
        </button>
        <InvitationField
          label="Confirmar antes del"
          value={draft.rsvpDeadline}
          onChange={(v) => set("rsvpDeadline", v)}
        />
        <InvitationField
          label="Nota de puntualidad"
          rows={2}
          value={draft.punctualityNote}
          onChange={(v) => set("punctualityNote", v)}
        />
      </div>

      {error && <p className="text-sm text-danger mb-3">{error}</p>}
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setError(null);
            void onSave(draft)
              .then(() => setSaved(true))
              .catch((err: unknown) => setError(errorMessage(err)));
          }}
        >
          Guardar invitación
        </button>
        {saved && <span className="text-sm text-success">Guardado.</span>}
      </div>
    </section>
  );
}
