"use client";

import { useState } from "react";
import Link from "next/link";
import { HamburgerButton } from "@/components/ui/hamburger-button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV_LINKS = [
  { href: "/#services", label: "Services" },
  { href: "/#dentists", label: "Dentists" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#contact", label: "Contact" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <HamburgerButton
          open={open}
          onClick={() => setOpen(true)}
          label="Open menu"
          className="lg:hidden"
        />
      </SheetTrigger>
      <SheetContent side="right" className="w-[17rem] sm:max-w-sm">
        <SheetHeader className="border-b border-border">
          <SheetTitle>
            <span className="text-text">Aether </span>
            <span className="text-accent">Dental</span>
          </SheetTitle>
          <SheetDescription>Explore our services, team, and FAQs.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile menu" className="flex flex-col gap-1 px-2">
          {NAV_LINKS.map((link) => (
            <SheetClose key={link.href} asChild>
              <Link
                href={link.href}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent"
              >
                {link.label}
              </Link>
            </SheetClose>
          ))}
          <SheetClose asChild>
            <Link
              href="/login"
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent"
            >
              Staff login
            </Link>
          </SheetClose>
        </nav>
        <div className="mt-auto p-4">
          <SheetClose asChild>
            <Link
              href="/book"
              className="gradient-gold flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm font-semibold text-[#0E0F10] shadow-md transition-opacity duration-200 hover:opacity-90"
            >
              Book Now
            </Link>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}