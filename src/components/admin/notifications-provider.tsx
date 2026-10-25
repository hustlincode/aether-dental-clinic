"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { createNotificationStore } from "@/lib/client-notifications";

const NotificationsContext = createContext<ReturnType<typeof createNotificationStore> | null>(null);

export function NotificationsProvider({ children, isDemo }: { children: ReactNode; isDemo: boolean }) {
  const pathname = usePathname();
  const [initialPath] = useState(pathname);
  const [store] = useState(() => createNotificationStore(isDemo));
  const mounted = useRef({ generation: 0 });
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    const lifecycle = mounted.current;
    const generation = ++lifecycle.generation;
    if (initialPath !== "/admin/notifications") void store.initialize();
    return () => {
      // StrictMode's immediate effect replay reuses the same pending request.
      queueMicrotask(() => { if (lifecycle.generation === generation) store.dispose(); });
    };
  }, [initialPath, store]);

  useEffect(() => {
    if (snapshot.mutationError) toast.error(snapshot.mutationError);
  }, [snapshot.mutationError]);

  return <NotificationsContext.Provider value={store}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const store = useContext(NotificationsContext);
  if (!store) throw new Error("Notifications must be used inside the admin provider.");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...snapshot, ...store };
}
