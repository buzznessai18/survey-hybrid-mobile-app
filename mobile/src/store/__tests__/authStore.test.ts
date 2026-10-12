import { AuthError, AuthService } from "@/services/auth/AuthService";
import { useAuthStore } from "../authStore";
import type { Profile } from "@/types/api";

jest.mock("@/services/supabase/client", () => ({ supabase: { auth: {} } }));
jest.mock("@/services/auth/AuthService", () => {
  const actual = jest.requireActual("@/services/auth/AuthService");
  return {
    ...actual,
    AuthService: {
      signIn: jest.fn(),
      signOut: jest.fn(async () => {}),
      getSession: jest.fn(),
      loadProfile: jest.fn(),
      assertCanUseApp: actual.AuthService.assertCanUseApp,
      onAuthStateChange: jest.fn(() => () => {}),
    },
  };
});

const profile: Profile = {
  id: "u1",
  full_name: "Rahul Sharma",
  mobile: "919876543210",
  role: "field_surveyor",
  status: "active",
  supervisor_id: null,
};
const session = { user: { id: "u1", user_metadata: {} } } as never;
const svc = AuthService as jest.Mocked<typeof AuthService>;

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: "initializing", session: null, profile: null, notice: null });
});

describe("authStore", () => {
  it("signs in and stores the database profile", async () => {
    svc.signIn.mockResolvedValue({ session, profile });
    await useAuthStore.getState().signIn({ portal: "user", method: "phone", identifier: "9876543210", password: "x" });
    expect(useAuthStore.getState().status).toBe("signedIn");
    expect(useAuthStore.getState().profile?.role).toBe("field_surveyor");
  });

  it("propagates invalid credentials without signing in", async () => {
    svc.signIn.mockRejectedValue(new AuthError("invalid_credentials", "bad"));
    await expect(useAuthStore.getState().signIn({ portal: "admin", method: "email", identifier: "a@b.co", password: "x" })).rejects.toThrow("bad");
    expect(useAuthStore.getState().status).toBe("initializing");
  });

  it("restores a session and signs out disabled accounts", async () => {
    svc.getSession.mockResolvedValue(session);
    svc.loadProfile.mockResolvedValue({ ...profile, status: "inactive" });
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(useAuthStore.getState().notice).toMatch(/disabled|not yet activated/);
    expect(svc.signOut).toHaveBeenCalled();
  });

  it("stays signed in offline with the cached profile", async () => {
    useAuthStore.setState({ profile });
    svc.getSession.mockResolvedValue(session);
    svc.loadProfile.mockRejectedValue(new AuthError("network", "offline"));
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe("signedIn");
    expect(useAuthStore.getState().profile?.full_name).toBe("Rahul Sharma");
  });

  it("company users and admins may use the app; other roles may not", () => {
    const admin = { ...profile, role: "admin" as const };
    expect(() => AuthService.assertCanUseApp({ ...profile, role: "user" })).not.toThrow();
    expect(() => AuthService.assertCanUseApp(admin)).not.toThrow();
    expect(() => AuthService.assertCanUseApp(profile)).not.toThrow(); // legacy field_surveyor = company user
    expect(() => AuthService.assertCanUseApp({ ...profile, role: "supervisor" })).toThrow();
    expect(() => AuthService.assertCanUseApp(profile, "admin")).toThrow(/not an admin/);
    expect(() => AuthService.assertCanUseApp({ ...profile, status: "inactive" })).toThrow(/disabled/);
  });

  it("no stored session -> sign-in screen (login is required)", async () => {
    svc.getSession.mockResolvedValue(null);
    await useAuthStore.getState().initialize();
    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(svc.loadProfile).not.toHaveBeenCalled();
  });

  it("logout signs out to the login screen", async () => {
    useAuthStore.setState({ status: "signedIn", session, profile: { ...profile, role: "admin" } });
    await useAuthStore.getState().signOut();
    expect(svc.signOut).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it("a forced sign-out (e.g. deactivated admin) shows the start screen instead", async () => {
    useAuthStore.setState({ status: "signedIn", session, profile: { ...profile, role: "admin" } });
    await useAuthStore.getState().signOut("Your account is no longer active.");
    expect(useAuthStore.getState().status).toBe("signedOut");
    expect(useAuthStore.getState().notice).toMatch(/no longer active/);
  });
});
