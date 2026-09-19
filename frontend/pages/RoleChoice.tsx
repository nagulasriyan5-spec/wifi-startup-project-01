import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  Building2,
  Loader2,
  QrCode,
  Smartphone,
  Store,
  UserRound,
  Wifi,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function RoleChoice() {
  const navigate = useNavigate();
  const { isLoading, user } = useAuth({ redirectOnUnauthenticated: true });

  const chooseRole = (role: "user" | "merchant") => {
    window.localStorage.setItem("sriyan-role-choice", role);
    navigate(role === "merchant" ? "/dashboard" : "/connect");
  };

  if (isLoading) {
    return (
      <main className="role-choice-shell">
        <div className="role-choice-loader">
          <Loader2 className="h-6 w-6 role-choice-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="role-choice-shell">
      <div className="role-choice-light" aria-hidden="true" />
      <section className="role-choice-panel">
        <Link to="/" className="role-choice-brand" aria-label="SRIYAN home">
          <span>
            <Wifi className="h-4 w-4" />
          </span>
          SRIYAN
        </Link>

        <div className="role-choice-heading">
          <p>{user?.email || user?.name || "Signed in"}</p>
          <h1>Continue as</h1>
        </div>

        <div className="role-choice-grid">
          <button
            type="button"
            className="role-picture-button role-picture-user"
            onClick={() => chooseRole("user")}
          >
            <span className="role-picture-visual" aria-hidden="true">
              <span className="role-phone">
                <Smartphone className="h-9 w-9" />
              </span>
              <span className="role-qr">
                <QrCode className="h-8 w-8" />
              </span>
            </span>
            <span className="role-picture-content">
              <span className="role-icon">
                <UserRound className="h-5 w-5" />
              </span>
              <strong>User</strong>
              <small>Open WiFi access, scan tickets, and connect.</small>
            </span>
            <ArrowRight className="role-arrow h-5 w-5" />
          </button>

          <button
            type="button"
            className="role-picture-button role-picture-merchant"
            onClick={() => chooseRole("merchant")}
          >
            <span className="role-picture-visual" aria-hidden="true">
              <span className="role-counter">
                <Store className="h-9 w-9" />
              </span>
              <span className="role-router">
                <Building2 className="h-8 w-8" />
              </span>
            </span>
            <span className="role-picture-content">
              <span className="role-icon">
                <Store className="h-5 w-5" />
              </span>
              <strong>Merchant</strong>
              <small>Open payments, tickets, sessions, and analytics.</small>
            </span>
            <ArrowRight className="role-arrow h-5 w-5" />
          </button>
        </div>
      </section>
    </main>
  );
}
