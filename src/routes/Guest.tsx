import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchPublicGuest, type PublicGuest } from "../api/guests";
import { submitRsvp, type RsvpResponse } from "../api/rsvp";
import {
  searchSongs,
  submitSongRecommendation,
  type SpotifyTrack,
} from "../api/songs";
import { EVENT, type EventOccurrence } from "../config";
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
      <Hero />
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
      <footer className="px-6 pt-4 pb-14 text-center">
        <HeartDivider />
        <div className="relative max-w-md mx-auto px-12">
          <LaurelBranch className="absolute left-0 bottom-0 w-7 text-brass/70" />
          <LaurelBranch className="absolute right-0 bottom-0 w-7 text-brass/70 -scale-x-100" />
          <p className="font-script text-[clamp(2.2rem,9vw,3.4rem)] leading-none text-ink m-0 pb-1">
            {EVENT.signature}
          </p>
        </div>
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
      <div className="relative w-full max-w-lg px-12 sm:px-16">
        <LaurelBranch className="absolute left-0 top-1/2 -translate-y-1/2 w-9 sm:w-12 text-brass/75" />
        <LaurelBranch className="absolute right-0 top-1/2 -translate-y-1/2 w-9 sm:w-12 text-brass/75 -scale-x-100" />
        <h1 className="font-display font-normal uppercase text-brass text-[clamp(2.4rem,11vw,5rem)] leading-[0.95] m-0">
          Nos casamos
        </h1>
        <p className="mt-3 font-display text-[clamp(1rem,4.2vw,1.5rem)] leading-snug text-ink/85 text-balance m-0">
          {EVENT.tagline}{" "}
          <HeartGlyph className="inline w-[0.7em] h-[0.7em] align-baseline text-brass" />
        </p>
      </div>
      <HeartDivider className="my-9 w-56 max-w-[70vw]" />
      <p className="font-script text-[clamp(2rem,8vw,2.8rem)] leading-none text-ink m-0 mb-10 pb-1">
        {EVENT.signature}
      </p>
      <button type="button" onClick={onEnter} className="btn-primary">
        Ver invitación
      </button>
      <p className="mt-6 text-[0.78rem] text-subtle">Con música 🎵</p>
    </div>
  );
}

/* ---------- Sections ---------- */

function Hero() {
  return (
    <header className="relative isolate">
      {EVENT.photoUrl && (
        <div className="relative h-[clamp(300px,56vh,600px)] overflow-hidden">
          <img
            src={EVENT.photoUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover saturate-[0.92]"
            style={{ objectPosition: "50% 20%" }}
          />
          {/* La foto se disuelve en el crema, como en la invitación impresa. */}
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-b from-transparent to-ivory" />
        </div>
      )}
      <div className="relative text-center px-6 pt-6 pb-12">
        <div className="relative max-w-3xl mx-auto px-11 sm:px-20">
          <LaurelBranch className="absolute left-0 top-1/2 -translate-y-1/2 w-10 sm:w-14 text-brass/75" />
          <LaurelBranch className="absolute right-0 top-1/2 -translate-y-1/2 w-10 sm:w-14 text-brass/75 -scale-x-100" />
          <h1 className="font-display font-normal uppercase text-brass text-[clamp(2.5rem,11.5vw,5.5rem)] leading-[0.95] tracking-[0.01em] m-0">
            Nos casamos
          </h1>
          <p className="mt-3 font-display text-[clamp(1.05rem,4.4vw,1.7rem)] leading-snug text-ink/85 text-balance m-0">
            {EVENT.tagline}{" "}
            <HeartGlyph className="inline w-[0.7em] h-[0.7em] align-baseline text-brass" />
          </p>
        </div>
      </div>
    </header>
  );
}

/**
 * Rama de laurel de las esquinas. Las hojas se generan sobre el tallo en vez
 * de dibujarse a mano para que queden parejas y sea fácil cambiar el largo.
 */
function LaurelBranch({ className }: { className?: string }) {
  const leaves = [0, 1, 2, 3, 4];
  return (
    <svg
      viewBox="0 0 76 132"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      aria-hidden="true"
    >
      <path d="M52 128 C 34 100, 28 58, 34 8" strokeLinecap="round" />
      {leaves.map((i) => {
        const t = i / (leaves.length - 1);
        // Las hojas encogen hacia la punta, que es como crece la rama real.
        const scale = 1 - t * 0.32;
        const x = 52 - t * 18;
        const y = 118 - t * 100;
        return (
          <g key={i}>
            <ellipse
              cx={x - 16 * scale}
              cy={y - 5}
              rx={16 * scale}
              ry={7.5 * scale}
              transform={`rotate(${-34 - t * 12} ${x - 16 * scale} ${y - 5})`}
            />
            <ellipse
              cx={x + 15 * scale}
              cy={y - 14}
              rx={15 * scale}
              ry={7 * scale}
              transform={`rotate(${32 + t * 12} ${x + 15 * scale} ${y - 14})`}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Filete · corazón · filete. Es el separador que usa la invitación impresa. */
function HeartDivider({ className }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-4 text-sand ${className ?? "my-10"}`}
      aria-hidden="true"
    >
      <span className="h-px flex-1 max-w-36 bg-current" />
      <HeartGlyph className="w-3.5 h-3.5 text-brass shrink-0" />
      <span className="h-px flex-1 max-w-36 bg-current" />
    </div>
  );
}

function Greeting({ name }: { name: string }) {
  return (
    <Section>
      <Eyebrow>Bienvenida / Bienvenido</Eyebrow>
      <h2 className="font-script text-[clamp(2.2rem,8vw,3rem)] leading-none m-0 mb-5 pb-1">
        Hola, <span className="text-brass">{firstName(name)}</span>
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
      <HeartDivider className="mb-10" />
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {EVENT.events.map((occurrence, i) => (
          <div
            key={occurrence.label}
            className={
              i > 0
                ? "pt-9 mt-9 border-t border-dotted border-sand sm:pt-0 sm:mt-0 sm:border-t-0 sm:pl-10 sm:border-l"
                : "sm:pr-10"
            }
          >
            <EventColumn occurrence={occurrence} />
          </div>
        ))}
      </div>
      {EVENT.punctualityNote && (
        <>
          <HeartDivider />
          <p className="font-display text-xl sm:text-2xl leading-snug text-ink/85 max-w-lg mx-auto m-0">
            {EVENT.punctualityNote}
          </p>
        </>
      )}
      <HeartDivider />
      <div className="inline-flex items-center gap-4 rounded-2xl border border-brass/45 px-6 py-5 sm:px-8">
        <CalendarIcon className="w-7 h-7 text-brass shrink-0" />
        <p className="font-display text-lg sm:text-xl leading-snug text-ink m-0 text-left">
          No te olvides de confirmar asistencia
          <br />
          antes del {EVENT.rsvpDeadline}
        </p>
      </div>
    </Section>
  );
}

function EventColumn({ occurrence }: { occurrence: EventOccurrence }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-3 mb-6">
        {occurrence.icon === "rings" ? (
          <RingsIcon className="w-10 h-10 text-brass shrink-0" />
        ) : (
          <ToastIcon className="w-10 h-10 text-brass shrink-0" />
        )}
        <h2 className="font-script text-[clamp(1.9rem,7vw,2.8rem)] leading-none text-ink m-0 pb-1">
          {occurrence.label}
        </h2>
      </div>
      <div className="inline-grid gap-3.5 text-left">
        <EventRow icon={<CalendarIcon className="w-5 h-5" />}>{occurrence.date}</EventRow>
        {occurrence.time && <EventRow icon={<ClockIcon className="w-5 h-5" />}>{occurrence.time}</EventRow>}
        <EventRow icon={<MapPinIcon className="w-5 h-5" />}>
          {occurrence.venue}
          {occurrence.address && (
            <span className="block text-sm text-muted">{occurrence.address}</span>
          )}
          {occurrence.mapUrl && (
            <a
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-gold-dark underline underline-offset-4 decoration-soft hover:text-ink transition-colors"
              href={occurrence.mapUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              ¿Cómo llego?
            </a>
          )}
        </EventRow>
        {occurrence.note && (
          <EventRow icon={<HeartGlyph className="w-4 h-4" />}>{occurrence.note}</EventRow>
        )}
        {occurrence.showDressCode && <DressCodeRow />}
      </div>
    </div>
  );
}

function EventRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr] items-start gap-3">
      <span className="text-brass mt-1 flex justify-center" aria-hidden="true">
        {icon}
      </span>
      <span className="font-display text-lg sm:text-xl leading-snug text-ink">{children}</span>
    </div>
  );
}

function GiftAccountSection() {
  return (
    <Section wide>
      <div className="rounded-2xl border border-brass/40 px-6 py-10 sm:px-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <GiftIcon className="w-9 h-9 text-brass shrink-0" />
          <h2 className="font-script text-[clamp(1.8rem,6.5vw,2.6rem)] leading-none text-ink m-0 pb-1">
            Sugerencia de regalo
          </h2>
        </div>
        <p className="text-muted max-w-prose mx-auto mb-9">{EVENT.giftMessage}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {EVENT.giftAccounts.map((account, i) => (
            <div
              key={account.value}
              className={
                i > 0
                  ? "pt-8 mt-8 border-t border-dotted border-sand sm:pt-0 sm:mt-0 sm:border-t-0 sm:pl-8 sm:border-l"
                  : "sm:pr-8"
              }
            >
              <h3 className="font-display text-xl sm:text-2xl font-medium text-ink m-0">
                Cuenta {account.bank} {account.label}
              </h3>
              <CopyableValue value={account.value} />
              <p className="text-sm text-muted mt-2 m-0">{account.holder}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/**
 * El número de cuenta se toca para copiarlo: nadie transcribe a mano un CBU
 * desde el teléfono sin equivocarse.
 */
function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
      className="group mt-2 inline-flex items-center gap-2.5 bg-transparent border-0 p-0 cursor-pointer"
    >
      <span className="font-sans text-xl sm:text-2xl tracking-[0.06em] text-ink tabular-nums">
        {value}
      </span>
      <span className="text-[0.7rem] uppercase tracking-[0.16em] font-medium text-gold-dark group-hover:text-ink transition-colors">
        {copied ? "Copiado" : "Copiar"}
      </span>
    </button>
  );
}

/* ---------- Ornamentos e iconos de la invitación ---------- */

const STROKE_ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function HeartGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 21s-8.4-5.3-8.4-11a4.8 4.8 0 0 1 8.4-3.2A4.8 4.8 0 0 1 20.4 10c0 5.7-8.4 11-8.4 11Z" />
    </svg>
  );
}

/** Alianzas entrelazadas: la ceremonia civil. */
function RingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} {...STROKE_ICON} aria-hidden="true">
      <circle cx="15" cy="24" r="10" />
      <circle cx="26" cy="24" r="10" />
      <path d="M20 11.5 17 7h6l-3 4.5Z" />
    </svg>
  );
}

/** Copas brindando: la fiesta. */
function ToastIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} {...STROKE_ICON} aria-hidden="true">
      <path d="M13 6 7 8l3.5 9a4 4 0 0 0 7.5-1.4L18 7l-5-1Z" />
      <path d="M27 6l6 2-3.5 9a4 4 0 0 1-7.5-1.4L22 7l5-1Z" />
      <path d="M14 22.5 12 34M26 22.5 28 34M8 34h9M23 34h9" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE_ICON} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE_ICON} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" />
    </svg>
  );
}

function GiftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE_ICON} aria-hidden="true">
      <rect x="3" y="9.5" width="18" height="11.5" rx="1.5" />
      <path d="M2 9.5h20M12 9.5V21" />
      <path d="M12 9.5S9.8 4 7.4 4a2.6 2.6 0 0 0 0 5.5M12 9.5S14.2 4 16.6 4a2.6 2.6 0 0 1 0 5.5" />
    </svg>
  );
}

function HangerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...STROKE_ICON} aria-hidden="true">
      <path d="M12 10V8.5a2.2 2.2 0 1 1 2.2-2.2" />
      <path d="m12 10-8.4 5.6A1.6 1.6 0 0 0 4.5 18.5h15a1.6 1.6 0 0 0 .9-2.9L12 10Z" />
    </svg>
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
        <h2 className="font-script text-[clamp(1.9rem,7vw,2.6rem)] leading-none text-center m-0 mb-3 pb-1">
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
      <h1 className="font-script text-[clamp(2rem,7.5vw,2.9rem)] leading-none m-0 mb-5 pb-1">{title}</h1>
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

function DressCodeRow() {
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
      <EventRow icon={<HangerIcon className="w-5 h-5" />}>
        Vestimenta {EVENT.dressCode}
        {hasDetails && (
          <button
            type="button"
            onClick={open}
            className="mt-1 block text-sm font-medium text-gold-dark underline underline-offset-4 decoration-soft hover:text-ink transition-colors cursor-pointer bg-transparent border-0 p-0"
          >
            ¿Qué me pongo?
          </button>
        )}
      </EventRow>

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

function MapPinIcon({ className = "w-4 h-4 -mt-px" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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
        <h2 className="font-script text-[clamp(1.9rem,7vw,2.6rem)] leading-none text-center m-0 mb-3 pb-1">
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
