import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchPublicGuest, type PublicGuest } from "../api/guests";
import { submitRsvp, type RsvpResponse } from "../api/rsvp";
import { EVENT } from "../config";

type ViewState =
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "ready"; guest: PublicGuest }
  | { kind: "sent"; response: RsvpResponse }
  | { kind: "error"; message: string };

export function GuestPage() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const isDemo = searchParams.has("demo");

  const initialView: ViewState = isDemo
    ? { kind: "ready", guest: { id: "demo", name: "María Sol", plusOnes: 2 } }
    : id
      ? { kind: "loading" }
      : { kind: "not-found" };

  const [view, setView] = useState<ViewState>(initialView);
  const [partySize, setPartySize] = useState(
    initialView.kind === "ready" ? initialView.guest.plusOnes + 1 : 1,
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || isDemo) return;
    fetchPublicGuest(id)
      .then((guest) => {
        if (!guest) return setView({ kind: "not-found" });
        setPartySize(guest.plusOnes + 1);
        setView({ kind: "ready", guest });
      })
      .catch((err: unknown) => setView({ kind: "error", message: errorMessage(err) }));
  }, [id, isDemo]);

  const heroStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!EVENT.photoUrl) return undefined;
    return { backgroundImage: `url("${EVENT.photoUrl}")` };
  }, []);

  async function respond(response: RsvpResponse) {
    if (view.kind !== "ready" || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitRsvp({
        id: view.guest.id,
        response,
        partySize: response === "accept" ? partySize : 0,
        comment: comment.trim(),
      });
      setView({ kind: "sent", response });
    } catch (err: unknown) {
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <Hero photoStyle={heroStyle} />
      <main className="flex-1">
        {view.kind === "loading" && <StatusBlock eyebrow="Un momento" title="Cargando tu invitación…" />}
        {view.kind === "error" && (
          <StatusBlock eyebrow="Algo salió mal" title="Hubo un problema">
            <ErrorBanner message={view.message} />
            <button className="btn-ghost mt-6" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </StatusBlock>
        )}
        {view.kind === "not-found" && (
          <StatusBlock eyebrow="Hmm" title="No encontramos tu invitación">
            <p>Revisá el link que te mandamos o contactanos para que te enviemos uno nuevo.</p>
          </StatusBlock>
        )}
        {view.kind === "ready" && (
          <>
            <Greeting name={view.guest.name} />
            <EventDetails />
            <RsvpForm
              guest={view.guest}
              partySize={partySize}
              setPartySize={setPartySize}
              comment={comment}
              setComment={setComment}
              submitting={submitting}
              submitError={submitError}
              onRespond={respond}
            />
          </>
        )}
        {view.kind === "sent" && <ThankYouState response={view.response} />}
      </main>
      <footer className="border-t border-bone py-12 px-6 text-center text-sm text-subtle">
        Con amor, {EVENT.couple}
      </footer>
    </div>
  );
}

/* ---------- Sections ---------- */

function Hero({ photoStyle }: { photoStyle?: React.CSSProperties }) {
  const hasPhoto = Boolean(EVENT.photoUrl);
  return (
    <header className="relative isolate flex flex-col items-center justify-center text-center px-6 py-24 sm:py-32 min-h-[560px] overflow-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(234,217,184,0.7) 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, rgba(234,217,184,0.5) 0%, transparent 55%), linear-gradient(180deg, #f8f3ea 0%, #f1ebdd 100%)",
        }}
      />
      {hasPhoto && (
        <>
          <div
            className="absolute inset-0 -z-20 bg-center bg-cover saturate-[0.85]"
            style={photoStyle}
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ivory/55 to-ivory/90" />
        </>
      )}
      <Eyebrow className="mb-6">Nos casamos</Eyebrow>
      <h1 className="font-display italic font-normal text-[clamp(3.25rem,12vw,6.5rem)] leading-[0.95] tracking-tight text-ink m-0">
        {EVENT.couple}
      </h1>
      <Ornament />
      <p className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 font-sans text-sm uppercase tracking-[0.18em] text-muted m-0">
        <strong className="font-medium text-ink tracking-[0.22em]">{EVENT.date}</strong>
        <span className="hidden sm:inline" aria-hidden="true">·</span>
        <span>{EVENT.venue}</span>
      </p>
    </header>
  );
}

function Greeting({ name }: { name: string }) {
  const firstName = name.trim().split(/\s+/)[0] ?? name;
  return (
    <Section>
      <Eyebrow>Bienvenida / Bienvenido</Eyebrow>
      <h2 className="font-display italic font-normal text-4xl sm:text-5xl mb-4">
        Hola, <span className="text-gold-dark">{firstName}</span>
      </h2>
      <p className="text-muted max-w-prose mx-auto">
        Queremos compartir con vos uno de los días más importantes de nuestra vida. Esperamos que
        puedas acompañarnos para celebrarlo juntos.
      </p>
    </Section>
  );
}

function EventDetails() {
  return (
    <Section wide>
      <Eyebrow>El plan</Eyebrow>
      <h2 className="font-display italic font-normal text-4xl sm:text-5xl mb-8">Detalles del evento</h2>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 text-left">
        <DetailTile eyebrow="Cuándo" title={EVENT.date}>
          {EVENT.time && <p className="text-sm text-muted m-0">A partir de las {EVENT.time}</p>}
        </DetailTile>
        <DetailTile eyebrow="Dónde" title={EVENT.venue}>
          {EVENT.address && <p className="text-sm text-muted m-0">{EVENT.address}</p>}
          {EVENT.mapUrl && (
            <a
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-gold-dark hover:text-ink transition-colors no-underline"
              href={EVENT.mapUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <MapPinIcon />
              Cómo llegar
            </a>
          )}
        </DetailTile>
        <DressCodeTile />
        <DetailTile eyebrow="Confirmar antes del" title={EVENT.rsvpDeadline}>
          <p className="text-sm text-muted m-0">Para que podamos organizar todo a tiempo.</p>
        </DetailTile>
      </div>
    </Section>
  );
}

function DetailTile({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-bone rounded-lg p-6 shadow-sm flex flex-col gap-2">
      <span className="text-[0.78rem] uppercase tracking-[0.22em] text-subtle font-medium">
        {eyebrow}
      </span>
      <h3 className="font-display text-2xl m-0 text-ink">{title}</h3>
      {children}
    </div>
  );
}

type RsvpFormProps = {
  guest: PublicGuest;
  partySize: number;
  setPartySize: (value: number) => void;
  comment: string;
  setComment: (value: string) => void;
  submitting: boolean;
  submitError: string | null;
  onRespond: (response: RsvpResponse) => void;
};

function RsvpForm({
  guest,
  partySize,
  setPartySize,
  comment,
  setComment,
  submitting,
  submitError,
  onRespond,
}: RsvpFormProps) {
  const maxPartySize = guest.plusOnes + 1;
  const canDec = partySize > 1;
  const canInc = partySize < maxPartySize;
  return (
    <Section id="rsvp">
      <Eyebrow>Tu respuesta</Eyebrow>
      <div className="bg-white border border-bone rounded-2xl shadow-md p-8 sm:p-12 mt-6 text-left">
        <h2 className="font-display italic font-normal text-4xl text-center mb-2">
          Confirmá tu asistencia
        </h2>
        <p className="text-muted text-center mb-8">
          {maxPartySize > 1
            ? `Tu invitación incluye hasta ${maxPartySize} personas.`
            : "Tu invitación es individual."}
        </p>
        {submitError && <ErrorBanner message={submitError} />}

        {maxPartySize > 1 && (
          <div className="mb-6">
            <FieldLabel htmlFor="party-size">¿Cuántos vienen?</FieldLabel>
            <div id="party-size" className="flex items-center gap-3">
              <StepperButton
                onClick={() => setPartySize(Math.max(1, partySize - 1))}
                disabled={!canDec || submitting}
                ariaLabel="Disminuir"
              >
                −
              </StepperButton>
              <span
                className="font-display text-3xl min-w-[2ch] text-center"
                aria-live="polite"
              >
                {partySize}
              </span>
              <StepperButton
                onClick={() => setPartySize(Math.min(maxPartySize, partySize + 1))}
                disabled={!canInc || submitting}
                ariaLabel="Aumentar"
              >
                +
              </StepperButton>
              <span className="text-sm text-subtle">de {maxPartySize}</span>
            </div>
          </div>
        )}

        <div className="mb-8">
          <FieldLabel htmlFor="comment">Comentario (opcional)</FieldLabel>
          <textarea
            id="comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Restricciones alimentarias, algo que quieras contarnos…"
            disabled={submitting}
            className="w-full min-h-24 px-4 py-3 bg-ivory border border-bone rounded focus:outline-none focus:border-gold focus:bg-white transition-colors resize-y"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={() => onRespond("accept")}
            disabled={submitting}
          >
            {submitting ? "Enviando…" : "Confirmo asistencia"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onRespond("decline")}
            disabled={submitting}
          >
            No voy a poder ir
          </button>
        </div>
      </div>
    </Section>
  );
}

/* ---------- Primitives ---------- */

function Section({
  children,
  wide,
  id,
}: {
  children: React.ReactNode;
  wide?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`${wide ? "max-w-4xl" : "max-w-2xl"} mx-auto px-6 py-16 sm:py-20 text-center`}
    >
      {children}
    </section>
  );
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`font-sans text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium m-0 mb-5 ${className ?? ""}`}
    >
      {children}
    </p>
  );
}

function Ornament() {
  return (
    <div
      className="my-8 mx-auto w-48 max-w-[60vw] flex items-center justify-center gap-3 text-sand"
      aria-hidden="true"
    >
      <span className="flex-1 h-px bg-current" />
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-gold" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2 L22 12 L12 22 L2 12 Z" />
      </svg>
      <span className="flex-1 h-px bg-current" />
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-sans text-[0.78rem] uppercase tracking-[0.18em] text-muted font-medium mb-2"
    >
      {children}
    </label>
  );
}

function StepperButton({
  onClick,
  disabled,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="w-9 h-9 rounded-full border border-sand bg-white text-ink text-xl leading-none inline-flex items-center justify-center transition-colors hover:enabled:bg-ink hover:enabled:text-white hover:enabled:border-ink disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-5 px-4 py-3 rounded bg-danger-soft text-danger border border-danger-border text-sm text-left">
      {message}
    </div>
  );
}

function StatusBlock({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="max-w-xl mx-auto px-6 py-24 text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="font-display italic font-normal text-4xl sm:text-5xl mb-4">{title}</h1>
      <div className="text-muted">{children}</div>
    </section>
  );
}

function ThankYouState({ response }: { response: RsvpResponse }) {
  if (response === "accept") {
    return (
      <StatusBlock eyebrow="Gracias" title="¡Nos vemos pronto!">
        <p>Recibimos tu confirmación. Si necesitás cambiar algo, abrí de nuevo el link.</p>
      </StatusBlock>
    );
  }
  return (
    <StatusBlock eyebrow="Gracias por avisarnos" title="Te vamos a extrañar">
      <p>Recibimos tu respuesta. Si algo cambia, abrí de nuevo el link y avisanos.</p>
    </StatusBlock>
  );
}

function DressCodeTile() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const women: readonly string[] = EVENT.dressCodeWomen ?? [];
  const men: readonly string[] = EVENT.dressCodeMen ?? [];
  const avoid: readonly string[] = EVENT.dressCodeAvoid ?? [];
  const description = EVENT.dressCodeDescription ?? "";
  const hasDetails =
    description.length > 0 || women.length > 0 || men.length > 0 || avoid.length > 0;

  function open() {
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="bg-white border border-bone rounded-lg p-6 shadow-sm flex flex-col gap-2 text-left transition-colors hover:bg-cream/40 focus:outline-none focus:border-gold cursor-pointer"
      >
        <span className="text-[0.78rem] uppercase tracking-[0.22em] text-subtle font-medium">
          Dress code
        </span>
        <h3 className="font-display text-2xl m-0 text-ink">{EVENT.dressCode}</h3>
        {hasDetails && (
          <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-gold-dark">
            Ver detalles
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        className="bg-transparent p-0 m-auto backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
      >
        <div className="bg-white border border-bone rounded-2xl shadow-lg w-[min(520px,92vw)] max-h-[92vh] overflow-y-auto p-8 text-left">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <span className="text-[0.78rem] uppercase tracking-[0.22em] text-subtle font-medium">
                Dress code
              </span>
              <h3 className="font-display italic text-3xl m-0 text-ink mt-1">
                {EVENT.dressCode}
              </h3>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="text-subtle hover:text-ink text-2xl leading-none -mt-1 -mr-1 px-2 cursor-pointer"
            >
              ×
            </button>
          </div>

          {description && <p className="text-muted text-sm mb-6">{description}</p>}

          {women.length > 0 && (
            <DressCodeSection title="Ellas" items={women} variant="yes" />
          )}
          {men.length > 0 && (
            <DressCodeSection title="Ellos" items={men} variant="yes" />
          )}
          {avoid.length > 0 && (
            <DressCodeSection title="Mejor evitar" items={avoid} variant="no" />
          )}

          <button type="button" onClick={close} className="btn-primary w-full mt-2">
            Entendido
          </button>
        </div>
      </dialog>
    </>
  );
}

function DressCodeSection({
  title,
  items,
  variant,
}: {
  title: string;
  items: readonly string[];
  variant: "yes" | "no";
}) {
  return (
    <div className="mb-5">
      <h4 className="text-[0.78rem] uppercase tracking-[0.18em] text-muted font-medium m-0 mb-3">
        {title}
      </h4>
      <ul className="flex flex-col gap-2 text-ink list-none p-0 m-0">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm">
            {variant === "yes" ? <CheckIcon /> : <ProhibitedIcon />}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5 mt-px text-success flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function ProhibitedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5 mt-px text-danger flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4 -mt-px"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Error desconocido";
}
