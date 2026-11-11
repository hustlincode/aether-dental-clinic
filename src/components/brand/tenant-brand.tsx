"use client";

import { createContext, useContext, type ReactNode } from "react";

const TenantBrand = createContext({ name: "Dental Clinic", bookingAllowed: true });

export function TenantBrandProvider({ name, bookingAllowed = true, children }: { name: string; bookingAllowed?: boolean; children: ReactNode }) {
  return <TenantBrand.Provider value={{ name, bookingAllowed }}>{children}</TenantBrand.Provider>;
}

export function useClinicName() {
  return useContext(TenantBrand).name;
}

export function useClinicBookingAllowed() {
  return useContext(TenantBrand).bookingAllowed;
}
