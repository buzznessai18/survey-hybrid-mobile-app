import { AlertCircle, CheckCircle2, Info, SearchX, TriangleAlert, WifiOff, type LucideIcon } from "lucide-react";
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";

export function Button({
  variant = "primary", small, block, loading, loadingText, icon: Icon, children, className = "", ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; small?: boolean; block?: boolean; loading?: boolean; loadingText?: string; icon?: LucideIcon;
}) {
  const cls = ["btn", `btn-${variant}`, small && "btn-sm", block && "btn-block", className].filter(Boolean).join(" ");
  return (
    <button className={cls} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : Icon ? <Icon aria-hidden /> : null}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

let fieldSeq = 0;
const useFieldId = (id?: string) => {
  const [generated] = useState(() => `f${++fieldSeq}`);
  return id ?? generated;
};

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
}

function FieldShell({ id, label, required, error, hint, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span className="req" aria-hidden> *</span> : null}
      </label>
      {children}
      {error ? <span id={`${id}-err`} className="error-text" role="alert">{error}</span> : hint ? <span id={`${id}-hint`} className="hint">{hint}</span> : null}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps & { icon?: LucideIcon; action?: ReactNode }>(
  function TextField({ label, required, error, hint, icon: Icon, action, id: idProp, ...rest }, ref) {
    const id = useFieldId(idProp);
    const input = (
      <input ref={ref} id={id} className="input" aria-invalid={!!error} aria-required={required} aria-describedby={describedBy(id, error, hint)} {...rest} />
    );
    return (
      <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
        {Icon || action ? (
          <div className="input-wrap">
            {Icon ? <Icon aria-hidden /> : null}
            {input}
            {action ? <span className="input-action">{action}</span> : null}
          </div>
        ) : (
          input
        )}
      </FieldShell>
    );
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function TextArea(
  { label, required, error, hint, id: idProp, ...rest },
  ref,
) {
  const id = useFieldId(idProp);
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <textarea ref={ref} id={id} className="textarea" aria-invalid={!!error} aria-describedby={describedBy(id, error, hint)} {...rest} />
    </FieldShell>
  );
});

export const SelectField = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldProps & { options: { value: string; label: string }[]; placeholder?: string }
>(function SelectField({ label, required, error, hint, options, placeholder, id: idProp, ...rest }, ref) {
  const id = useFieldId(idProp);
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <select ref={ref} id={id} className="select" aria-invalid={!!error} aria-describedby={describedBy(id, error, hint)} {...rest}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FieldShell>
  );
});

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

const BANNER_ICON = { error: AlertCircle, warning: TriangleAlert, success: CheckCircle2, info: Info } as const;

export function Banner({ tone, title, children }: { tone: keyof typeof BANNER_ICON; title?: string; children?: ReactNode }) {
  const Icon = BANNER_ICON[tone];
  return (
    <div className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon aria-hidden />
      <div>
        {title ? <strong>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon = SearchX, title, message, action }: { icon?: LucideIcon; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="state">
      <Icon aria-hidden />
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title, message, offline, onRetry }: { title?: string; message?: string; offline?: boolean; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      {offline ? <WifiOff aria-hidden /> : <AlertCircle aria-hidden />}
      <h3>{title ?? (offline ? "You're offline" : "Couldn't load this")}</h3>
      {message ? <p>{message}</p> : null}
      {onRetry ? <Button variant="secondary" small onClick={onRetry}>Try again</Button> : null}
    </div>
  );
}

export function Skeleton({ height = 76, count = 1 }: { height?: number; count?: number }) {
  return (
    <div aria-hidden style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: count }, (_, i) => <div key={i} className="skeleton" style={{ height }} />)}
    </div>
  );
}

/** Promise-based confirmation using the native <dialog> element. */
export function useConfirm() {
  const [req, setReq] = useState<{ title: string; message: string; confirm: string; danger?: boolean; resolve: (ok: boolean) => void } | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (req && ref.current && !ref.current.open) ref.current.showModal();
  }, [req]);

  const ask = (opts: { title: string; message: string; confirm: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setReq({ ...opts, resolve }));

  const close = (ok: boolean) => {
    ref.current?.close();
    req?.resolve(ok);
    setReq(null);
  };

  const dialog = req ? (
    <dialog ref={ref} className="confirm" onCancel={(e) => { e.preventDefault(); close(false); }} aria-labelledby="confirm-title">
      <h2 id="confirm-title">{req.title}</h2>
      <p>{req.message}</p>
      <div className="actions">
        <Button variant="secondary" onClick={() => close(false)} autoFocus>Cancel</Button>
        <Button variant={req.danger ? "danger-solid" : "primary"} onClick={() => close(true)}>{req.confirm}</Button>
      </div>
    </dialog>
  ) : null;

  return { ask, dialog };
}

/** A short message at the bottom of the screen. */
export function useToast() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 3500);
    return () => clearTimeout(t);
  }, [text]);
  const toast = text ? <div className="toast" role="status">{text}</div> : null;
  return { show: setText, toast };
}
