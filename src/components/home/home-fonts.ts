import { Fraunces } from "next/font/google";

/**
 * Homepage-only display face.
 *
 * Loaded exclusively by `src/app/page.tsx` (the variable class is applied to the
 * homepage root), so admin routes never download the serif and keep Geist.
 *
 * NOTE (decision D3): `axes: ["opsz"]` was evaluated but measured 65.8 KB for the
 * latin subset — over the 60 KB budget — so the documented fallback applies and
 * we ship `wght`-only. The type scale, tracking and weights still deliver the
 * editorial display look; only optical-size variation is given up.
 */
export const frauncesDisplay = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: true,
});
