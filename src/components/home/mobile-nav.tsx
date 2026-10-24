"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { HamburgerButton } from "@/components/ui/hamburger-button";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetFooter,
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
      <SheetContent side="right" className="w-68 sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>
            <Logo href={null} wordmarkClassName="text-base" markClassName="h-7 w-7" />
          </SheetTitle>
          <SheetDescription>Explore our services, team, and FAQs.</SheetDescription>
        </SheetHeader>
        <SheetBody className="px-3 py-4">
        <nav aria-label="Mobile menu" className="flex flex-col gap-1">
          {NAV_LINKS.map((link) => (
            <SheetClose key={link.href} asChild>
              <Link
                href={link.href}
                className="rounded-control px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent"
              >
                {link.label}
              </Link>
            </SheetClose>
          ))}
          <SheetClose asChild>
            <Link
              href="/login"
              className="rounded-control px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-accent-soft hover:text-accent"
            >
              Staff login
            </Link>
          </SheetClose>
        </nav>
        </SheetBody>
        <SheetFooter>
          <SheetClose asChild>
            <Button asChild size="default" className="w-full">
              <Link href="/book">Book Now</Link>
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
