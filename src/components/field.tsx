'use client';
import { useId } from 'react';
export function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        aria-describedby={hint ? id + '-hint' : undefined}
      />
      {hint ? <small id={id + '-hint'}>{hint}</small> : null}
    </div>
  );
}
