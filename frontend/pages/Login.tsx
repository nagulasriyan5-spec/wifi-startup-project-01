import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  Apple,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Wifi,
} from "lucide-react";
import { COPYRIGHT_TEXT } from "@/const";

type LoginMode = "signin" | "signup" | "forgot" | "reset";
type OAuthProvider = "google" | "apple";

type AuthApiResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  redirectTo?: string;
  resetToken?: string;
  resetUrl?: string;
};

type Feedback = {
  type: "error" | "success" | "info";
  message: string;
} | null;

const apiBaseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

function getProviderUrl(
  provider: OAuthProvider,
  email: string,
  remember: boolean
) {
  const url = new URL(apiUrl("/api/oauth/authorize"), window.location.origin);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", "/choose-role");
  if (email.trim()) url.searchParams.set("login_hint", email.trim());
  if (remember) url.searchParams.set("remember", "1");
  return url.toString();
}

async function postAuth(path: string, body: unknown) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as AuthApiResponse;
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || "Authentication failed.");
  }
  return data;
}

export default function Login() {
  const [mode, setMode] = useState<LoginMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const savedRemember =
      window.localStorage.getItem("sriyan-login-remember") === "true";
    const savedEmail = window.localStorage.getItem("sriyan-login-email") ?? "";
    const requestedMode = params.get("mode");
    const authError = params.get("auth_error");
    const token = params.get("token");
    const emailParam = params.get("email");

    setRemember(savedRemember);
    if (emailParam) setEmail(emailParam);
    else if (savedRemember) setEmail(savedEmail);
    if (requestedMode === "reset") {
      setMode("reset");
      if (token) setResetToken(token);
    }
    if (authError) {
      setFeedback({ type: "error", message: authError });
    }
    if (requestedMode || authError || token || emailParam) {
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const persistRemember = (nextRemember: boolean, nextEmail = email) => {
    window.localStorage.setItem("sriyan-login-remember", String(nextRemember));
    if (nextRemember && nextEmail.trim()) {
      window.localStorage.setItem("sriyan-login-email", nextEmail.trim());
    } else if (!nextRemember) {
      window.localStorage.removeItem("sriyan-login-email");
    }
  };

  const copy = useMemo(() => {
    switch (mode) {
      case "signup":
        return {
          title: "Create account",
          subtitle: "Start managing secure QR WiFi access with SRIYAN.",
          primary: "Create account",
        };
      case "forgot":
        return {
          title: "Reset password",
          subtitle: "Enter your email and we will prepare a secure reset link.",
          primary: "Send reset link",
        };
      case "reset":
        return {
          title: "Set new password",
          subtitle: "Use your reset token to secure your SRIYAN account.",
          primary: "Update password",
        };
      default:
        return {
          title: "Welcome back",
          subtitle: "Sign in to continue to SRIYAN.",
          primary: "Sign In",
        };
    }
  }, [mode]);

  const switchMode = (nextMode: LoginMode) => {
    setMode(nextMode);
    setFeedback(null);
    setPassword("");
    setShowPassword(false);
  };

  const finishAuth = (data: AuthApiResponse) => {
    persistRemember(remember);
    window.location.href = data.redirectTo || "/choose-role";
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (mode === "signup") {
        finishAuth(
          await postAuth("/api/auth/signup", { email, password, remember })
        );
        return;
      }

      if (mode === "forgot") {
        const data = await postAuth("/api/auth/password-reset/request", {
          email,
        });
        setFeedback({
          type: data.resetToken ? "info" : "success",
          message: data.message || "Password reset request created.",
        });
        if (data.resetToken) {
          setResetToken(data.resetToken);
          setPassword("");
          setMode("reset");
        }
        return;
      }

      if (mode === "reset") {
        finishAuth(
          await postAuth("/api/auth/password-reset/complete", {
            token: resetToken,
            password,
            remember,
          })
        );
        return;
      }

      finishAuth(
        await postAuth("/api/auth/login", { email, password, remember })
      );
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to complete authentication.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProviderSignIn = (provider: OAuthProvider) => {
    persistRemember(remember);
    window.location.href = getProviderUrl(provider, email, remember);
  };

  return (
    <main className="login-shell">
      <div className="login-grid" aria-hidden="true" />
      <div className="login-aurora" aria-hidden="true" />
      <div className="login-starfield" aria-hidden="true" />
      <div className="login-moon" aria-hidden="true" />
      <div className="login-horizon" aria-hidden="true" />

      <section className="login-frame">
        <div className="login-card login-auth-card">
          <div className="login-card-glow" aria-hidden="true" />

          <Link to="/" className="login-brand" aria-label="SRIYAN home">
            <span className="login-brand-mark">
              <Wifi className="h-4 w-4" />
            </span>
            <span>SRIYAN</span>
          </Link>

          <div className="mt-6 mb-6">
            <h1 className="text-3xl font-bold leading-tight text-white">
              {copy.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {copy.subtitle}
            </p>
          </div>

          {feedback && (
            <div
              className={`login-feedback login-feedback-${feedback.type}`}
              role={feedback.type === "error" ? "alert" : "status"}
            >
              {feedback.type === "error" ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode !== "reset" && (
              <label className="login-field">
                <span className="sr-only">Email</span>
                <span className="login-field-control">
                  <Mail className="h-4 w-4" />
                  <input
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="Email"
                    required
                  />
                </span>
              </label>
            )}

            {mode === "reset" && (
              <label className="login-field">
                <span className="sr-only">Reset token</span>
                <span className="login-field-control">
                  <ShieldCheck className="h-4 w-4" />
                  <input
                    type="text"
                    value={resetToken}
                    onChange={event => setResetToken(event.target.value)}
                    autoComplete="one-time-code"
                    placeholder="Reset token"
                    required
                  />
                </span>
              </label>
            )}

            {mode !== "forgot" && (
              <label className="login-field">
                <span className="sr-only">Password</span>
                <span className="login-field-control">
                  <LockKeyhole className="h-4 w-4" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    placeholder={mode === "reset" ? "New password" : "Password"}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="login-eye-button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword(value => !value)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </span>
              </label>
            )}

            {mode !== "forgot" && (
              <div className="login-options-row">
                <label className="login-remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={event => {
                      setRemember(event.target.checked);
                      persistRemember(event.target.checked);
                    }}
                  />
                  <span>Remember me</span>
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="login-small-link"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            )}

            <button
              type="submit"
              className="login-primary"
              disabled={isSubmitting}
            >
              <span>{copy.primary}</span>
              <span className="login-primary-icons">
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 login-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                <Smartphone className="h-4 w-4" />
              </span>
            </button>
          </form>

          <div className="login-divider">
            <span />
            <p>or continue with</p>
            <span />
          </div>

          <div className="login-social-grid">
            <button
              type="button"
              onClick={() => handleProviderSignIn("google")}
              className="login-social-button"
            >
              <span className="login-google-mark">G</span>
              <span>Google</span>
            </button>
            <button
              type="button"
              onClick={() => handleProviderSignIn("apple")}
              className="login-social-button"
            >
              <Apple className="h-4 w-4" />
              <span>Apple</span>
            </button>
          </div>

          <div className="login-create-row">
            {mode === "signin" ? (
              <>
                <span>New to SRIYAN?</span>
                <button type="button" onClick={() => switchMode("signup")}>
                  <UserPlus className="h-3.5 w-3.5" />
                  Create account
                </button>
              </>
            ) : (
              <>
                <span>Already have access?</span>
                <button type="button" onClick={() => switchMode("signin")}>
                  <LogIn className="h-3.5 w-3.5" />
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="login-footer-row">
            <Link to="/">Back to home</Link>
            <span>{COPYRIGHT_TEXT}</span>
          </div>
        </div>
      </section>
    </main>
  );
}
