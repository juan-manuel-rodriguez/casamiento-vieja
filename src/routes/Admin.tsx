import { useEffect, useMemo, useState } from "react";
import {
  listGuests,
  listRsvps,
  latestRsvpByGuestId,
  upsertGuest,
  deleteGuest,
  type Guest,
  type GuestInput,
  type Rsvp,
} from "../api/guests";
import { loadSession, signIn, signOut, type Session } from "../auth/google";

type ViewState =
  | { kind: "needs-login" }
  | { kind: "loading" }
  | { kind: "ready"; guests: Guest[]; latestByGuest: Map<string, Rsvp> }
  | { kind: "error"; message: string };

const EMPTY_INPUT: GuestInput = {
  id: "",
  name: "",
  plusOnes: 0,
  invitationSent: false,
  contact: "",
  notes: "",
};

export function AdminPage() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [view, setView] = useState<ViewState>(
    session ? { kind: "loading" } : { kind: "needs-login" },
  );
  const [draft, setDraft] = useState<GuestInput>(EMPTY_INPUT);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session) return;
    void refresh(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function refresh(activeSession: Session = session!): Promise<void> {
    setView({ kind: "loading" });
    try {
      const [guests, rsvps] = await Promise.all([
        listGuests(activeSession.token),
        listRsvps(activeSession.token),
      ]);
      setView({ kind: "ready", guests, latestByGuest: latestRsvpByGuestId(rsvps) });
    } catch (err) {
      setView({ kind: "error", message: errorMessage(err) });
    }
  }

  async function handleSignIn() {
    try {
      const next = await signIn();
      setSession(next);
    } catch (err) {
      setView({ kind: "error", message: errorMessage(err) });
    }
  }

  function handleSignOut() {
    signOut();
    setSession(null);
    setView({ kind: "needs-login" });
  }

  async function toggleInvitationSent(guest: Guest) {
    if (!session) return;
    try {
      await upsertGuest(session.token, { ...guest, invitationSent: !guest.invitationSent });
      await refresh();
    } catch (err) {
      setView({ kind: "error", message: errorMessage(err) });
    }
  }

  async function handleDelete(guest: Guest) {
    if (!session) return;
    if (!confirm(`¿Eliminar a ${guest.name}?`)) return;
    try {
      await deleteGuest(session.token, guest.id);
      await refresh();
    } catch (err) {
      setView({ kind: "error", message: errorMessage(err) });
    }
  }

  async function handleSubmitDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    const id = draft.id.trim();
    const name = draft.name.trim();
    if (!id || !name) return;
    setSaving(true);
    try {
      await upsertGuest(session.token, { ...draft, id, name });
      setDraft(EMPTY_INPUT);
      await refresh();
    } catch (err) {
      setView({ kind: "error", message: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  function copyGuestLink(id: string) {
    const base = window.location.origin + window.location.pathname.replace(/admin\/?$/, "");
    void navigator.clipboard.writeText(`${base}?id=${id}`);
  }

  if (view.kind === "needs-login") {
    return (
      <EmptyAdminState eyebrow="Acceso" title="Panel de administración">
        <p>Iniciá sesión con la cuenta de Google autorizada para gestionar la lista de invitados.</p>
        <button className="btn-primary mt-6" onClick={handleSignIn}>
          Iniciar sesión con Google
        </button>
      </EmptyAdminState>
    );
  }
  if (view.kind === "loading") {
    return (
      <EmptyAdminState eyebrow="Un momento" title="Cargando…" />
    );
  }
  if (view.kind === "error") {
    return (
      <EmptyAdminState eyebrow="Algo salió mal" title="No pudimos cargar los datos">
        <div className="mt-4 px-4 py-3 rounded bg-danger-soft text-danger border border-danger-border text-sm">
          {view.message}
        </div>
        <div className="flex gap-3 mt-6">
          <button
            className="btn-primary"
            onClick={() => (session ? void refresh() : void handleSignIn())}
          >
            Reintentar
          </button>
          <button className="btn-ghost" onClick={handleSignOut}>
            Cerrar sesión
          </button>
        </div>
      </EmptyAdminState>
    );
  }

  const { guests, latestByGuest } = view;
  return (
    <main className="max-w-6xl mx-auto px-6 py-8 pb-24 font-sans">
      <Topbar email={session!.email} onRefresh={() => void refresh()} onSignOut={handleSignOut} />
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
            <DraftField label="ID (slug)" required>
              <input
                className="admin-input"
                placeholder="juan-perez"
                value={draft.id}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
                required
              />
            </DraftField>
            <DraftField label="Nombre" required>
              <input
                className="admin-input"
                placeholder="Juan Pérez"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </DraftField>
            <DraftField label="Acompañantes">
              <input
                type="number"
                min={0}
                className="admin-input"
                value={draft.plusOnes}
                onChange={(e) => setDraft({ ...draft, plusOnes: Number(e.target.value) })}
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
              onClick={() => setDraft(EMPTY_INPUT)}
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
    </main>
  );
}

/* ---------- Subcomponents ---------- */

function Topbar({
  email,
  onRefresh,
  onSignOut,
}: {
  email: string;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-bone mb-8">
      <h1 className="font-display italic text-3xl m-0">Lista de invitados</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>{email}</span>
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
    const confirmedPeople = accepted.reduce(
      (acc, g) => acc + (latestByGuest.get(g.id)?.partySize ?? 0),
      0,
    );
    return { total, accepted, declined, pending, invitationsSent, confirmedPeople };
  }, [guests, latestByGuest]);

  return (
    <section className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 mb-10">
      <StatCard label="Invitados" value={stats.total} />
      <StatCard label="Invitaciones enviadas" value={stats.invitationsSent} sub={`de ${stats.total}`} />
      <StatCard label="Aceptaron" value={stats.accepted.length} />
      <StatCard label="No pueden" value={stats.declined.length} />
      <StatCard label="Sin responder" value={stats.pending} />
      <StatCard label="Personas confirmadas" value={stats.confirmedPeople} accent />
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-5 shadow-sm flex flex-col gap-2 ${
        accent ? "bg-soft border-sand" : "bg-white border-bone"
      }`}
    >
      <span className="text-[0.78rem] uppercase tracking-[0.16em] text-subtle">{label}</span>
      <span className="font-display text-3xl leading-none text-ink">{value}</span>
      {sub && <span className="text-sm text-muted">{sub}</span>}
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
            <Th>Acomp.</Th>
            <Th>Invitación</Th>
            <Th>Respuesta</Th>
            <Th>Confirm.</Th>
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
                <Td>{guest.plusOnes}</Td>
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
                <Td>{rsvp?.partySize ?? "—"}</Td>
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
