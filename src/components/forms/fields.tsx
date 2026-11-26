'use client'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useFieldError } from './action-form'

const controlClass =
  'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

function Wrapper({
  name,
  label,
  hint,
  required,
  className,
  children,
}: {
  name: string
  label: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  const error = useFieldError(name)
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

type Common = { name: string; label: string; hint?: string; required?: boolean; className?: string }

export function TextField({
  name,
  label,
  hint,
  required,
  className,
  ...props
}: Common & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name'>) {
  const error = useFieldError(name)
  return (
    <Wrapper name={name} label={label} hint={hint} required={required} className={className}>
      <input
        id={name}
        name={name}
        aria-invalid={!!error}
        className={cn(controlClass, 'h-10', error && 'border-red-400')}
        {...props}
      />
    </Wrapper>
  )
}

export function TextAreaField({
  name,
  label,
  hint,
  required,
  className,
  ...props
}: Common & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'>) {
  const error = useFieldError(name)
  return (
    <Wrapper name={name} label={label} hint={hint} required={required} className={className}>
      <textarea
        id={name}
        name={name}
        rows={3}
        aria-invalid={!!error}
        className={cn(controlClass, error && 'border-red-400')}
        {...props}
      />
    </Wrapper>
  )
}

export function SelectField({
  name,
  label,
  hint,
  required,
  className,
  options,
  placeholder,
  ...props
}: Common & {
  options: Array<{ value: string; label: string }>
  placeholder?: string
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'name'>) {
  const error = useFieldError(name)
  return (
    <Wrapper name={name} label={label} hint={hint} required={required} className={className}>
      <select
        id={name}
        name={name}
        aria-invalid={!!error}
        className={cn(controlClass, 'h-10', error && 'border-red-400')}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  )
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string
  label: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} value="on" defaultChecked={defaultChecked} className="h-4 w-4 rounded border-input" />
      {label}
    </label>
  )
}

export function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
}
