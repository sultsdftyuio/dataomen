import type { ReactNode } from "react";

export type FieldControlProps = {
  id: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
};

/**
 * A labelled field with optional hint and error. Examples live in the hint
 * ("For example, …") rather than a placeholder, so an empty field never looks
 * filled in. The error sits under the control and is linked to it.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  optional = false,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm leading-5 font-medium text-foreground">
        {label}
        {optional ? <span className="font-normal text-subtle"> (optional)</span> : null}
      </label>
      {hint ? (
        <p id={hintId ?? undefined} className="mt-0.5 text-xs leading-5 text-subtle">
          {hint}
        </p>
      ) : null}
      <div className="mt-1.5">
        {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      </div>
      {error ? (
        <p id={errorId ?? undefined} className="mt-1.5 text-sm leading-5 font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
