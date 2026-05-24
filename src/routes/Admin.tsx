import { useEffect, useState } from "react";
import {
  loadInvitados,
  loadRespuestas,
  ultimaRespuestaPorId,
  upsertInvitado,
  deleteInvitado,
  type Invitado,
  type Respuesta,
} from "../api/sheets";
import { loadSession, signIn, signOut, type Session } from "../auth/google";

type Estado =
  | { kind: "needs-login" }
  | { kind: "loading" }
  | { kind: "ready"; invitados: Invitado[]; respuestas: Map<string, Respuesta> }
  | { kind: "error"; message: string };

type NuevoInvitado = {
  id: string;
  nombre: string;
  acompanantes: number;
  contacto: string;
  notas: string;
};

const NUEVO_VACIO: NuevoInvitado = {
  id: "",
  nombre: "",
  acompanantes: 0,
  contacto: "",
  notas: "",
};

export function Admin() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [estado, setEstado] = useState<Estado>(session ? { kind: "loading" } : { kind: "needs-login" });
  const [nuevo, setNuevo] = useState<NuevoInvitado>(NUEVO_VACIO);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!session) return;
    refrescar(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function refrescar(s: Session = session!) {
    setEstado({ kind: "loading" });
    try {
      const [invitados, respuestas] = await Promise.all([loadInvitados(s.token), loadRespuestas(s.token)]);
      setEstado({ kind: "ready", invitados, respuestas: ultimaRespuestaPorId(respuestas) });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error desconocido";
      setEstado({ kind: "error", message });
    }
  }

  async function handleSignIn() {
    try {
      const s = await signIn();
      setSession(s);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error de login";
      setEstado({ kind: "error", message });
    }
  }

  function handleSignOut() {
    signOut();
    setSession(null);
    setEstado({ kind: "needs-login" });
  }

  async function toggleInvitacion(inv: Invitado) {
    if (!session) return;
    try {
      await upsertInvitado(session.token, { ...inv, invitacionEnviada: !inv.invitacionEnviada });
      await refrescar();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error al guardar";
      setEstado({ kind: "error", message });
    }
  }

  async function eliminar(inv: Invitado) {
    if (!session) return;
    if (!confirm(`¿Eliminar a ${inv.nombre}?`)) return;
    try {
      await deleteInvitado(session.token, inv.id);
      await refrescar();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error al eliminar";
      setEstado({ kind: "error", message });
    }
  }

  async function agregarNuevo(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    const id = nuevo.id.trim();
    const nombre = nuevo.nombre.trim();
    if (!id || !nombre) return;
    setGuardando(true);
    try {
      await upsertInvitado(session.token, {
        id,
        nombre,
        acompanantes: nuevo.acompanantes,
        invitacionEnviada: false,
        contacto: nuevo.contacto,
        notas: nuevo.notas,
      });
      setNuevo(NUEVO_VACIO);
      await refrescar();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al guardar";
      setEstado({ kind: "error", message });
    } finally {
      setGuardando(false);
    }
  }

  function copiarLink(id: string) {
    const url = `${window.location.origin}${window.location.pathname.replace(/admin\/?$/, "")}?id=${id}`;
    navigator.clipboard.writeText(url);
  }

  if (estado.kind === "needs-login") {
    return (
      <main className="admin">
        <h1>Admin</h1>
        <p>Inicia sesión con tu cuenta de Google para administrar la lista.</p>
        <button onClick={handleSignIn}>Iniciar sesión con Google</button>
      </main>
    );
  }
  if (estado.kind === "loading") return <p>Cargando…</p>;
  if (estado.kind === "error") {
    return (
      <main className="admin">
        <p>Ups: {estado.message}</p>
        <button onClick={() => (session ? refrescar() : handleSignIn())}>Reintentar</button>
        <button onClick={handleSignOut}>Cerrar sesión</button>
      </main>
    );
  }

  const { invitados, respuestas } = estado;
  const total = invitados.length;
  const aceptaron = invitados.filter((i) => respuestas.get(i.id)?.respuesta === "acepto");
  const noPueden = invitados.filter((i) => respuestas.get(i.id)?.respuesta === "no_puedo");
  const sinResponder = total - aceptaron.length - noPueden.length;
  const enviadas = invitados.filter((i) => i.invitacionEnviada).length;
  const totalConfirmados = aceptaron.reduce((acc, i) => acc + (respuestas.get(i.id)?.cantidadConfirmados ?? 0), 0);

  return (
    <main className="admin">
      <header className="admin-header">
        <h1>Admin</h1>
        <div>
          <span>{session?.email}</span>
          <button onClick={handleSignOut}>Cerrar sesión</button>
          <button onClick={() => refrescar()}>Refrescar</button>
        </div>
      </header>

      <section className="resumen">
        <div>Total invitados: {total}</div>
        <div>Invitaciones enviadas: {enviadas}</div>
        <div>Aceptaron: {aceptaron.length}</div>
        <div>No pueden ir: {noPueden.length}</div>
        <div>Sin responder: {sinResponder}</div>
        <div>Personas confirmadas: {totalConfirmados}</div>
      </section>

      <form className="nuevo-invitado" onSubmit={agregarNuevo}>
        <h2>Agregar invitado</h2>
        <input
          placeholder="id (ej. juan-perez)"
          value={nuevo.id}
          onChange={(e) => setNuevo({ ...nuevo, id: e.target.value })}
          required
        />
        <input
          placeholder="Nombre"
          value={nuevo.nombre}
          onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
          required
        />
        <input
          type="number"
          min={0}
          placeholder="Acompañantes"
          value={nuevo.acompanantes}
          onChange={(e) => setNuevo({ ...nuevo, acompanantes: Number(e.target.value) })}
        />
        <input
          placeholder="Contacto"
          value={nuevo.contacto}
          onChange={(e) => setNuevo({ ...nuevo, contacto: e.target.value })}
        />
        <input
          placeholder="Notas"
          value={nuevo.notas}
          onChange={(e) => setNuevo({ ...nuevo, notas: e.target.value })}
        />
        <button type="submit" disabled={guardando}>
          {guardando ? "Guardando…" : "Agregar"}
        </button>
      </form>

      <table className="invitados">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Acompañantes</th>
            <th>Invitación enviada</th>
            <th>Respuesta</th>
            <th>Confirmados</th>
            <th>Comentario</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {invitados.map((inv) => {
            const r = respuestas.get(inv.id);
            return (
              <tr key={inv.id}>
                <td>{inv.nombre}</td>
                <td>{inv.acompanantes}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={inv.invitacionEnviada}
                    onChange={() => toggleInvitacion(inv)}
                  />
                </td>
                <td>{r ? r.respuesta : "—"}</td>
                <td>{r?.cantidadConfirmados ?? "—"}</td>
                <td>{r?.comentario ?? ""}</td>
                <td>
                  <button onClick={() => copiarLink(inv.id)}>Copiar link</button>
                  <button onClick={() => eliminar(inv)} className="secundario">
                    Eliminar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
