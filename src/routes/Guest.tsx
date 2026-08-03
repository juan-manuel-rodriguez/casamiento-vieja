import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchPublicGuest, type PublicGuest } from "../api/guests";
import { submitRsvp, type RsvpResponse } from "../api/rsvp";
import {
  searchSongs,
  submitSongRecommendation,
  type SpotifyTrack,
} from "../api/songs";
import { EVENT } from "../config";
import { firstName } from "../lib/names";

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
    ? {
        kind: "ready",
        guest: { id: "demo", name: "María Sol", adultSlots: 2, kidSlots: 1 },
      }
    : id
      ? { kind: "loading" }
      : { kind: "not-found" };

  const trackId = useMemo(
    () => (EVENT.spotifyTrackUrl ? extractSpotifyTrackId(EVENT.spotifyTrackUrl) : null),
    [],
  );

  const [view, setView] = useState<ViewState>(initialView);
  const [entered, setEntered] = useState(isDemo || !trackId);
  const playerRef = useRef<{ play: () => void } | null>(null);
  const [adultsConfirmed, setAdultsConfirmed] = useState(
    initialView.kind === "ready" ? initialView.guest.adultSlots : 1,
  );
  const [kidsConfirmed, setKidsConfirmed] = useState(
    initialView.kind === "ready" ? initialView.guest.kidSlots : 0,
  );
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleEnter() {
    setEntered(true);
    // SpotifyPlayer queues this internally if its controller isn't ready
    // yet, then flushes it on the "ready" event. One call is enough.
    playerRef.current?.play();
  }

  // Preload the Spotify IFrame API script as early as possible so that
  // by the time SpotifyPlayer mounts the script is already cached.
  useEffect(() => {
    if (!trackId) return;
    if (document.getElementById("spotify-iframe-api-script")) return;
    const script = document.createElement("script");
    script.id = "spotify-iframe-api-script";
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    document.body.appendChild(script);
  }, [trackId]);

  useEffect(() => {
    if (!id || isDemo) return;
    fetchPublicGuest(id)
      .then((guest) => {
        if (!guest) return setView({ kind: "not-found" });
        setAdultsConfirmed(guest.adultSlots);
        setKidsConfirmed(guest.kidSlots);
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
        adultsConfirmed: response === "accept" ? adultsConfirmed : 0,
        kidsConfirmed: response === "accept" ? kidsConfirmed : 0,
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
        {/* The greeting renders only when guest data is loaded. The
            SpotifyPlayer is only rendered while we have a real guest to
            entertain (loading or ready): on "sent" the embed flips to a
            "Listen on Spotify" upsell, and on "not-found" or "error" the
            music feels out of place. Mounting it during "loading" keeps
            the iframe and IFrame API controller ready by the time the
            cover is dismissed. */}
        {view.kind === "ready" && <Greeting name={view.guest.name} />}
        {trackId && (view.kind === "loading" || view.kind === "ready") && (
          <SpotifyPlayer trackId={trackId} playerRef={playerRef} />
        )}
        {view.kind === "ready" && (
          <>
            <EventDetails />
            <RsvpForm
              guest={view.guest}
              adultsConfirmed={adultsConfirmed}
              setAdultsConfirmed={setAdultsConfirmed}
              kidsConfirmed={kidsConfirmed}
              setKidsConfirmed={setKidsConfirmed}
              comment={comment}
              setComment={setComment}
              submitting={submitting}
              submitError={submitError}
              onRespond={respond}
            />
            <SongRecommendation guestId={view.guest.id} />
            <GiftAccountSection />
          </>
        )}
        {view.kind === "sent" && (
          <>
            <ThankYouState response={view.response} />
            <SongRecommendation guestId={isDemo ? "demo" : id} />
          </>
        )}
      </main>
      <footer className="border-t border-bone py-12 px-6 text-center text-sm text-subtle">
        Con amor, {EVENT.couple}
      </footer>
      {!entered && <CoverScreen onEnter={handleEnter} />}
    </div>
  );
}

function CoverScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center text-center px-6 animate-[fade-in_300ms_ease]"
      style={{
        background:
          "radial-gradient(ellipse at 20% 0%, rgba(234,217,184,0.85) 0%, transparent 55%), radial-gradient(ellipse at 80% 100%, rgba(234,217,184,0.6) 0%, transparent 60%), linear-gradient(180deg, #f8f3ea 0%, #f1ebdd 100%)",
      }}
    >
      <p className="font-sans text-[0.78rem] uppercase tracking-[0.22em] text-muted font-medium m-0 mb-6">
        Nos casamos
      </p>
      <h1 className="font-display italic font-normal text-[clamp(3rem,11vw,5.5rem)] leading-[0.95] tracking-tight text-ink m-0">
        {EVENT.couple}
      </h1>
      <div className="my-8 w-48 max-w-[60vw] flex items-center justify-center gap-3 text-sand">
        <span className="flex-1 h-px bg-current" />
        <svg
          viewBox="0 0 24 24"
          className="w-3.5 h-3.5 text-gold"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M12 2 L22 12 L12 22 L2 12 Z" />
        </svg>
        <span className="flex-1 h-px bg-current" />
      </div>
      <p className="font-sans text-sm uppercase tracking-[0.18em] text-muted m-0 mb-10">
        {EVENT.date}
      </p>
      <button type="button" onClick={onEnter} className="btn-primary">
        Ver invitación
      </button>
      <p className="mt-6 text-[0.78rem] text-subtle">Con música 🎵</p>
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
  return (
    <Section>
      <Eyebrow>Bienvenida / Bienvenido</Eyebrow>
      <h2 className="font-display italic font-normal text-4xl sm:text-5xl mb-4">
        Hola, <span className="text-gold-dark">{firstName(name)}</span>
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
          {EVENT.time && (
            <p className="text-sm text-muted m-0">A partir de las {EVENT.time}, por favor ser puntuales.</p>
          )}
        </DetailTile>
        <DetailTile eyebrow="Dónde" title={EVENT.venue}>
          {EVENT.address && <p className="text-sm text-muted m-0">{EVENT.address}</p>}
          {EVENT.mapUrl && (
            <a
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-gold-dark underline underline-offset-4 decoration-soft hover:text-ink transition-colors"
              href={EVENT.mapUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <MapPinIcon />
              ¿Cómo llego?
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

function GiftAccountSection() {
  return (
    <Section>
      <Eyebrow>Regalo</Eyebrow>
      <div className="bg-white border border-bone rounded-2xl shadow-md p-8 sm:p-12 mt-6 text-center">
        <h2 className="font-display italic font-normal text-4xl sm:text-5xl mb-4">Lista de regalos</h2>
        <p className="text-muted max-w-prose mx-auto mb-6">{EVENT.giftMessage}</p>
        <p className="inline-flex items-center rounded-full border border-sand bg-soft/60 px-5 py-1.5 mb-5 text-[0.78rem] uppercase tracking-[0.2em] text-gold-dark font-medium">
          Banco {EVENT.giftBank}
        </p>
        <div className="max-w-sm mx-auto">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-bone bg-cream/40 px-6 py-5">
            <span className="text-[0.78rem] uppercase tracking-[0.22em] text-subtle font-medium">
              {EVENT.giftAccountLabel}
            </span>
            <span className="font-sans text-xl sm:text-2xl tracking-[0.06em] text-ink tabular-nums">
              {EVENT.giftAccountValue}
            </span>
          </div>
          <p className="text-[0.8rem] text-subtle mt-3">
            La cuenta está a nombre de {EVENT.giftAccountHolder}.
          </p>
        </div>
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
  adultsConfirmed: number;
  setAdultsConfirmed: (value: number) => void;
  kidsConfirmed: number;
  setKidsConfirmed: (value: number) => void;
  comment: string;
  setComment: (value: string) => void;
  submitting: boolean;
  submitError: string | null;
  onRespond: (response: RsvpResponse) => void;
};

function RsvpForm({
  guest,
  adultsConfirmed,
  setAdultsConfirmed,
  kidsConfirmed,
  setKidsConfirmed,
  comment,
  setComment,
  submitting,
  submitError,
  onRespond,
}: RsvpFormProps) {
  const { adultSlots, kidSlots } = guest;
  const adultSummary =
    adultSlots === 1 ? "1 adulto" : `${adultSlots} adultos`;
  const kidSummary =
    kidSlots === 0 ? "" : kidSlots === 1 ? " y 1 niño" : ` y ${kidSlots} niños`;
  return (
    <Section id="rsvp">
      <Eyebrow>Tu respuesta</Eyebrow>
      <div className="bg-white border border-bone rounded-2xl shadow-md p-8 sm:p-12 mt-6 text-left">
        <h2 className="font-display italic font-normal text-4xl text-center mb-2">
          Confirmá tu asistencia
        </h2>
        <p className="text-muted text-center mb-8">
          Tu invitación incluye hasta {adultSummary}
          {kidSummary}.
        </p>
        {submitError && <ErrorBanner message={submitError} />}

        {adultSlots > 1 && (
          <CountStepper
            id="adults"
            label="Adultos"
            value={adultsConfirmed}
            min={1}
            max={adultSlots}
            disabled={submitting}
            onChange={setAdultsConfirmed}
          />
        )}
        {kidSlots > 0 && (
          <CountStepper
            id="kids"
            label="Niños"
            value={kidsConfirmed}
            min={0}
            max={kidSlots}
            disabled={submitting}
            onChange={setKidsConfirmed}
          />
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

function CountStepper({
  id,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div className="mb-5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div id={id} className="flex items-center gap-3">
        <StepperButton
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={disabled || value <= min}
          ariaLabel={`Disminuir ${label.toLowerCase()}`}
        >
          −
        </StepperButton>
        <span className="font-display text-3xl min-w-[2ch] text-center" aria-live="polite">
          {value}
        </span>
        <StepperButton
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={disabled || value >= max}
          ariaLabel={`Aumentar ${label.toLowerCase()}`}
        >
          +
        </StepperButton>
        <span className="text-sm text-subtle">de {max}</span>
      </div>
    </div>
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
      <DetailTile eyebrow="Dress code" title={EVENT.dressCode}>
        {hasDetails && (
          <button
            type="button"
            onClick={open}
            className="mt-2 self-start text-sm font-medium text-gold-dark underline underline-offset-4 decoration-soft hover:text-ink transition-colors cursor-pointer bg-transparent border-0 p-0"
          >
            ¿Qué me pongo?
          </button>
        )}
      </DetailTile>

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

/* ---------- Spotify ---------- */

const SPOTIFY_TRACK_REGEX = /\/track\/([a-zA-Z0-9]{22})/;

function extractSpotifyTrackId(url: string): string | null {
  const match = url.match(SPOTIFY_TRACK_REGEX);
  return match ? match[1] : null;
}

type SpotifyController = {
  play: () => void;
  addListener?: (event: string, cb: (data: unknown) => void) => void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
    __spotifyIframeApi__?: SpotifyIframeApi;
  }
}

type SpotifyIframeApi = {
  createController: (
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number },
    callback: (controller: SpotifyController) => void,
  ) => void;
};

function SpotifyPlayer({
  trackId,
  playerRef,
}: {
  trackId: string;
  playerRef: React.MutableRefObject<SpotifyController | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let pendingPlay = false;
    let played = false;
    let liveController: SpotifyController | null = null;
    let controllerReady = false;

    function attemptPlay() {
      if (!liveController || played) return;
      played = true;
      try {
        liveController.play();
      } catch {
        // ignore; Spotify sometimes throws transiently
      }
    }

    playerRef.current = {
      play: () => {
        if (liveController && controllerReady) {
          attemptPlay();
        } else {
          pendingPlay = true;
        }
      },
    };

    function init(api: SpotifyIframeApi) {
      if (cancelled || !container) return;
      api.createController(
        container,
        { uri: `spotify:track:${trackId}`, width: "100%", height: 152 },
        (controller) => {
          if (cancelled) return;
          liveController = controller;

          const markReady = () => {
            if (controllerReady) return;
            controllerReady = true;
            if (pendingPlay) {
              pendingPlay = false;
              attemptPlay();
            }
          };
          if (typeof controller.addListener === "function") {
            controller.addListener("ready", markReady);
            controller.addListener("playback_update", markReady);
          }
          window.setTimeout(markReady, 600);
        },
      );
    }

    if (window.__spotifyIframeApi__) {
      init(window.__spotifyIframeApi__);
    } else {
      window.onSpotifyIframeApiReady = (api) => {
        window.__spotifyIframeApi__ = api;
        init(api);
      };
      if (!document.getElementById("spotify-iframe-api-script")) {
        const script = document.createElement("script");
        script.id = "spotify-iframe-api-script";
        script.src = "https://open.spotify.com/embed/iframe-api/v1";
        script.async = true;
        document.body.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [trackId, playerRef]);

  return (
    <section className="max-w-2xl mx-auto px-6 -mt-6 sm:-mt-10 mb-2">
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-bone shadow-sm"
      />
    </section>
  );
}

function SongRecommendation({ guestId }: { guestId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SpotifyTrack | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedTrack, setSubmittedTrack] = useState<SpotifyTrack | null>(null);

  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      if (cancelled) return;
      if (q.length < 2) {
        setResults([]);
        setSearchError(null);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const tracks = await searchSongs(q);
        if (cancelled) return;
        setResults(tracks);
        setSearchError(null);
      } catch (err) {
        if (cancelled) return;
        setSearchError(errorMessage(err));
        setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  async function sendRecommendation() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await submitSongRecommendation({
        id: guestId,
        trackId: selected.id,
        trackName: selected.name,
        artists: selected.artists,
        spotifyUrl: selected.spotifyUrl,
      });
      setSubmittedTrack(selected);
      setSelected(null);
      setQuery("");
      setResults([]);
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Section id="song-recommendation">
      <Eyebrow>Tu aporte musical</Eyebrow>
      <div className="bg-white border border-bone rounded-2xl shadow-md p-8 sm:p-12 mt-6 text-left">
        <h2 className="font-display italic font-normal text-4xl text-center mb-2">
          Recomendanos una canción
        </h2>
        <p className="text-muted text-center mb-8">
          Buscala en Spotify y nos ayudás a armar la playlist de la fiesta.
        </p>

        {submittedTrack && (
          <div className="mb-6 px-4 py-3 rounded bg-success-soft text-success border border-success-border text-sm">
            ¡Gracias! Anotamos <strong className="font-semibold">{submittedTrack.name}</strong>
            {submittedTrack.artists && <> — {submittedTrack.artists}</>}. Si querés sumar otra,
            buscá de nuevo.
          </div>
        )}

        {selected ? (
          <SelectedTrack
            track={selected}
            submitting={submitting}
            onChange={() => setSelected(null)}
            onSubmit={sendRecommendation}
          />
        ) : (
          <>
            <div className="mb-5">
              <FieldLabel htmlFor="song-search">Buscar canción</FieldLabel>
              <input
                id="song-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre de la canción o artista…"
                className="w-full px-4 py-3 bg-ivory border border-bone rounded focus:outline-none focus:border-gold focus:bg-white transition-colors"
                autoComplete="off"
              />
            </div>

            {searchError && <ErrorBanner message={searchError} />}

            {searching && results.length === 0 && (
              <p className="text-sm text-subtle">Buscando…</p>
            )}

            {results.length > 0 && (
              <ul className="flex flex-col gap-2 list-none p-0 m-0">
                {results.map((track) => (
                  <li key={track.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(track)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg border border-transparent hover:border-bone hover:bg-cream/40 transition-colors text-left cursor-pointer"
                    >
                      <TrackArtwork track={track} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-ink truncate">{track.name}</div>
                        <div className="text-sm text-muted truncate">{track.artists}</div>
                      </div>
                      <span className="text-[0.78rem] uppercase tracking-[0.14em] text-gold-dark">
                        Elegir
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

function SelectedTrack({
  track,
  submitting,
  onChange,
  onSubmit,
}: {
  track: SpotifyTrack;
  submitting: boolean;
  onChange: () => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-4 p-4 rounded-lg bg-cream/50 border border-bone mb-5">
        <TrackArtwork track={track} size={72} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-ink truncate">{track.name}</div>
          <div className="text-sm text-muted truncate">{track.artists}</div>
          {track.album && (
            <div className="text-[0.78rem] text-subtle truncate">{track.album}</div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting ? "Enviando…" : "Enviar recomendación"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onChange}
          disabled={submitting}
        >
          Cambiar
        </button>
      </div>
    </div>
  );
}

function TrackArtwork({ track, size = 56 }: { track: SpotifyTrack; size?: number }) {
  if (!track.imageUrl) {
    return (
      <div
        className="flex-shrink-0 rounded bg-cream border border-bone flex items-center justify-center text-subtle"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        ♪
      </div>
    );
  }
  return (
    <img
      src={track.imageUrl}
      alt=""
      width={size}
      height={size}
      className="flex-shrink-0 rounded object-cover border border-bone"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}
