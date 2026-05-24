import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { loadInvitados, type Invitado } from "../api/sheets";
import { submitRsvp } from "../api/form";
import { EVENTO } from "../config";

type Estado =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "ready"; invitado: Invitado }
  | { kind: "sent" }
  | { kind: "error"; message: string };

export function Guest() {
  const [params] = useSearchParams();
  const id = params.get("id") ?? "";
  const [estado, setEstado] = useState<Estado>({ kind: "loading" });
  const [cantidad, setCantidad] = useState(1);
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    if (!id) return setEstado({ kind: "not-found" });
    loadInvitados()
      .then((invitados) => {
        const inv = invitados.find((i) => i.id === id);
        if (!inv) return setEstado({ kind: "not-found" });
        setCantidad(inv.acompanantes + 1);
        setEstado({ kind: "ready", invitado: inv });
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "Error desconocido";
        setEstado({ kind: "error", message });
      });
  }, [id]);

  async function responder(respuesta: "acepto" | "no_puedo") {
    if (estado.kind !== "ready") return;
    try {
      await submitRsvp({
        id: estado.invitado.id,
        respuesta,
        cantidadConfirmados: respuesta === "acepto" ? cantidad : 0,
        comentario,
      });
      setEstado({ kind: "sent" });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error al enviar";
      setEstado({ kind: "error", message });
    }
  }

  if (estado.kind === "loading") return <p>Cargando…</p>;
  if (estado.kind === "error") return <p>Ups: {estado.message}</p>;
  if (estado.kind === "not-found") {
    return (
      <main className="guest">
        <h1>{EVENTO.pareja}</h1>
        <p>No encontramos tu invitación. Revisá el link que te mandamos.</p>
      </main>
    );
  }
  if (estado.kind === "sent") {
    return (
      <main className="guest">
        <h1>¡Gracias!</h1>
        <p>Recibimos tu respuesta. Si necesitás cambiar algo, volvé a abrir el link.</p>
      </main>
    );
  }

  const { invitado } = estado;
  const maxAcompanantes = invitado.acompanantes + 1;
  return (
    <main className="guest">
      <h1>{EVENTO.pareja}</h1>
      <p className="evento">
        {EVENTO.fecha} · {EVENTO.lugar}
      </p>
      <h2>Hola, {invitado.nombre}</h2>
      <p>¡Nos encantaría que vengas! Confirmanos abajo.</p>

      <label>
        ¿Cuántos vienen? (vos + acompañantes)
        <input
          type="number"
          min={1}
          max={maxAcompanantes}
          value={cantidad}
          onChange={(e) => setCantidad(Math.max(1, Math.min(maxAcompanantes, Number(e.target.value))))}
        />
      </label>

      <label>
        Comentario (opcional)
        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} />
      </label>

      <div className="botones">
        <button onClick={() => responder("acepto")}>Confirmo asistencia</button>
        <button onClick={() => responder("no_puedo")} className="secundario">
          No voy a poder ir
        </button>
      </div>
    </main>
  );
}
