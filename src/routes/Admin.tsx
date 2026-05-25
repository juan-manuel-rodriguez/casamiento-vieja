import { useEffect, useMemo, useState } from "react";
import {
  checkAuth,
  listGuests,
  listRsvps,
  latestRsvpByGuestId,
  upsertGuest,
  deleteGuest,
  type Guest,
  type GuestInput,
  type Rsvp,
} from "../api/guests";
import {
  listSongRecommendations,
  type SongRecommendation,
} from "../api/songs";
import { clearPassphrase, loadPassphrase, savePassphrase } from "../auth/passphrase";

type ViewState =
  | { kind: "needs-passphrase"; error?: string }
  | { kind: "loading" }
  | {
      kind: "ready";
      guests: Guest[];
      latestByGuest: Map<string, Rsvp>;
      songRecommendations: SongRecommendation[];
    }
  | { kind: "error"; message: string };

type NewGuestDraft = Omit<GuestInput, "id" | "invitationSent">;

const EMPTY_DRAFT: NewGuestDraft = {
  name: "",
  adultSlots: 1,
  kidSlots: 0,
  contact: "",
  notes: "",
};

export function AdminPage() {
  const [auth, setAuth] = useState<string | null>(() => loadPassphrase());
  const [view, setView] = useState<ViewState>(
    auth ? { kind: "loading" } : { kind: "needs-passphrase" },
  );
  const [draft, setDraft] = useState<NewGuestDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
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
      const [guests, rsvps, songRecommendations] = await Promise.all([
        listGuests(activeAuth),
        listRsvps(activeAuth),
        listSongRecommendations(activeAuth),
      ]);
      setView({
        kind: "ready",
        guests,
        latestByGuest: latestRsvpByGuestId(rsvps),
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
    const base = window.location.origin + window.location.pathname.replace(/admin\/?$/, "");
    void navigator.clipboard.writeText(`${base}?id=${id}`);
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

  const { guests, latestByGuest, songRecommendations } = view;
  return (
    <main className="max-w-6xl mx-auto px-6 py-8 pb-24 font-sans">
      {busy && <BusyOverlay />}
      <Topbar onRefresh={() => void withBusy(() => refresh())} onSignOut={handleSignOut} />
      <Stats guests={guests} latestByGuest={latestByGuest} />

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

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          className="flex-1 min-w-[200px] px-4 py-3 border border-bone rounded bg-white focus:outline-none focus:border-gold"
          placeholder="Buscar por nombre o id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <GuestTable
        guests={guests}
        latestByGuest={latestByGuest}
        search={search}
        onToggleInvitation={toggleInvitationSent}
        onCopyLink={copyGuestLink}
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

function Stats({ guests, latestByGuest }: { guests: Guest[]; latestByGuest: Map<string, Rsvp> }) {
  const stats = useMemo(() => {
    const total = guests.length;
    const accepted = guests.filter((g) => latestByGuest.get(g.id)?.response === "accept");
    const declined = guests.filter((g) => latestByGuest.get(g.id)?.response === "decline");
    const pending = total - accepted.length - declined.length;
    const invitationsSent = guests.filter((g) => g.invitationSent).length;
    let adultsConfirmed = 0;
    let kidsConfirmed = 0;
    for (const g of accepted) {
      const r = latestByGuest.get(g.id);
      adultsConfirmed += r?.adultsConfirmed ?? 0;
      kidsConfirmed += r?.kidsConfirmed ?? 0;
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
  }, [guests, latestByGuest]);

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

type TableProps = {
  guests: Guest[];
  latestByGuest: Map<string, Rsvp>;
  search: string;
  onToggleInvitation: (guest: Guest) => void;
  onCopyLink: (id: string) => void;
  onDelete: (guest: Guest) => void;
};

function GuestTable({
  guests,
  latestByGuest,
  search,
  onToggleInvitation,
  onCopyLink,
  onDelete,
}: TableProps) {
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return guests;
    return guests.filter(
      (g) => g.name.toLowerCase().includes(needle) || g.id.toLowerCase().includes(needle),
    );
  }, [guests, search]);

  return (
    <div className="bg-white border border-bone rounded-lg overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-cream">
            <Th>Invitado</Th>
            <Th>Cupos</Th>
            <Th>Invitación</Th>
            <Th>Respuesta</Th>
            <Th>Confirmados</Th>
            <Th>Comentario</Th>
            <Th aria-label="Acciones"></Th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-subtle italic py-12 px-4">
                {guests.length === 0
                  ? "Todavía no hay invitados. Agregá el primero arriba."
                  : "No hay resultados para tu búsqueda."}
              </td>
            </tr>
          )}
          {filtered.map((guest) => {
            const rsvp = latestByGuest.get(guest.id);
            return (
              <tr key={guest.id} className="border-t border-bone hover:bg-soft/30 transition-colors">
                <Td>
                  <div className="font-medium text-ink">{guest.name}</div>
                  <div className="text-[0.78rem] text-subtle font-mono">{guest.id}</div>
                </Td>
                <Td>
                  <SlotsCell adults={guest.adultSlots} kids={guest.kidSlots} />
                </Td>
                <Td>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="admin-checkbox"
                      checked={guest.invitationSent}
                      onChange={() => onToggleInvitation(guest)}
                    />
                    {guest.invitationSent && <Pill variant="sent">Enviada</Pill>}
                  </label>
                </Td>
                <Td>
                  <ResponsePill response={rsvp?.response} />
                </Td>
                <Td>
                  {rsvp?.response === "accept" ? (
                    <SlotsCell adults={rsvp.adultsConfirmed} kids={rsvp.kidsConfirmed} />
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{rsvp?.comment ?? ""}</Td>
                <Td>
                  <div className="flex gap-2 justify-end">
                    <button className="icon-btn" onClick={() => onCopyLink(guest.id)}>
                      Copiar link
                    </button>
                    <button
                      className="icon-btn icon-btn--danger"
                      onClick={() => onDelete(guest)}
                    >
                      Eliminar
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

function Th({ children, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className="text-left px-4 py-3 text-[0.78rem] uppercase tracking-[0.16em] font-medium text-muted"
      {...rest}
    >
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-middle">{children}</td>;
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
                      className="icon-btn inline-block"
                      href={rec.spotifyUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Spotify
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

function ResponsePill({ response }: { response: Rsvp["response"] | undefined }) {
  if (response === "accept") return <Pill variant="accept">Acepta</Pill>;
  if (response === "decline") return <Pill variant="decline">No puede</Pill>;
  return <Pill variant="neutral">Pendiente</Pill>;
}

function Pill({
  variant,
  children,
}: {
  variant: "neutral" | "accept" | "decline" | "sent";
  children: React.ReactNode;
}) {
  const styles: Record<typeof variant, string> = {
    neutral: "bg-cream text-muted border-bone",
    accept: "bg-success-soft text-success border-success-border",
    decline: "bg-danger-soft text-danger border-danger-border",
    sent: "bg-soft text-gold-dark border-sand",
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
