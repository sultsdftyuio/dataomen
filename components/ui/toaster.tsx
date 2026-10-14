'use client'

import { AlertCircle } from 'lucide-react'

import { useToast as useComponentToast } from '@/components/ui/use-toast'
import { useToast as useHookToast } from '@/hooks/use-toast'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

/**
 * Renders toasts raised with `toast()` from either `@/components/ui/use-toast`
 * or `@/hooks/use-toast`. Those are two copies of the same module, so each has
 * its own in-memory store; subscribing to both means no caller is silent.
 * Mount once per layout (the dashboard mounts it in app/(dashboard)/layout.tsx).
 *
 * Toasts are announced politely (Radix `type="background"`): they confirm the
 * outcome of something the person just did and must not interrupt a screen
 * reader mid-sentence. Errors that block work belong inline, next to the
 * control that failed, not only in a toast.
 */
export function Toaster() {
  const { toasts: componentToasts } = useComponentToast()
  const { toasts: hookToasts } = useHookToast()
  // Both stores count ids from 1, so prefix keys to keep them unique.
  const toasts = [
    ...componentToasts.map((item) => ({ ...item, id: `c-${item.id}` })),
    ...hookToasts.map((item) => ({ ...item, id: `h-${item.id}` })),
  ]

  return (
    <ToastProvider label="Notifications" duration={6000}>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const isError = variant === 'destructive'
        return (
          <Toast
            key={id}
            type="background"
            variant={variant}
            className={`items-start gap-3 space-x-0 rounded-lg bg-card p-4 pr-11 text-foreground shadow-md ${isError ? 'border-danger/40' : 'border-border'}`}
            {...props}
          >
            {isError ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            ) : null}
            <div className="grid min-w-0 flex-1 gap-1">
              {title && (
                <ToastTitle className={isError ? 'text-danger' : 'text-foreground'}>
                  {title}
                </ToastTitle>
              )}
              {description && (
                <ToastDescription className="text-sm text-muted-foreground opacity-100">
                  {description}
                </ToastDescription>
              )}
            </div>
            {action}
            <ToastClose
              aria-label="Dismiss notification"
              className="right-1.5 top-1.5 grid size-8 place-items-center rounded-md p-0 text-muted-foreground opacity-100 hover:text-foreground focus:ring-2 focus:ring-ring group-[.destructive]:text-muted-foreground group-[.destructive]:hover:text-foreground group-[.destructive]:focus:ring-ring group-[.destructive]:focus:ring-offset-background"
            />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
