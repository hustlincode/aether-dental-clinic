"use client"

import * as React from "react"
import { cn } from "@/lib/cn"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { Button } from "@/components/ui/button"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-(--dur-slow) data-[state=closed]:duration-(--dur-fast) motion-reduce:animate-none!",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  mobileBottomSheet = false,
  onSwipeDismiss,
  ref,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  mobileBottomSheet?: boolean
  onSwipeDismiss?: () => void
}) {
  const returnFocusRef = React.useRef<HTMLElement | null>(null)
  const [contentNode, setContentNode] = React.useState<HTMLDivElement | null>(null)
  React.useImperativeHandle(ref, () => contentNode!, [contentNode])
  const dismissRef = React.useRef(onSwipeDismiss)
  React.useEffect(() => { dismissRef.current = onSwipeDismiss }, [onSwipeDismiss])

  React.useEffect(() => {
    if (!contentNode || !mobileBottomSheet) return
    const node = contentNode
    let drag: { id: number; x: number; y: number; lastY: number; lastAt: number; sampleY: number; sampleAt: number; offset: number; axis: "pending" | "vertical" | "ignored" } | null = null
    let dismissing = false

    function reset(animate = false) {
      const previous = drag
      drag = null
      if (previous && node.hasPointerCapture(previous.id)) node.releasePointerCapture(previous.id)
      node.style.transition = animate && !matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "translate var(--dur-fast) var(--ease-out)" : "none"
      node.style.translate = "0 0"
    }

    function down(event: PointerEvent) {
      if (drag || dismissing || !dismissRef.current || !event.isPrimary || event.button !== 0 || matchMedia("(min-width: 40rem)").matches || node.dataset.state !== "open") return
      const target = event.target
      if (!(target instanceof Element) || !node.contains(target) ||
        !target.closest('[data-slot="sheet-handle"], [data-slot="sheet-header"]') ||
        target.closest('button, a, input, select, textarea, [role="button"], [role="link"], [contenteditable="true"]')) return
      reset()
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY, lastAt: event.timeStamp, sampleY: event.clientY, sampleAt: event.timeStamp, offset: 0, axis: "pending" }
      node.setPointerCapture(event.pointerId)
    }

    function move(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return
      const dy = event.clientY - drag.y
      const dx = event.clientX - drag.x
      if (drag.axis === "pending" && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
        drag.axis = dy > 0 && dy > Math.abs(dx) ? "vertical" : "ignored"
      }
      if (drag.axis !== "vertical") return
      event.preventDefault()
      // Recent motion decides a flick; pausing before release must not count as a fast swipe.
      if (event.timeStamp - drag.sampleAt > 80) {
        drag.sampleY = drag.lastY
        drag.sampleAt = drag.lastAt
      }
      drag.lastY = event.clientY
      drag.lastAt = event.timeStamp
      drag.offset = Math.max(0, dy)
      node.style.translate = `0 ${drag.offset}px`
    }

    function up(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return
      if (!dismissRef.current) { reset(true); return }
      const velocity = event.timeStamp - drag.lastAt <= 80
        ? (drag.lastY - drag.sampleY) / Math.max(1, drag.lastAt - drag.sampleAt) : 0
      if (drag.axis === "vertical" && (drag.offset >= Math.min(120, node.getBoundingClientRect().height * 0.25) || (drag.offset >= 24 && velocity > 0.6))) {
        const id = drag.id
        drag = null
        dismissing = true
        if (node.hasPointerCapture(id)) node.releasePointerCapture(id)
        dismissRef.current()
      } else reset(true)
    }

    function cancel(event: PointerEvent) {
      if (drag?.id === event.pointerId) reset(true)
    }
    function resize() { reset() }
    const observer = new MutationObserver(() => {
      if (node.dataset.state === "open") { dismissing = false; reset() }
      else if (!dismissing) reset()
    })
    observer.observe(node, { attributes: true, attributeFilter: ["data-state"] })
    node.addEventListener("pointerdown", down)
    node.addEventListener("pointermove", move, { passive: false })
    node.addEventListener("pointerup", up)
    node.addEventListener("pointercancel", cancel)
    node.addEventListener("lostpointercapture", cancel)
    window.addEventListener("resize", resize)
    return () => {
      observer.disconnect()
      node.removeEventListener("pointerdown", down)
      node.removeEventListener("pointermove", move)
      node.removeEventListener("pointerup", up)
      node.removeEventListener("pointercancel", cancel)
      node.removeEventListener("lostpointercapture", cancel)
      window.removeEventListener("resize", resize)
      reset()
      node.style.removeProperty("translate")
      node.style.removeProperty("transition")
    }
  }, [contentNode, mobileBottomSheet])

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={setContentNode}
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex max-h-dvh flex-col gap-0 overflow-hidden bg-background shadow-xl ease-out data-[state=closed]:animate-out data-[state=closed]:duration-(--dur-fast) data-[state=open]:animate-in data-[state=open]:duration-(--dur-slow) motion-reduce:animate-none!",
          !mobileBottomSheet && side === "right" &&
            "inset-y-0 right-0 h-dvh w-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          !mobileBottomSheet && side === "left" &&
            "inset-y-0 left-0 h-dvh w-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          !mobileBottomSheet && side === "top" &&
            "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          !mobileBottomSheet && side === "bottom" &&
            "inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          mobileBottomSheet &&
            "inset-x-0 bottom-0 h-auto max-h-[90dvh] rounded-t-card border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom [&>[data-slot=sheet-header]]:touch-none sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-dvh sm:w-full sm:max-w-lg sm:rounded-none sm:border-t-0 sm:border-l sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:slide-in-from-right sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:slide-out-to-right sm:[&>[data-slot=sheet-header]]:touch-auto",
          className
        )}
        {...props}
        onOpenAutoFocus={(event) => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          onOpenAutoFocus?.(event)
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          // Detail drawers open from table actions rather than a Radix trigger.
          if (!event.defaultPrevented && returnFocusRef.current?.isConnected) {
            event.preventDefault()
            returnFocusRef.current.focus()
          }
        }}
      >
        {mobileBottomSheet && (
          <div data-slot="sheet-handle" className="flex h-6 shrink-0 touch-none items-center justify-center sm:hidden" aria-hidden="true">
            <span className="h-1 w-10 rounded-pill bg-border-strong" />
          </div>
        )}
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close asChild>
            <Button type="button" variant="ghost" size="icon" className="absolute top-5 right-5" aria-label="Close">
              <XIcon aria-hidden="true" />
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex shrink-0 flex-col gap-1.5 border-b border-border px-6 py-5 pr-16", className)}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 [overflow-wrap:anywhere]", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-3 border-t border-border px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
