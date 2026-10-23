import { FilePlus2, History, Home, LogOut, ReceiptText, Sheet, UserRound, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ROLE_LABELS, initials } from "@/lib/labels";
import { useAuth, useCanEditRecords, useIsAdmin } from "@/store/auth";
import { Wordmark } from "./Brand";
import { Banner, useConfirm } from "./ui";
import "./app.css";

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Signed-in layout: sidebar navigation (a top bar on narrow screens) and the page. */
export function AppShell() {
  const { profile, signOut } = useAuth();
  const isAdmin = useIsAdmin();
  const canEdit = useCanEditRecords();
  const online = useOnline();
  const { ask, dialog } = useConfirm();

  const logout = async () => {
    if (await ask({ title: "Sign out?", message: "You will need your password to sign in again.", confirm: "Sign out" })) void signOut();
  };

  const link = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? " active" : ""}`;

  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className="sidebar">
        <div className="sidebar-brand"><Wordmark to="/app" light /></div>
        <nav aria-label="App" className="nav">
          <NavLink to="/app" end className={link}><Home aria-hidden />Home</NavLink>
          <NavLink to="/app/records" end className={link}><ReceiptText aria-hidden />Records</NavLink>
          {canEdit ? <NavLink to="/app/records/new" className={link}><FilePlus2 aria-hidden />Add record</NavLink> : null}
          {isAdmin ? (
            <>
              <span className="nav-group">Administration</span>
              <NavLink to="/app/reports" className={link}><Sheet aria-hidden />Reports</NavLink>
              <NavLink to="/app/users" className={link}><Users aria-hidden />Users</NavLink>
              <NavLink to="/app/audit" className={link}><History aria-hidden />Audit history</NavLink>
            </>
          ) : null}
        </nav>
        <div className="sidebar-foot">
          <NavLink to="/app/profile" className={({ isActive }) => `me${isActive ? " active" : ""}`}>
            <span className="avatar" aria-hidden>{initials(profile?.full_name)}</span>
            <span className="me-text">
              <strong>{profile?.full_name ?? "—"}</strong>
              <span>{profile ? ROLE_LABELS[profile.role] : ""}</span>
            </span>
            <UserRound aria-hidden className="me-icon" />
          </NavLink>
          <button type="button" className="nav-link nav-button" onClick={logout}><LogOut aria-hidden />Sign out</button>
        </div>
      </aside>
      <main id="main" className="main">
        {!online ? <Banner tone="warning">You're offline. Records are saved to the server, so reconnect before saving or searching.</Banner> : null}
        <Outlet />
      </main>
      {dialog}
    </div>
  );
}
