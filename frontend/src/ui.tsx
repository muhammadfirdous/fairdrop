import {
  useState,
  useRef,
  useEffect,
  useId,
  cloneElement,
  type ReactElement,
  type ReactNode,
  type FormEvent,
} from "react";
import { AlertCircle, Check, LoaderCircle, X } from "lucide-react";
export function Alert({
  children,
  kind = "error",
}: {
  children: ReactNode;
  kind?: "error" | "info" | "success";
}) {
  return (
    <div
      className={`alert ${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Badge({
  children,
  state = "",
}: {
  children: ReactNode;
  state?: string;
}) {
  return (
    <span
      className={`badge ${["Completed", "Closed", "approved", "Ready"].includes(state) ? "good" : ["Active", "In progress"].includes(state) ? "water" : ["rejected", "Missed"].includes(state) ? "bad" : "neutral"}`}
    >
      <i />
      {children}
    </span>
  );
}
export function Form({
  children,
  onSubmit,
  submit = "Save",
  disabled = false,
  className = "",
  successText = "Saved to the day’s records.",
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<void>;
  submit?: string;
  disabled?: boolean;
  className?: string;
  successText?: string;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await onSubmit(data);
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={handle}
      className={className}
      onChange={() => setSaved(false)}
    >
      <fieldset disabled={disabled || busy}>{children}</fieldset>
      {error && <Alert>{error}</Alert>}
      <div className="form-actions">
        <button
          type="submit"
          className="button primary"
          disabled={disabled || busy}
        >
          {busy ? (
            <LoaderCircle className="spin" size={16} />
          ) : saved ? (
            <Check size={16} />
          ) : null}
          {busy ? "Saving…" : submit}
        </button>
        {saved && (
          <span className="save-note" role="status">
            {successText}
          </span>
        )}
      </div>
    </form>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(
        children as ReactElement<{ id: string; "aria-describedby"?: string }>,
        { id, "aria-describedby": hint ? `${id}-hint` : undefined },
      )}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={close} className="modal">
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </header>
      <div>{children}</div>
    </dialog>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="eyebrow">A fresh page</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
