import { Link } from "react-router";
import { Wifi, Home, AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--bg-primary)" }}
    >
      <div className="text-center max-w-md">
        <div className="neu-lg w-24 h-24 mx-auto mb-6 flex items-center justify-center">
          <AlertTriangle className="w-12 h-12 text-[var(--accent-warning)]" />
        </div>

        <h1 className="text-6xl font-bold text-gradient mb-2">404</h1>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Page Not Found</h2>
        <p className="text-[var(--text-secondary)] mb-8">
          The page you are looking for does not exist or has been moved.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            to="/"
            className="neu-btn-primary px-8 py-3 font-semibold inline-flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Back to Home
          </Link>
          <Link
            to="/dashboard"
            className="neu-btn px-8 py-3 text-[var(--text-primary)] inline-flex items-center justify-center gap-2"
          >
            <Wifi className="w-5 h-5" />
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
