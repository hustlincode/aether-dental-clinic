import Link from "next/link";
import { addDays, format } from "date-fns";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  HeartHandshake,
  HeartPulse,
  Mail,
  MailCheck,
  MapPin,
  Microscope,
  Phone,
  Plus,
  Quote,
  Receipt,
  Scan,
  ShieldCheck,
  Smile,
  Sparkles,
  Star,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MobileNav } from "@/components/home/mobile-nav";
import { MobileBookBar } from "@/components/home/mobile-book-bar";
import { frauncesDisplay } from "@/components/home/home-fonts";
import { Reveal } from "@/components/home/reveal";
import { SpotlightArea } from "@/components/home/spotlight-card";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HomeService {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
}

interface HomeDentist {
  id: string;
  name: string;
  specialization: string;
}

// ---------------------------------------------------------------------------
// Static copy (typed consts — kept inline so SEO/FAQ JSON-LD stay in sync)
// ---------------------------------------------------------------------------

const BOOKING_STEPS = [
  { title: "Choose a service", copy: "Pick a treatment from clear, fixed prices." },
  { title: "Select your dentist", copy: "Choose who you\u2019d like to see." },
  { title: "Pick a date & time", copy: "Real available slots, updated live." },
  { title: "Get instant confirmation", copy: "Confirmation lands in your email right away." },
];

const BENEFITS: { icon: LucideIcon; title: string; copy: string }[] = [
  {
    icon: CalendarCheck,
    title: "Real-time availability",
    copy: "See actual open slots and book a time that\u2019s truly free — no phone tag.",
  },
  {
    icon: Receipt,
    title: "Clear upfront pricing",
    copy: "Every service shows its fixed price and duration before you book.",
  },
  {
    icon: Award,
    title: "Experienced specialists",
    copy: "Active dentists across general, orthodontic, endodontic, and surgical care.",
  },
  {
    icon: MailCheck,
    title: "Instant email confirmation",
    copy: "The moment you book, a confirmation is sent straight to your inbox.",
  },
  {
    icon: HeartHandshake,
    title: "Comfort-first care",
    copy: "Patient-first visits that respect your time, your worries, and your budget.",
  },
  {
    icon: ShieldCheck,
    title: "Data privacy",
    copy: "Your information is handled in line with the Data Privacy Act of 2012.",
  },
];

const CARE_PHILOSOPHIES = [
  "Gentle, thorough exams and honest treatment plans.",
  "Straightforward orthodontic care, one clear step at a time.",
  "Precision root canal treatment that saves natural teeth.",
  "Calm, confident care for extractions and oral surgery.",
];

const TESTIMONIALS = [
  {
    quote:
      "Booked online after clinic hours and got my confirmation right away. The cleaning was quick and gentle — no waiting around at all.",
    name: "Anna R.",
    service: "Dental Cleaning",
  },
  {
    quote:
      "The price was shown before I booked, and the dentist walked me through everything before starting. My filling was done in one visit.",
    name: "Mark S.",
    service: "Dental Filling",
  },
  {
    quote:
      "I put off an extraction for months because I was nervous. The team kept me calm the whole time, and recovery was easier than I expected.",
    name: "Grace V.",
    service: "Tooth Extraction",
  },
  {
    quote:
      "The calendar showed real open slots, so I didn\u2019t have to call anyone. Whitening session was painless and the results were obvious.",
    name: "Sofia D.",
    service: "Teeth Whitening",
  },
];

const FAQ_ITEMS = [
  {
    q: "What happens at my first visit?",
    a: "You\u2019ll get a comprehensive oral examination, and your dentist will review your needs and walk you through a treatment plan with clear pricing before any work begins. No pressure, no surprises.",
  },
  {
    q: "How do I book or cancel an appointment?",
    a: "Booking takes about two minutes: choose a service, pick a dentist, then select a real available date and time. You\u2019ll receive an email confirmation instantly. Need to move or cancel? Contact the clinic by phone or email and we\u2019ll sort it out before your scheduled visit.",
  },
  {
    q: "Do you accept HMO or other insurance?",
    a: "HMO coverage can be applied to eligible services. Send us your provider and member details by phone or email ahead of your visit and we\u2019ll confirm exactly what\u2019s covered before you come in.",
  },
  {
    q: "What payment options are available?",
    a: "Pricing for every service is shown upfront so you know the cost before you book. For payment, HMO, and installment questions, reach us by phone or email and we\u2019ll confirm what applies to your treatment before your visit.",
  },
  {
    q: "How do you keep the clinic clean and safe?",
    a: "We follow strict sterilization protocols: single-use disposables where applicable, sterilized instrument packs, and thorough sanitization of surfaces and equipment between every patient.",
  },
  {
    q: "What should I bring to my appointment?",
    a: "Bring a valid ID, and any HMO or insurance details if you plan to use coverage. Arriving 10 minutes early helps us get you checked in and seated on time.",
  },
  {
    q: "How does online booking work?",
    a: "You choose a service and dentist, then pick an available date and time from the calendar. Your appointment is confirmed instantly by email — you never have to call to book.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPeso(n: number): string {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 0 });
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ${h > 1 ? "hrs" : "hr"} ${m} min` : `${h} ${h > 1 ? "hrs" : "hr"}`;
}

function formatClock(hhmm: string | null | undefined): string {
  if (!hhmm || !hhmm.includes(":")) return hhmm ?? "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

function initials(name: string): string {
  const parts = name.replace(/^dr\.?\s+/i, "").split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** A future weekday (Mon–Fri) used purely as an illustrative date in the hero booking preview. */
function nextWeekday(now = new Date()): Date {
  const d = addDays(now, 1);
  const day = d.getDay();
  const skip = day === 0 ? 1 : day === 6 ? 2 : 0;
  return addDays(d, skip);
}

const statText = (n: number): string => (n > 0 ? n.toLocaleString("en-PH") : "—");

const toJsonLd = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function HomePage() {
  const [serviceRows, dentistRows, clinic, activeServicesCount, activeDentistsCount, appointmentsCount, patientsCount] =
    await Promise.all([
      prisma.service.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.dentist.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.clinicSetting.findUnique({ where: { id: "singleton" } }),
      prisma.service.count({ where: { status: "ACTIVE" } }),
      prisma.dentist.count({ where: { status: "ACTIVE" } }),
      prisma.appointment.count(),
      prisma.patient.count(),
    ]);

  const services: HomeService[] = serviceRows.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    durationMin: s.durationMin,
    price: Number(s.price),
  }));

  const dentists: HomeDentist[] = dentistRows.map((d) => ({
    id: d.id,
    name: d.name,
    specialization: d.specialization,
  }));

  const featuredService = services.find((s) => s.name === "Dental Cleaning") ?? services[0];
  const otherServices = services.filter((s) => s.id !== featuredService?.id);
  const heroDentist = dentists.find((d) => d.name === "Dr. Maria Santos") ?? dentists[0];

  const stats = [
    { value: activeServicesCount, label: "Services" },
    { value: activeDentistsCount, label: "Dentists" },
    { value: appointmentsCount, label: "Appointments served" },
    { value: patientsCount, label: "Patients" },
  ];

  const dentistJsonLd = {
    "@context": "https://schema.org",
    "@type": ["Dentist", "LocalBusiness"],
    name: clinic?.name ?? "Aether Dental",
    description:
      "Dental clinic offering online appointment booking for general and specialty dental care in Taguig, Metro Manila.",
    ...(clinic?.address ? { address: { "@type": "PostalAddress", streetAddress: clinic.address } } : {}),
    ...(clinic?.phone ? { telephone: clinic.phone } : {}),
    ...(clinic?.email ? { email: clinic.email } : {}),
    ...(clinic ? { openingHours: `Mo-Fr ${clinic.openingTime}-${clinic.closingTime}` } : {}),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  const previewDate = format(nextWeekday(), "EEE, MMM d");

  return (
    <div className={cn(frauncesDisplay.variable, "home-root min-h-screen bg-background")}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(dentistJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(faqJsonLd) }} />

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/" aria-label="Aether Dental home" className="home-display text-xl font-semibold">
            <span className="text-text">Aether </span>
            <span className="text-accent">Dental</span>
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-6 text-sm font-medium text-text-secondary lg:flex">
            <Link href="/#services" className="home-nav-link transition-colors duration-200 hover:text-accent">Services</Link>
            <Link href="/#dentists" className="home-nav-link transition-colors duration-200 hover:text-accent">Dentists</Link>
            <Link href="/#faq" className="home-nav-link transition-colors duration-200 hover:text-accent">FAQ</Link>
            <Link href="/#contact" className="home-nav-link transition-colors duration-200 hover:text-accent">Contact</Link>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-text-secondary transition-colors duration-200 hover:text-accent sm:block"
            >
              Staff login
            </Link>
            <ThemeToggle />
            <Link
              href="/book"
              className="gradient-gold hidden rounded-lg px-4 py-2 text-sm font-semibold text-[#0E0F10] shadow transition-opacity duration-200 hover:opacity-90 sm:inline-flex"
            >
              Book Now
            </Link>
            <MobileNav />
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero (fills the viewport below the sticky header) ── */}
        <section className="home-canvas flex min-h-[calc(100dvh-4rem)] items-center">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] animate-fade-in">
            <div>
              <div className="home-eyebrow inline-flex items-center rounded-full border border-border-accent bg-accent-soft px-3 py-1.5">
                Trusted dental care · Online booking
              </div>
              <h1 className="home-display home-display-xl mt-4 text-text">
                Your best smile starts with one easy booking.
              </h1>
              <p className="mt-4 max-w-xl text-lg leading-[1.65] text-text-secondary">
                Choose your service, pick a dentist and a time that works, and get an instant confirmation. No phone
                calls. No waiting.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/book"
                  className="gradient-gold rounded-lg px-6 py-3 font-semibold text-[#0E0F10] shadow-md transition-opacity duration-200 hover:opacity-90"
                >
                  Book an appointment
                </Link>
                <Link
                  href="/#services"
                  className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-text-secondary transition-all duration-200 hover:border-border-accent hover:bg-surface"
                >
                  View services
                </Link>
              </div>
              <div className="mt-10 grid max-w-md grid-cols-2 gap-6 sm:max-w-none sm:grid-cols-4">
                {stats.map((s) => (
                  <Stat key={s.label} value={statText(s.value)} label={s.label} />
                ))}
              </div>
            </div>
            <SpotlightArea>
              <BookingPreview service={featuredService} dentist={heroDentist} previewDate={previewDate} />
            </SpotlightArea>
          </div>
        </section>

        {/* ── Trust bar ── */}
        <section aria-label="Why patients trust Aether Dental" className="border-b border-border bg-surface/60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-3 text-sm">
            <TrustItem value={activeServicesCount} label="services" />
            <span className="text-text-muted" aria-hidden>·</span>
            <TrustItem value={activeDentistsCount} label="dentists" />
            <span className="text-text-muted" aria-hidden>·</span>
            <TrustItem value={appointmentsCount} label="appointments served" />
            <span className="text-text-muted" aria-hidden>·</span>
            <TrustItem value={patientsCount} label="patients" />
            <span className="text-text-muted" aria-hidden>·</span>
            <span className="text-xs text-text-muted">HMO accepted</span>
            <span className="text-text-muted" aria-hidden>·</span>
            <span className="text-xs text-text-muted">Strict sterilization</span>
            <span className="text-text-muted" aria-hidden>·</span>
            <span className="text-xs text-text-muted">Member, Philippine Dental Association</span>
          </div>
        </section>

        {/* ── Services (bento, DB-driven) ── */}
        <section id="services" className="scroll-mt-24 bg-background">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <div className="text-center">
              <p className="home-eyebrow">Services</p>
              <h2 className="home-display home-display-lg mt-3 text-text">Our services</h2>
              <p className="mt-3 text-text-muted">Transparent pricing. Professional care.</p>
            </div>
            <SpotlightArea className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
              <Reveal stagger className="contents">
                {featuredService && (
                  <ServiceCard service={featuredService} featured icon={Sparkles} />
                )}
                {otherServices.map((s, i) => (
                  <ServiceCard key={s.id} service={s} icon={SERVICE_ICONS[i % SERVICE_ICONS.length]} />
                ))}
              </Reveal>
            </SpotlightArea>
          </div>
        </section>

        {/* ── How booking works ── */}
        <section id="how-it-works" className="scroll-mt-24 bg-background-alt">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <div className="text-center">
              <p className="home-eyebrow">How it works</p>
              <h2 className="home-display home-display-lg mt-3 text-text">How booking works</h2>
            </div>
            <Reveal stagger as="ol" className="home-steps mt-12 grid gap-6 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
              {BOOKING_STEPS.map((step, i) => (
                <li key={step.title} className="card-surface home-step p-5">
                  <span className="home-step__num gradient-gold flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-[#0E0F10]">
                    {i + 1}
                  </span>
                  <h3 className="mt-3 font-semibold text-text">{step.title}</h3>
                  <p className="mt-1 text-[0.9375rem] leading-[1.55] text-text-muted">{step.copy}</p>
                </li>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── Why Aether ── */}
        <section id="why-aether" className="scroll-mt-24 bg-background">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <div className="text-center">
              <p className="home-eyebrow">Why Aether</p>
              <h2 className="home-display home-display-lg mt-3 text-text">Dental care built around your day</h2>
              <p className="mt-3 text-text-muted">The things that make booking (and visiting) easier.</p>
            </div>
            <Reveal stagger className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
              {BENEFITS.map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <div
                    key={benefit.title}
                    className="card-surface card-surface-hover home-card home-card--left home-card--lift-2 p-5"
                  >
                    <span className="home-card__rail" aria-hidden />
                    <span className="home-card__icon flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 font-semibold text-text">{benefit.title}</h3>
                    <p className="mt-1 text-[0.9375rem] leading-[1.55] text-text-muted">{benefit.copy}</p>
                  </div>
                );
              })}
            </Reveal>
          </div>
        </section>

        {/* ── Meet the dentists (DB-driven) ── */}
        <section id="dentists" className="scroll-mt-24 bg-background-alt">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <div className="text-center">
              <p className="home-eyebrow">Our team</p>
              <h2 className="home-display home-display-lg mt-3 text-text">Meet the dentists</h2>
              <p className="mt-3 text-text-muted">Experienced specialists who put your comfort first.</p>
            </div>
            <Reveal stagger className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-4">
              {dentists.length === 0 ? (
                <p className="text-text-muted">Our dentist directory is being updated.</p>
              ) : (
                dentists.map((d, i) => (
                  <div key={d.id} className="card-surface home-card home-card--lift-2 p-5">
                    <span className="home-card__rail" aria-hidden />
                    <Avatar className="home-card__avatar size-14">
                      <AvatarFallback className="bg-accent-soft text-base font-bold text-accent">
                        {initials(d.name)}
                      </AvatarFallback>
                    </Avatar>
                    <h3 className="mt-4 font-semibold text-text">{d.name}</h3>
                    <p className="home-accent-ink text-sm font-medium">{d.specialization}</p>
                    <p className="mt-2 text-[0.9375rem] leading-[1.55] text-text-muted">
                      {CARE_PHILOSOPHIES[i % CARE_PHILOSOPHIES.length]}
                    </p>
                  </div>
                ))
              )}
            </Reveal>
          </div>
        </section>

        {/* ── Testimonials ── */}
        <section id="testimonials" className="scroll-mt-24 bg-background">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <div className="text-center">
              <p className="home-eyebrow">Testimonials</p>
              <h2 className="home-display home-display-lg mt-3 text-text">What patients say</h2>
              <p className="mt-3 text-text-muted">Real experiences from the chair.</p>
            </div>
            <Reveal stagger className="mt-12 grid gap-4 sm:mt-16 sm:grid-cols-2">
              {TESTIMONIALS.map((t) => (
                <figure key={t.name} className="card-surface card-surface-hover home-card home-card--lift-3 p-6">
                  <span className="home-card__rail" aria-hidden />
                  <Stars />
                  <blockquote className="mt-3 text-text-secondary">
                    <Quote className="home-quote mb-2 size-4 text-accent" aria-hidden />
                    <p className="home-display home-quote-text">{t.quote}</p>
                  </blockquote>
                  <figcaption className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-text">{t.name}</span>
                    <span className="home-accent-ink inline-flex items-center gap-1 rounded-full border border-border-accent bg-accent-soft px-2.5 py-0.5 font-mono text-xs font-medium">
                      <BadgeCheck className="size-3.5" aria-hidden />
                      {t.service}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="scroll-mt-24 bg-background-alt">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:py-28">
            <div className="text-center">
              <p className="home-eyebrow">FAQ</p>
              <h2 className="home-display home-display-lg mt-3 text-text">Frequently asked questions</h2>
            </div>
            <Accordion type="single" collapsible className="home-faq mt-10">
              {FAQ_ITEMS.map((item) => (
                <AccordionItem key={item.q} value={item.q} className="border-border px-3">
                  <AccordionTrigger className="text-base font-semibold text-text">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-[0.9375rem] leading-[1.6] text-text-secondary">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ── CTA band ── */}
        <section aria-labelledby="cta-heading" className="home-canvas relative overflow-hidden border-y border-border-accent">
          <div className="home-drift" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
            <h2 id="cta-heading" className="home-display home-display-lg text-text">
              Book your visit in under 2 minutes
            </h2>
            <p className="mt-3 text-text-secondary">Confirmation sent instantly · No phone required</p>
            <Link
              href="/book"
              className="gradient-gold mt-8 inline-block rounded-lg px-6 py-3 font-semibold text-[#0E0F10] shadow-md transition-opacity duration-200 hover:opacity-90"
            >
              Book an appointment
            </Link>
          </div>
        </section>

        {/* ── Contact & hours (DB-driven) ── */}
        <section id="contact" className="scroll-mt-24 bg-background">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <div className="text-center">
              <p className="home-eyebrow">Contact</p>
              <h2 className="home-display home-display-lg mt-3 text-text">Visit us</h2>
            </div>
            <Reveal stagger className="mt-12 grid gap-8 sm:mt-16 md:grid-cols-2">
              <div className="card-surface home-card home-card--lift-2 p-6">
                <span className="home-card__rail" aria-hidden />
                {clinic?.name && <p className="font-semibold text-text">{clinic.name}</p>}
                <div className="mt-4 space-y-4 text-text-secondary">
                  <p className="flex items-start gap-2.5">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    <span>{clinic?.address ?? "Clinic address available on request."}</span>
                  </p>
                  {clinic?.phone ? (
                    <p className="flex items-center gap-2.5">
                      <Phone className="size-4 shrink-0 text-accent" aria-hidden />
                      <a
                        href={`tel:${clinic.phone.replace(/[\s()-]/g, "")}`}
                        className="underline-offset-2 transition-colors hover:text-(--home-accent-ink) hover:underline"
                      >
                        {clinic.phone}
                      </a>
                    </p>
                  ) : (
                    <p className="flex items-center gap-2.5">
                      <Phone className="size-4 shrink-0 text-accent" aria-hidden />
                      <span>Phone available on request.</span>
                    </p>
                  )}
                  {clinic?.email ? (
                    <p className="flex items-center gap-2.5">
                      <Mail className="size-4 shrink-0 text-accent" aria-hidden />
                      <a href={`mailto:${clinic.email}`} className="underline-offset-2 transition-colors hover:text-(--home-accent-ink) hover:underline">
                        {clinic.email}
                      </a>
                    </p>
                  ) : (
                    <p className="flex items-center gap-2.5">
                      <Mail className="size-4 shrink-0 text-accent" aria-hidden />
                      <span>Email available on request.</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="card-surface home-card home-card--lift-2 p-6">
                <span className="home-card__rail" aria-hidden />
                <h3 className="text-lg font-semibold text-text">Clinic hours</h3>
                <div className="mt-4 space-y-3 text-text-secondary">
                  {clinic ? (
                    <>
                      <p className="flex items-center gap-2.5">
                        <Clock className="size-4 shrink-0 text-accent" aria-hidden />
                        <span>
                          {formatClock(clinic.openingTime)} – {formatClock(clinic.closingTime)}
                        </span>
                      </p>
                      {clinic.lunchBreakStart && clinic.lunchBreakEnd ? (
                        <p className="flex items-center gap-2.5 pl-6 text-sm text-text-muted">
                          Lunch break: {formatClock(clinic.lunchBreakStart)} – {formatClock(clinic.lunchBreakEnd)}
                        </p>
                      ) : null}
                      <p className="pl-6 text-sm text-text-muted">Hours may vary by dentist availability.</p>
                    </>
                  ) : (
                    <p>Clinic hours available on request.</p>
                  )}
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row sm:items-start">
            <div className="text-center sm:text-left">
              <div className="home-display text-lg font-semibold">
                <span className="text-text">Aether </span>
                <span className="text-accent">Dental</span>
              </div>
              <p className="mt-2 text-sm text-text-muted">
                Member, Philippine Dental Association · Licensed dental practice
              </p>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-text-secondary">
              <Link href="/#services" className="home-nav-link transition-colors duration-200 hover:text-accent">Services</Link>
              <Link href="/#dentists" className="home-nav-link transition-colors duration-200 hover:text-accent">Dentists</Link>
              <Link href="/#faq" className="home-nav-link transition-colors duration-200 hover:text-accent">FAQ</Link>
              <Link href="/#contact" className="home-nav-link transition-colors duration-200 hover:text-accent">Contact</Link>
            </nav>
          </div>
          <div className="mt-6 flex flex-col items-center justify-between gap-2 border-t border-border pt-4 text-xs text-text-muted sm:flex-row">
            <div>© {new Date().getFullYear()} Aether Dental Clinic. All rights reserved.</div>
            <Link href="/privacy-policy" className="home-nav-link transition-colors duration-200 hover:text-accent">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>

      {/* Spacer so the fixed mobile book bar never covers the footer */}
      <div className="h-20 lg:hidden" aria-hidden="true" />
      <MobileBookBar />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section building blocks
// ---------------------------------------------------------------------------

const SERVICE_ICONS: LucideIcon[] = [
  Stethoscope,
  Sparkles,
  HeartPulse,
  Syringe,
  Smile,
  Scan,
  Microscope,
  Plus,
];

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="home-display home-stat home-stat-value">{value}</div>
      <div className="mt-1 text-xs text-text-muted sm:text-sm">{label}</div>
    </div>
  );
}

function TrustItem({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-semibold text-text">{statText(value)}</span>
      <span className="text-text-muted">{label}</span>
    </span>
  );
}

function ServiceCard({
  service,
  icon: Icon,
  featured = false,
}: {
  service: HomeService;
  icon: LucideIcon;
  featured?: boolean;
}) {
  return (
    <Link
      href="/book"
      data-spotlight={featured ? "" : undefined}
      className={cn(
        "card-surface card-surface-hover home-card home-card--lift-3 group flex flex-col p-6",
        featured && "home-spotlight sm:col-span-2 lg:col-span-2"
      )}
    >
      <span className="home-card__rail" aria-hidden />
      <div className="flex items-start justify-between">
        <span className="home-card__icon flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon className="size-5" aria-hidden />
        </span>
        <span
          className="home-card__book mt-1 inline-flex items-center gap-1 text-xs font-medium text-text-muted"
          aria-hidden
        >
          Book<span className="sr-only"> {service.name}</span>
          <ArrowRight className="home-card__arrow size-3.5" />
        </span>
      </div>
      <h3 className={cn("mt-4 font-semibold text-text", featured ? "home-display home-display-md" : "text-lg")}>
        {service.name}
      </h3>
      {service.description && (
        <p className="mt-1.5 text-[0.9375rem] leading-[1.55] text-text-muted">{service.description}</p>
      )}
      <div className="mt-auto flex items-center justify-between pt-5">
        <span className="home-accent-ink text-xl font-bold">{formatPeso(service.price)}</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-xs text-text-muted">
          <Clock className="size-3.5" aria-hidden />
          {formatDuration(service.durationMin)}
        </span>
      </div>
    </Link>
  );
}

function BookingPreview({
  service,
  dentist,
  previewDate,
}: {
  service?: HomeService;
  dentist?: HomeDentist;
  previewDate: string;
}) {
  return (
    <div
      data-spotlight=""
      className="card-surface home-card home-card--lift-4 home-spotlight animate-slide-up p-6"
    >
      <span className="home-card__rail" aria-hidden />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-text">
          <CalendarDays className="size-4 text-accent" aria-hidden />
          Book an appointment
        </span>
        <span className="rounded-full border border-border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
          Preview
        </span>
      </div>

      {/* Step progress */}
      <div className="mt-6 flex items-center justify-between gap-1 text-[11px] font-medium text-text-muted">
        {["Service", "Dentist", "Date & time", "Confirm"].map((label, i) => {
          const state = i < 2 ? "done" : i === 2 ? "current" : "todo";
          return (
            <span key={label} className="flex flex-1 items-center gap-1.5" aria-hidden>
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  state === "done" && "gradient-gold text-[#0E0F10]",
                  state === "current" && "border-2 border-accent text-accent",
                  state === "todo" && "border border-border text-text-muted"
                )}
              >
                {state === "done" ? <Check className="size-3" /> : i + 1}
              </span>
              <span className={cn(state === "todo" && "hidden sm:inline")}>{label}</span>
            </span>
          );
        })}
      </div>

      {/* Selected options */}
      <div className="mt-6 space-y-2.5">
        <PreviewPill
          icon={<Stethoscope className="size-4 text-accent" aria-hidden />}
          label="Service"
          value={service?.name ?? "Dental service"}
        />
        <PreviewPill
          icon={
            <Avatar className="size-6">
              <AvatarFallback className="bg-accent-soft text-[9px] font-bold text-accent">
                {dentist ? initials(dentist.name) : "AD"}
              </AvatarFallback>
            </Avatar>
          }
          label="Dentist"
          value={dentist?.name ?? "Our dentists"}
        />
        <PreviewPill
          icon={<CalendarDays className="size-4 text-accent" aria-hidden />}
          label="Date & time"
          value={`${previewDate} · 10:30 AM`}
        />
      </div>

      {/* Cost + CTA */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-text-muted">Estimated cost</div>
          <div className="text-xl font-bold text-accent">{service ? formatPeso(service.price) : "—"}</div>
        </div>
        <Link
          href="/book"
          className="gradient-gold rounded-lg px-4 py-2.5 text-sm font-semibold text-[#0E0F10] shadow-md transition-opacity duration-200 hover:opacity-90"
        >
          Continue booking
        </Link>
      </div>
      <p className="mt-4 text-center text-xs text-text-muted">Confirmation sent instantly · No phone required</p>
    </div>
  );
}

function PreviewPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-alt px-3 py-2.5">
      <span className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </span>
      <span className="text-sm font-semibold text-text">{value}</span>
    </div>
  );
}

function Stars() {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label="Rated 5 out of 5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} className="size-4 fill-accent text-accent" aria-hidden />
      ))}
    </div>
  );
}