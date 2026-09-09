"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function SignOutButton({
  className = "",
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Sign out"
        title="Sign out"
        className={`flex items-center gap-2 rounded-lg text-sidebar-text-muted transition-all hover:bg-sidebar-hover hover:text-sidebar-text ${
          iconOnly ? "px-2 py-1.5" : "px-2.5 py-1.5 text-sm"
        } ${className}`}
      >
        <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {!iconOnly && <span className="text-sm font-medium">Log out</span>}
      </button>

      <ConfirmDialog
        open={open}
        title="Log out"
        message="Are you sure you want to log out? You will need to sign in again to access the dashboard."
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        destructive
        onConfirm={async () => {
          setOpen(false);
          await signOut({ redirect: false });
          router.push("/login");
          router.refresh();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}