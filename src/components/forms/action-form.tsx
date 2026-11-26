'use client'

import { createContext, useContext, useEffect, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { toast } from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { Button, type ButtonProps } from '@/components/ui/button'
import type { ActionState } from '@/lib/actions'
import { cn } from '@/lib/utils'

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>

const FieldErrors = createContext<ActionState['fieldErrors']>(undefined)

export function useFieldError(name: string) {
  return useContext(FieldErrors)?.[name]?.[0]
}

/**
 * Formulario conectado a una Server Action: muestra el error general,
 * los errores por campo y un aviso cuando la acción termina bien.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: Action
  children: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
}) {
  const [state, formAction] = useFormState(action, {})
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message)
    if (state.ok && resetOnSuccess) ref.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form ref={ref} action={formAction} className={cn('space-y-4', className)} noValidate>
      {state.error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      <FieldErrors.Provider value={state.fieldErrors}>{children}</FieldErrors.Provider>
    </form>
  )
}

export function SubmitButton({ children, className, ...props }: ButtonProps) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className={className} {...props}>
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  )
}

/** Botón de una sola acción (cambiar estado, borrar...) con confirmación opcional. */
export function ActionButton({
  action,
  fields,
  confirm,
  children,
  ...buttonProps
}: {
  action: Action
  fields?: Record<string, string>
  confirm?: string
} & ButtonProps) {
  const [state, formAction] = useFormState(action, {})

  useEffect(() => {
    if (state.error) toast.error(state.error)
    else if (state.ok && state.message) toast.success(state.message)
  }, [state])

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault()
      }}
      className="inline"
    >
      {Object.entries(fields ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton {...buttonProps}>{children}</SubmitButton>
    </form>
  )
}
