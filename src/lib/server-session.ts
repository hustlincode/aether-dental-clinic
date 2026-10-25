import { cache } from "react";
import { auth } from "@/auth";

// Share one session read within an RSC render; React resets this cache for every request.
export const getServerSession = cache(async () => auth());
