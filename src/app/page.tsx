import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const services = [
  { name: "Dental Consultation", desc: "Comprehensive examination and advice.", price: "₱500" },
  { name: "Dental Cleaning", desc: "Professional cleaning & polish.", price: "₱1,200" },
  { name: "Tooth Extraction", desc: "Safe removal of problem teeth.", price: "₱2,000" },
  { name: "Dental Filling", desc: "Tooth-colored composite restorations.", price: "₱1,500" },
  { name: "Teeth Whitening", desc: "In-clinic professional whitening.", price: "₱6,000" },
  { name: "Root Canal", desc: "Save an infected tooth.", price: "₱8,000" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="bg-surface border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="text-xl font-bold">
            <span className="text-text">Aether </span>
            <span className="text-accent">Dental</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-text-secondary sm:flex">
            <Link href="/#services" className="hover:text-accent transition-colors duration-200">Services</Link>
            <Link href="/#about" className="hover:text-accent transition-colors duration-200">About</Link>
            <Link href="/#contact" className="hover:text-accent transition-colors duration-200">Contact</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-text-secondary hover:text-accent transition-colors duration-200">Staff login</Link>
            <ThemeToggle />
            <Link href="/book" className="gradient-gold rounded-lg px-4 py-2 text-sm font-semibold text-[#0E0F10] shadow transition-opacity duration-200 hover:opacity-90">
              Book Now
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="gradient-hero">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:py-24 md:grid-cols-2 md:items-center animate-fade-in">
          <div>
            <div className="inline-flex items-center rounded-full border border-border-accent bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
              Your trusted dental care
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-text sm:text-5xl">
              Book your dental appointment in minutes.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-text-secondary">
              Choose your service, pick a dentist and a time that works for you, and get an instant
              confirmation. No phone calls. No waiting.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className="gradient-gold rounded-lg px-6 py-3 font-semibold text-[#0E0F10] shadow-md transition-opacity duration-200 hover:opacity-90">
                Book an Appointment
              </Link>
              <a href="#services" className="rounded-lg border border-border px-6 py-3 font-semibold text-text-secondary transition-all duration-200 hover:bg-surface">
                View Services
              </a>
            </div>
            <div className="mt-10 flex gap-8">
              <Stat value="8+" label="Services" />
              <Stat value="4" label="Dentists" />
              <Stat value="150+" label="Patients served monthly" />
            </div>
          </div>
          <div className="animate-slide-up rounded-2xl border border-border-accent bg-surface p-8 shadow-lg">
            <div className="text-sm font-medium text-accent">How booking works</div>
            <ol className="mt-4 space-y-4">
              {["Choose a service", "Select your dentist", "Pick a date & time", "Get instant confirmation"].map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full gradient-gold text-sm font-bold text-[#0E0F10]">{i + 1}</span>
                  <span className="font-medium text-text">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold text-text">Our Services</h2>
          <div className="mx-auto mt-2 h-0.5 w-12 bg-accent" />
          <p className="mt-3 text-center text-text-muted">Transparent pricing. Professional care.</p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => (
              <div
                key={s.name}
                className="rounded-xl border border-border bg-surface p-6 transition-all duration-200 hover:border-border-accent hover:shadow-lg animate-slide-up"
                style={{ animationDelay: `${i * 75}ms`, animationFillMode: "backwards" }}
              >
                <div className="text-lg font-semibold text-text">{s.name}</div>
                <div className="mt-1 text-sm text-text-muted">{s.desc}</div>
                <div className="mt-4 text-xl font-bold text-accent">{s.price}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/book" className="inline-block gradient-gold rounded-lg px-6 py-3 font-semibold text-[#0E0F10] shadow transition-opacity duration-200 hover:opacity-90">
              Book a visit
            </Link>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="bg-background-alt">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-bold text-text">Modern dental care, your way.</h2>
              <p className="mt-4 text-text-secondary">
                Aether Dental is a modern clinic built around your schedule. Our easy online booking,
                experienced specialists, and patient-first approach make caring for your smile simpler
                than ever.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Feature title="Flexible booking" desc="Online scheduling at your convenience." />
              <Feature title="Expert specialists" desc="Experienced dentists in every field." />
              <Feature title="Clear pricing" desc="No hidden costs. Great value." />
              <Feature title="Instant confirmation" desc="Email confirmation the moment you book." />
            </div>
          </div>
        </div>
      </section>

      {/* Contact / Footer */}
      <section id="contact" className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold text-text">Visit us</h2>
              <div className="mt-4 space-y-2 text-text-secondary">
                <p>123 Aether Ave., Bonifacio Global City<br />Taguig, Metro Manila</p>
                <p>+63 2 8123 4567</p>
                <p>hello@aetherdental.ph</p>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-text">Clinic hours</h2>
              <div className="mt-4 space-y-2 text-text-secondary">
                <p>Monday – Friday: 9:00 AM – 5:00 PM</p>
                <p>Saturday: 10:00 AM – 3:00 PM</p>
                <p>Sunday: Closed</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-surface border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 text-sm text-text-muted sm:flex-row">
          <div className="font-bold">
            <span className="text-text">Aether </span>
            <span className="text-accent">Dental</span>
          </div>
          <div>© {new Date().getFullYear()} Aether Dental Clinic. All rights reserved.</div>
          <Link href="/privacy-policy" className="text-sm text-text-muted transition-colors duration-200 hover:text-accent">
            Privacy Policy
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold gradient-gold-text">{value}</div>
      <div className="text-sm text-text-muted">{label}</div>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 transition-all duration-200 hover:border-border-accent hover:shadow-lg">
      <div className="font-semibold text-text">{title}</div>
      <div className="mt-1 text-sm text-text-muted">{desc}</div>
    </div>
  );
}
