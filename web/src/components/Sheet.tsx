import { useEffect, useRef } from "react";
import type { FormEvent, ReactNode } from "react";
import { cx } from "../lib/cx";
import { Button } from "./Button";
import styles from "./Sheet.module.css";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  titleId: string;
  /** Renders the dialog as a <form> (Enter submits). */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

/** Bottom sheet on mobile, centred dialog on desktop. Stays mounted so it can animate in and out. */
export function Sheet({ open, onClose, titleId, onSubmit, children }: SheetProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Keep the sheet inside the visible area when the on-screen keyboard opens.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = backdropRef.current;
    if (!open || !vv || !el) return;
    const fit = () => {
      el.style.height = `${vv.height}px`;
      el.style.top = `${vv.offsetTop}px`;
    };
    vv.addEventListener("resize", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      el.style.height = "";
      el.style.top = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const content = (
    <>
      <div className={styles.handle} aria-hidden="true" />
      {children}
    </>
  );

  return (
    <div
      ref={backdropRef}
      className={cx(styles.backdrop, open && styles.open)}
      aria-hidden={!open}
      inert={!open}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {onSubmit ? (
        <form className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={onSubmit} noValidate>
          {content}
        </form>
      ) : (
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          {content}
        </div>
      )}
    </div>
  );
}

export function SheetTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className={styles.title}>
      {children}
    </h3>
  );
}

/** Label above an input / textarea (the control is passed as children). */
export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

export const SheetHint = ({ children }: { children: ReactNode }) => <p className={styles.hint}>{children}</p>;

export function SheetError({ message, ref }: { message: string; ref?: React.Ref<HTMLParagraphElement> }) {
  return (
    <p className={styles.error} ref={ref}>
      {message}
    </p>
  );
}

interface ActionsProps {
  onCancel: () => void;
  saveLabel: string;
  saving?: boolean;
  /** Submit button (inside a form) or a plain button wired to onSave. */
  onSave?: () => void;
}

export function SheetActions({ onCancel, saveLabel, saving, onSave }: ActionsProps) {
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.cancel} onClick={onCancel}>
        Скасувати
      </button>
      <Button type={onSave ? "button" : "submit"} onClick={onSave} disabled={saving}>
        {saveLabel}
      </Button>
    </div>
  );
}
