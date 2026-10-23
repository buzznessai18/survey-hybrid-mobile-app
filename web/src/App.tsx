import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { LeafLogo } from "@/components/Brand";
import { env } from "@/config/env";
import Audit from "@/pages/app/Audit";
import Home from "@/pages/app/Home";
import NewRecord from "@/pages/app/NewRecord";
import Profile from "@/pages/app/Profile";
import RecordDetail from "@/pages/app/RecordDetail";
import Records from "@/pages/app/Records";
import Reports from "@/pages/app/Reports";
import { EditUser, NewUser } from "@/pages/app/UserForm";
import Users from "@/pages/app/Users";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import { AuthProvider, useAuth, useCanEditRecords, useIsAdmin } from "@/store/auth";

function Splash() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--field)" }} aria-busy="true" aria-label="Loading">
      <LeafLogo size={56} />
    </div>
  );
}

/** Signed-in pages. Roles are enforced again by RLS and the Edge Functions. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "initializing") return <Splash />;
  if (status !== "signedIn") return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  return useIsAdmin() ? children : <Navigate to="/app" replace />;
}

function RequireEditor({ children }: { children: ReactNode }) {
  return useCanEditRecords() ? children : <Navigate to="/app/records" replace />;
}

function ConfigMissing() {
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: "0 16px" }}>
      <h1 className="wide" style={{ fontSize: 32 }}>Supabase isn't configured</h1>
      <p style={{ marginTop: 12 }}>
        Copy <code>web/.env.example</code> to <code>web/.env</code> and set <code>VITE_SUPABASE_URL</code> and{" "}
        <code>VITE_SUPABASE_ANON_KEY</code> to the same project the mobile app uses, then restart the dev server.
      </p>
    </main>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/login", element: <Login /> },
  {
    path: "/app",
    element: <RequireAuth><AppShell /></RequireAuth>,
    children: [
      { index: true, element: <Home /> },
      { path: "records", element: <Records /> },
      { path: "records/new", element: <RequireEditor><NewRecord /></RequireEditor> },
      { path: "records/:id", element: <RecordDetail /> },
      { path: "profile", element: <Profile /> },
      { path: "reports", element: <RequireAdmin><Reports /></RequireAdmin> },
      { path: "users", element: <RequireAdmin><Users /></RequireAdmin> },
      { path: "users/new", element: <RequireAdmin><NewUser /></RequireAdmin> },
      { path: "users/:id", element: <RequireAdmin><EditUser /></RequireAdmin> },
      { path: "audit", element: <RequireAdmin><Audit /></RequireAdmin> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export default function App() {
  if (!env.isConfigured) return <ConfigMissing />;
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
