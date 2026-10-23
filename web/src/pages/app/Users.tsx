import { Search, UserPlus, Users as UsersIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, Segmented, Skeleton, TextField, useConfirm, useToast } from "@/components/ui";
import { errorMessage, toApiError } from "@/lib/errors";
import { initials, ROLE_LABELS } from "@/lib/labels";
import type { ManagedUser } from "@/lib/types";
import { UserService } from "@/services/api";
import { useAuth } from "@/store/auth";

/** Admin-only: list accounts, activate / deactivate, add new ones; open a user to edit or delete. */
export default function Users() {
  const me = useAuth().profile?.id;
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roleFilter, setRoleFilter] = useState<"user" | "admin" | "all">("user");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();
  const { show, toast } = useToast();

  const load = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const res = await UserService.list({ role: roleFilter === "all" ? undefined : roleFilter, search: term.trim() || undefined });
      setUsers(res.data);
      setError(null);
    } catch (e) {
      setError({ message: errorMessage(e), offline: toApiError(e).isConnectivity });
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(search), 300);
    return () => clearTimeout(t);
  }, [load, search]);

  const toggleActive = async (u: ManagedUser) => {
    const next = u.status === "active" ? "inactive" : "active";
    if (next === "inactive") {
      const ok = await ask({ title: "Deactivate account?", message: `${u.full_name} will be signed out and can't sign in until reactivated. Their records stay.`, confirm: "Deactivate", danger: true });
      if (!ok) return;
    }
    setBusyId(u.id);
    try {
      const updated = await UserService.update({ user_id: u.id, status: next });
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
      show(next === "active" ? `${u.full_name} reactivated` : `${u.full_name} deactivated`);
    } catch (e) {
      show(`Couldn't update user: ${errorMessage(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p>The people who can sign in to the web and the mobile app.</p>
        </div>
        <Link to="/app/users/new" className="btn btn-primary"><UserPlus aria-hidden />Add user</Link>
      </div>

      <div className="list-toolbar">
        <TextField label="Search users" icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or mobile" autoComplete="off" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <Segmented
          label="Show"
          value={roleFilter}
          onChange={setRoleFilter}
          options={[{ value: "user", label: "Regular users" }, { value: "admin", label: "Admins" }, { value: "all", label: "All" }]}
        />
      </div>

      {loading && users.length === 0 ? (
        <Skeleton count={3} height={70} />
      ) : error ? (
        <ErrorState offline={error.offline} message={error.message} onRetry={() => void load(search)} />
      ) : users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users found" action={<Link to="/app/users/new" className="btn btn-primary btn-sm">Add user</Link>} />
      ) : (
        <ul className="ledger" style={loading ? { opacity: 0.6 } : undefined}>
          {users.map((u) => {
            const isMe = u.id === me;
            const active = u.status === "active";
            return (
              <li key={u.id} style={{ display: "flex", alignItems: "center" }}>
                <Link to={`/app/users/${u.id}`} className="user-row" style={{ flex: 1 }}>
                  <span className="avatar" aria-hidden>{initials(u.full_name)}</span>
                  <span>
                    <strong>{u.full_name}{isMe ? " (you)" : ""}</strong>
                    <span className="sub">{u.mobile ?? "No mobile number"}</span>
                  </span>
                  <span className="user-badges">
                    <span className={`badge ${u.role === "admin" ? "badge-green" : "badge-blue"}`}>{ROLE_LABELS[u.role] ?? u.role}</span>
                    <span className={`badge ${active ? "badge-green" : "badge-grey"}`}>{active ? "Active" : u.status === "pending" ? "Pending" : "Inactive"}</span>
                  </span>
                </Link>
                <label className="switch" style={{ marginRight: 18 }} title={isMe ? "You can't deactivate yourself" : active ? "Deactivate" : "Reactivate"}>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={active}
                    disabled={isMe || busyId === u.id}
                    onChange={() => void toggleActive(u)}
                    aria-label={`${u.full_name} active`}
                  />
                  <span />
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
      {toast}
    </>
  );
}
