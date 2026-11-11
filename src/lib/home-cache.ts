import { revalidatePath } from "next/cache";

// Public pages render dynamically by tenant. Keep invalidation for clients that
// already navigated to these pages before a clinic mutation.
export function revalidateHomepage(): void {
  try {
    revalidatePath("/");
  } catch (error) {
    // A cache failure must not report a committed database mutation as failed.
    console.error("Homepage revalidation failed:", error);
  }
}

/** Clinic contact details also appear on the privacy page. */
export function revalidateClinicPages(): void {
  revalidateHomepage();
  try {
    revalidatePath("/privacy-policy");
  } catch (error) {
    console.error("Privacy page revalidation failed:", error);
  }
}
