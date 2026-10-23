import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, Mail, Phone } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation } from "react-router-dom";
import { Wordmark } from "@/components/Brand";
import { Banner, Button, Segmented, TextField } from "@/components/ui";
import { loginSchema, type LoginValues } from "@/lib/validation";
import { AuthError } from "@/services/auth";
import { useAuth } from "@/store/auth";
import "./landing.css";

type Method = LoginValues["method"];

export default function Login() {
  const { status, signIn, notice, clearNotice } = useAuth();
  const location = useLocation();
  const [method, setMethod] = useState<Method>("phone");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, formState, setValue, clearErrors } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { method: "phone", identifier: "", password: "" },
  });

  if (status === "signedIn") {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith("/app") ? from : "/app"} replace />;
  }

  const selectMethod = (m: Method, keepMessage = false) => {
    setMethod(m);
    setValue("method", m);
    setValue("identifier", "");
    clearErrors();
    if (!keepMessage) setFormError(null);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    clearNotice();
    if (!navigator.onLine) return setFormError("No internet connection. Connect to the internet to sign in.");
    try {
      await signIn(values);
    } catch (e) {
      setFormError(e instanceof AuthError ? e.message : "We couldn't sign you in. Please try again.");
      if (e instanceof AuthError && e.kind === "phone_login_disabled") selectMethod("email", true);
    }
  });

  const message = formError ?? notice;
  const errors = formState.errors;

  return (
    <div className="login">
      <aside className="login-side">
        <Wordmark light />
        <p className="login-side-text wide">Record the work. Print the receipt.</p>
      </aside>
      <main className="login-main">
        <form className="login-card" onSubmit={onSubmit} noValidate>
          <h1>Sign in</h1>
          <p className="login-sub">For company staff and administrators. Use the same details as the mobile app.</p>

          <Segmented
            label="Sign in with"
            value={method}
            onChange={(m) => selectMethod(m)}
            options={[{ value: "phone", label: "Mobile number" }, { value: "email", label: "Email" }]}
          />

          <div style={{ height: 18 }} />
          <input type="hidden" {...register("method")} />
          <TextField
            key={method}
            label={method === "phone" ? "Mobile number" : "Email"}
            icon={method === "phone" ? Phone : Mail}
            type={method === "phone" ? "tel" : "email"}
            inputMode={method === "phone" ? "tel" : "email"}
            autoComplete={method === "phone" ? "tel" : "username"}
            placeholder={method === "phone" ? "10-digit mobile number" : "name@example.com"}
            maxLength={method === "phone" ? 16 : 120}
            autoFocus
            error={errors.identifier?.message}
            {...register("identifier")}
          />
          <TextField
            label="Password"
            icon={Lock}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter password"
            error={errors.password?.message}
            action={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </button>
            }
            {...register("password")}
          />

          {message ? <Banner tone="error">{message}</Banner> : null}

          <Button type="submit" block loading={formState.isSubmitting} loadingText="Signing in…">Sign in</Button>
          <p className="hint" style={{ marginTop: 16 }}>
            Accounts are created by your administrator. Forgot your password? Ask an admin to reset it.
          </p>
        </form>
      </main>
    </div>
  );
}
