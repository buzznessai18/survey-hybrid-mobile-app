import { LogOut } from "lucide-react";
import { Button, useConfirm } from "@/components/ui";
import { initials, ROLE_LABELS } from "@/lib/labels";
import { useAuth } from "@/store/auth";

/** Read-only: roles, status and sign-in details are managed by administrators. */
export default function Profile() {
  const { profile, session, signOut } = useAuth();
  const { ask, dialog } = useConfirm();

  const logout = async () => {
    if (await ask({ title: "Sign out?", message: "You will need your password to sign in again.", confirm: "Sign out" })) void signOut();
  };

  return (
    <div className="form-page">
      <div className="profile-head">
        <span className="avatar avatar-lg" aria-hidden>{initials(profile?.full_name)}</span>
        <div>
          <h1>{profile?.full_name ?? "—"}</h1>
          <p className="hint">{profile ? ROLE_LABELS[profile.role] : ""}</p>
        </div>
      </div>
      <section className="panel">
        <h2>My profile</h2>
        <dl className="kv">
          <dt>Name</dt><dd>{profile?.full_name ?? "—"}</dd>
          <dt>Role</dt><dd>{profile ? ROLE_LABELS[profile.role] : "—"}</dd>
          <dt>Mobile</dt><dd>{profile?.mobile ?? "—"}</dd>
          <dt>Email</dt><dd>{session?.user.email || "—"}</dd>
          <dt>Status</dt><dd>{profile?.status === "active" ? "Active" : (profile?.status ?? "—")}</dd>
        </dl>
        <p className="hint" style={{ marginTop: 12 }}>Your role and account details are managed by your administrator.</p>
      </section>
      <div style={{ marginTop: 20 }}>
        <Button variant="danger" icon={LogOut} onClick={logout}>Sign out</Button>
      </div>
      {dialog}
    </div>
  );
}
