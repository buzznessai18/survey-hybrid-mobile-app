import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, Lock, Mail, Pause, Phone, Play, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Banner, Button, ErrorState, Skeleton, TextField, useConfirm, useToast } from "@/components/ui";
import { formatDateTime } from "@/lib/date";
import { errorMessage, toApiError } from "@/lib/errors";
import { normalizeMobile, toE164 } from "@/lib/mobile";
import type { ManagedUserDetail } from "@/lib/types";
import { useRemote } from "@/lib/useRemote";
import { editUserSchema, newUserSchema, type EditUserValues, type NewUserValues } from "@/lib/validation";
import { UserService } from "@/services/api";
import { useAuth } from "@/store/auth";

const back = <Link to="/app/users" className="back-link"><ChevronLeft aria-hidden />Users</Link>;

function RolePicker({ register }: { register: UseFormRegister<NewUserValues> | UseFormRegister<EditUserValues> }) {
  const reg = (register as UseFormRegister<NewUserValues>)("role");
  return (
    <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
      <legend className="label" style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-2)", marginBottom: 8 }}>Account type</legend>
      <label className="radio-card">
        <input type="radio" value="user" {...reg} />
        <div><strong>Regular user</strong><span>Adds, searches and views records, prints receipts.</span></div>
      </label>
      <label className="radio-card">
        <input type="radio" value="admin" {...reg} />
        <div><strong>Admin</strong><span>Everything, plus deleting records, users, reports and audit history.</span></div>
      </label>
    </fieldset>
  );
}

/** Admin-only: create a company user or admin (public sign-up is closed). */
export function NewUser() {
  const navigate = useNavigate();
  const [saveError, setSaveError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<NewUserValues>({
    resolver: zodResolver(newUserSchema),
    defaultValues: { fullName: "", role: "user", mobile: "", email: "", password: "" },
  });
  const errors = formState.errors;

  const onSave = handleSubmit(async (v) => {
    setSaveError(null);
    try {
      await UserService.create({
        full_name: v.fullName.trim(),
        role: v.role,
        email: v.email.trim() ? v.email.trim().toLowerCase() : undefined,
        phone: v.mobile.trim() ? toE164(v.mobile) : undefined,
        password: v.password,
      });
      navigate("/app/users");
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  });

  return (
    <div className="form-page">
      {back}
      <div className="page-head"><div><h1>Add user</h1><p>They sign in with their mobile number (or email) and the password you set.</p></div></div>
      {saveError ? <Banner tone="error">{saveError}</Banner> : null}
      <form className="form-section" onSubmit={onSave} noValidate>
        <RolePicker register={register} />
        <TextField label="Full name" required maxLength={150} autoComplete="off" error={errors.fullName?.message} {...register("fullName")} />
        <div className="row-2">
          <TextField label="Mobile number" icon={Phone} type="tel" maxLength={16} placeholder="10-digit mobile" autoComplete="off" error={errors.mobile?.message} {...register("mobile")} />
          <TextField label="Email (optional)" icon={Mail} type="email" maxLength={120} autoComplete="off" error={errors.email?.message} {...register("email")} />
        </div>
        <TextField
          label="Password"
          required
          icon={Lock}
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters. Share it with the person securely."
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="form-footer">
          <Link to="/app/users" className="btn btn-secondary">Cancel</Link>
          <Button type="submit" icon={UserPlus} loading={formState.isSubmitting} loadingText="Creating…">Create account</Button>
        </div>
      </form>
    </div>
  );
}

/** Admin-only: view and edit a user (name, role, sign-in mobile / email, password), deactivate or delete. */
export function EditUser() {
  const { id = "" } = useParams();
  const user = useRemote(() => UserService.get(id), id);
  if (!user.data) {
    return (
      <div className="form-page">
        {back}
        {user.error ? (
          <ErrorState offline={user.error.offline} message={user.error.notFound ? "This user no longer exists." : user.error.message} onRetry={user.error.notFound ? undefined : user.reload} />
        ) : (
          <Skeleton height={420} />
        )}
      </div>
    );
  }
  return <EditUserForm key={user.data.updated_at} user={user.data} onChanged={user.reload} />;
}

function recordsText(u: ManagedUserDetail) {
  const parts = [];
  if (u.records.service_records) parts.push(`${u.records.service_records} record${u.records.service_records === 1 ? "" : "s"}`);
  if (u.records.forms) parts.push(`${u.records.forms} 1/14 form${u.records.forms === 1 ? "" : "s"}`);
  if (u.records.surveys) parts.push(`${u.records.surveys} field survey${u.records.surveys === 1 ? "" : "s"}`);
  return parts.join(" and ");
}

function EditUserForm({ user, onChanged }: { user: ManagedUserDetail; onChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const me = useAuth().profile?.id;
  const isMe = user.id === me;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"status" | "delete" | null>(null);
  const { ask, dialog } = useConfirm();
  const { show, toast } = useToast();
  const originalMobile = user.phone ? normalizeMobile(user.phone) : user.mobile ? normalizeMobile(user.mobile) : "";
  const originalEmail = user.email ?? "";

  const { register, handleSubmit, formState, setError } = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { fullName: user.full_name, role: user.role === "admin" ? "admin" : "user", mobile: originalMobile, email: originalEmail, password: "" },
  });
  const errors = formState.errors;

  const onSave = handleSubmit(async (v) => {
    setSaveError(null);
    // Sign-in details can be replaced but not removed.
    if (originalMobile && !v.mobile.trim()) return setError("mobile", { message: "Enter a new number to replace it (it can't be removed)" });
    if (originalEmail && !v.email.trim()) return setError("email", { message: "Enter a new email to replace it (it can't be removed)" });

    const changes: Parameters<typeof UserService.update>[0] = { user_id: user.id };
    if (v.fullName.trim() !== user.full_name) changes.full_name = v.fullName.trim();
    if (!isMe && v.role !== (user.role === "admin" ? "admin" : "user")) changes.role = v.role;
    if (v.mobile.trim() && normalizeMobile(v.mobile) !== originalMobile) changes.phone = toE164(v.mobile);
    const email = v.email.trim().toLowerCase();
    if (email && email !== originalEmail) changes.email = email;
    if (v.password) changes.password = v.password;
    if (Object.keys(changes).length === 1) return navigate("/app/users");

    try {
      await UserService.update(changes);
      navigate("/app/users");
    } catch (e) {
      const err = toApiError(e);
      if (err.fields?.email) setError("email", { message: err.fields.email });
      if (err.fields?.phone) setError("mobile", { message: err.fields.phone });
      setSaveError(errorMessage(e));
    }
  });

  const setStatus = async (status: "active" | "inactive") => {
    if (status === "inactive") {
      const ok = await ask({ title: "Deactivate account?", message: `${user.full_name} will be signed out and can't sign in until reactivated. Their records stay.`, confirm: "Deactivate", danger: true });
      if (!ok) return;
    }
    setBusy("status");
    try {
      await UserService.update({ user_id: user.id, status });
      await onChanged();
    } catch (e) {
      show(`Couldn't update user: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!user.can_delete) {
      show(`${user.full_name} entered ${recordsText(user)}, so the account can only be deactivated.`);
      return;
    }
    const ok = await ask({ title: "Delete user permanently?", message: `${user.full_name}'s account will be removed and they won't be able to sign in. This can't be undone.`, confirm: "Delete user", danger: true });
    if (!ok) return;
    setBusy("delete");
    try {
      await UserService.remove(user.id);
      navigate("/app/users");
    } catch (e) {
      show(`Couldn't delete user: ${errorMessage(e)}`);
      setBusy(null);
    }
  };

  const active = user.status === "active";
  return (
    <div className="form-page">
      {back}
      <div className="page-head">
        <div>
          <h1>{user.full_name}</h1>
          <p>
            {recordsText(user) ? `Entered ${recordsText(user)}. ` : "Hasn't entered any records. "}
            {user.last_sign_in_at ? `Last signed in ${formatDateTime(user.last_sign_in_at)}.` : "Has never signed in."}
          </p>
        </div>
        <div className="user-badges">
          <span className={`badge ${user.role === "admin" ? "badge-green" : "badge-blue"}`}>{user.role === "admin" ? "Admin" : "Regular user"}</span>
          <span className={`badge ${active ? "badge-green" : "badge-grey"}`}>{active ? "Active" : user.status === "pending" ? "Pending" : "Inactive"}</span>
          {isMe ? <span className="badge badge-grey">You</span> : null}
        </div>
      </div>

      {saveError ? <Banner tone="error">{saveError}</Banner> : null}
      <form className="form-section" onSubmit={onSave} noValidate>
        {isMe ? <p className="hint" style={{ marginBottom: 16 }}>You can't change your own role or deactivate yourself.</p> : <RolePicker register={register} />}
        <TextField label="Full name" required maxLength={150} autoComplete="off" error={errors.fullName?.message} {...register("fullName")} />
        <div className="row-2">
          <TextField label="Mobile number" icon={Phone} type="tel" maxLength={16} placeholder="10-digit mobile" autoComplete="off" error={errors.mobile?.message} {...register("mobile")} />
          <TextField label="Email (optional)" icon={Mail} type="email" maxLength={120} autoComplete="off" error={errors.email?.message} {...register("email")} />
        </div>
        <TextField
          label="New password"
          icon={Lock}
          type="password"
          autoComplete="new-password"
          placeholder="Leave empty to keep the current one"
          hint="Their old password stops working. Share the new one securely."
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="form-footer">
          <Link to="/app/users" className="btn btn-secondary">Cancel</Link>
          <Button type="submit" loading={formState.isSubmitting} loadingText="Saving…" disabled={!!busy}>Save changes</Button>
        </div>
      </form>

      {isMe ? null : (
        <section className="form-section" aria-labelledby="acct-h">
          <h2 id="acct-h">Account</h2>
          <div className="form-footer" style={{ justifyContent: "flex-start", marginTop: 0 }}>
            {active ? (
              <Button variant="secondary" icon={Pause} loading={busy === "status"} disabled={!!busy} onClick={() => void setStatus("inactive")}>Deactivate user</Button>
            ) : (
              <Button variant="secondary" icon={Play} loading={busy === "status"} disabled={!!busy} onClick={() => void setStatus("active")}>Reactivate user</Button>
            )}
            <Button variant="danger" icon={Trash2} loading={busy === "delete"} disabled={!!busy || !user.can_delete} onClick={remove}>Delete user</Button>
          </div>
          {!user.can_delete ? <p className="hint" style={{ marginTop: 10 }}>Users who entered records can't be deleted, only deactivated, so every record keeps who entered it.</p> : null}
        </section>
      )}
      {dialog}
      {toast}
    </div>
  );
}
