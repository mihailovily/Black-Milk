'use client';
import { useEffect, useRef, useState } from 'react';
import type { UiMessages } from './ui-messages';
import { Field } from './field';

export function ConfirmDialog({
  title,
  email,
  messages,
  onConfirm,
  onCancel,
}: {
  title: string;
  email?: string;
  messages: UiMessages;
  onConfirm: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = ref.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      <p>
        {email ? messages.Admin.deleteWarning : messages.Common.confirmWarning}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onConfirm(value);
          } finally {
            setBusy(false);
          }
        }}
      >
        {email ? (
          <>
            <p className="break-word">{email}</p>
            <Field
              label={messages.Admin.confirmEmail}
              type="email"
              required
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </>
        ) : null}
        <div className="form-actions">
          <button
            className="button button-secondary"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            {messages.Common.cancel}
          </button>
          <button
            className="button button-danger"
            disabled={
              busy || Boolean(email && value.trim().toLowerCase() !== email)
            }
          >
            {busy ? messages.Common.sending : messages.Common.confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}
