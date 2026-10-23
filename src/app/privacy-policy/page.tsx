import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { prisma } from "@/lib/db";

export const revalidate = 300;

// Policy text and dedicated privacy contact stay independent of public clinic details.
export const metadata = {
  title: "Privacy Policy | Aether Dental Clinic",
  description:
    "How Aether Dental Clinic collects, uses, and protects your personal information in compliance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).",
};

const sections = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <p>
        Aether Dental Clinic (<span className="font-semibold text-text">“the Clinic,” “we,” “us”</span>) is the
        personal information controller for personal data collected through this website and its booking system. We
        are committed to protecting your privacy in accordance with Republic Act No. 10173, otherwise known as the{" "}
        <em>Data Privacy Act of 2012 (DPA)</em>, its Implementing Rules and Regulations, and other applicable issuances
        of the National Privacy Commission (NPC).
      </p>
    ),
  },
  {
    id: "data-we-collect",
    title: "What personal data we collect",
    body: (
      <>
        <p>When you book an appointment, we collect the following information:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Personal information</strong> — your first name, last name, and phone number.</li>
          <li><strong>Contact details</strong> — your email address, used to send booking confirmations and reminders.</li>
          <li><strong>Booking details</strong> — the dental service requested, preferred dentist, appointment date and time, and any notes you choose to provide.</li>
          <li>
            <strong>Sensitive personal information</strong> — any health-related information you share with us (for
            example, in the booking notes or during your consultation). Under the DPA, information about your health is
            classified as <em>sensitive personal information</em> and is afforded a higher level of protection.
          </li>
        </ul>
        <p className="mt-3">
          We do not intentionally collect more data than is necessary for the purposes described in this policy.
        </p>
      </>
    ),
  },
  {
    id: "purposes",
    title: "Purposes of processing",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>To schedule, manage, and confirm your dental appointments;</li>
        <li>To contact you about your booking, including reminders and status updates;</li>
        <li>To document and deliver the dental care you request, and support continuity of care;</li>
        <li>To keep accurate patient records for our clinic administration;</li>
        <li>To comply with legal and regulatory obligations applicable to dental practice; and</li>
        <li>To improve our services, using anonymized or aggregated information where possible.</li>
      </ul>
    ),
  },
  {
    id: "legal-basis",
    title: "Our legal basis for processing",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Your consent</strong> — we obtain your explicit consent before collecting and processing your personal data, including sensitive health-related information, through this booking system.</li>
        <li><strong>Performance of a contract/service</strong> — processing is necessary to provide the booking and dental services you request.</li>
        <li><strong>Compliance with legal obligations</strong> — where required by law, regulation, or lawful order.</li>
        <li><strong>Our legitimate interests</strong> — such as clinic administration, security, and record-keeping, which do not override your rights and freedoms.</li>
      </ul>
    ),
  },
  {
    id: "sharing",
    title: "Whom we share data with",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Authorized clinic personnel</strong> — our dentists and reception staff, who access records only on a need-to-know basis and are bound by confidentiality;</li>
        <li><strong>Service providers</strong> — third parties (such as email delivery and website hosting providers) who process data on our behalf under contract and with appropriate safeguards; and</li>
        <li><strong>Government and regulators</strong> — when disclosure is required or authorized by law, including the National Privacy Commission.</li>
      </ul>
    ),
  },
  {
    id: "retention",
    title: "How long we keep your data",
    body: (
      <p>
        We retain personal data only for as long as necessary to fulfill the purposes described in this policy, and in no
        case longer than five (5) years after your last transaction with the Clinic, unless a longer retention period is
        required or permitted under applicable law (for example, for public health, medical, or legal purposes). When
        data is no longer needed, we securely dispose of or anonymize it.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security measures",
    body: (
      <>
        <p>We implement appropriate organizational, physical, and technical safeguards to protect your personal data, including:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Access controls limiting data handling to authorized personnel;</li>
          <li>Encryption of data transmitted over the internet (HTTPS);</li>
          <li>Secure storage of records and audit trails for significant actions; and</li>
          <li>Confidentiality policies and training for clinic staff.</li>
        </ul>
        <p className="mt-3">
          We do not make decisions that significantly affect you purely on the basis of automated processing.
        </p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights as a data subject",
    body: (
      <>
        <p>Under the DPA, you have the right to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Be informed</strong> of how your personal data is processed;</li>
          <li><strong>Object</strong> to the processing of your personal data;</li>
          <li><strong>Access</strong> the personal data we hold about you;</li>
          <li><strong>Rectify</strong> inaccurate or incomplete data;</li>
          <li><strong>Suspend or withdraw</strong> your consent, or request the <strong>erasure or blocking</strong> of your personal data;</li>
          <li><strong>Data portability</strong> — obtain a copy of your data in a commonly used format, where applicable; and</li>
          <li><strong>Damages</strong> — seek compensation for any violation of the DPA, and <strong>file a complaint</strong> with the National Privacy Commission.</li>
        </ul>
        <p className="mt-3">
          To exercise any of these rights, contact our Data Protection Officer at{" "}
          <a href="mailto:privacy@aetherdental.ph" className="font-medium text-accent transition-colors hover:text-accent-hover">
            privacy@aetherdental.ph
          </a>
          . We will respond within a reasonable time, as provided under the DPA and its IRR.
        </p>
      </>
    ),
  },
  {
    id: "consent",
    title: "Your consent when booking",
    body: (
      <p>
        Before you complete a booking through this website, we present our privacy notice and ask for your explicit
        consent. For every booking we record the date and time of consent, together with your electronic signature (your
        typed full name), as evidence of a freely given, specific, and informed indication of your agreement. Consent is
        a condition for processing your booking request; you may refuse it, in which case we will not be able to process
        your booking through this website.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact us / Data Protection Officer",
    body: (
      <p>
        If you have questions, concerns, or requests regarding this policy or your personal data, you may reach us at:
      </p>
    ),
  },
];

export default async function PrivacyPolicyPage() {
  const clinic = await prisma.clinicSetting.findUnique({
    where: { id: "singleton" },
    select: { address: true, phone: true, email: true },
  });
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-y-2 px-4 py-3 sm:py-4">
          <Logo href="/" priority markClassName="h-8 w-8" wordmarkClassName="text-base sm:text-lg" />
          <div className="flex w-full items-center gap-1 sm:w-auto sm:gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/book">Book an appointment</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Staff login</Link>
            </Button>
            <ThemeToggle className="ml-auto sm:ml-0" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <div className="rounded-card border border-border bg-surface p-6 shadow-sm sm:p-8">
          <p className="font-mono text-eyebrow uppercase text-text-muted">Aether Dental Clinic</p>
          <h1 className="mt-2 text-title-lg font-semibold text-text">Privacy Policy</h1>
          <p className="mt-2 text-body-sm text-text-muted">
            Data Privacy Act of 2012 (Republic Act No. 10173) • Last updated: September 11, 2026
          </p>

          <div className="mt-6 space-y-8">
            {sections.map((s) => (
              <section key={s.id} className="text-sm leading-relaxed text-text-secondary">
                <h2 className="mb-2 text-base font-bold text-text">{s.title}</h2>
                {s.body}
              </section>
            ))}
          </div>

          <div className="mt-4 rounded-control border border-border-accent bg-accent-soft p-4 text-sm text-text-secondary">
            <div className="font-semibold text-text">Aether Dental Clinic</div>
            <p className="mt-1">{clinic?.address || "Clinic address available on request."}</p>
            {clinic?.phone && (
              <p><a href={`tel:${clinic.phone.replace(/[\s()-]/g, "")}`} className="underline-offset-2 hover:underline">{clinic.phone}</a></p>
            )}
            {clinic?.email && (
              <p><a href={`mailto:${clinic.email}`} className="underline-offset-2 hover:underline">{clinic.email}</a></p>
            )}
            <p className="mt-1">
              Data Protection Officer:{" "}
              <a href="mailto:privacy@aetherdental.ph" className="font-medium text-accent transition-colors hover:text-accent-hover">
                privacy@aetherdental.ph
              </a>
            </p>
            <p className="mt-2">
              You may also file a complaint with the{" "}
              <a
                href="https://privacy.gov.ph"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent transition-colors hover:text-accent-hover"
              >
                National Privacy Commission
              </a>{" "}
              (NPC) through their website or complaint center.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/book">Book an appointment</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-text-muted sm:flex-row">
          <Logo href="/" markClassName="h-6 w-6" wordmarkClassName="text-sm" />
          <div>© {new Date().getFullYear()} Aether Dental Clinic. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
