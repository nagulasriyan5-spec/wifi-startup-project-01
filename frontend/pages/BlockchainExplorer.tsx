import { useState } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { trpc } from "@/providers/trpc";
import { COPYRIGHT_TEXT } from "@/const";
import {
  Database, Shield, Check, ChevronLeft,
  Clock, FileText, Lock, AlertTriangle, Wifi,
  CreditCard, Ticket, Users, RefreshCw
} from "lucide-react";

const ENTITY_ICONS: Record<string, any> = {
  ticket: Ticket,
  session: Wifi,
  payment: CreditCard,
  merchant: Users,
  user: Users,
};

const ENTITY_COLORS: Record<string, string> = {
  ticket: "text-[var(--accent-primary)]",
  session: "text-[var(--accent-success)]",
  payment: "text-[var(--accent-warning)]",
  merchant: "text-[var(--accent-danger)]",
  user: "text-[var(--text-secondary)]",
};

// Hash display with copy
function HashDisplay({ hash, length = 16 }: { hash: string; length?: number }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="font-mono text-xs text-[var(--accent-primary)] hover:underline"
      title={hash}
    >
      {copied ? "Copied!" : `${hash.slice(0, length)}...${hash.slice(-8)}`}
    </button>
  );
}

// Ledger entry card
function LedgerEntry({ entry, index }: { entry: any; index: number }) {
  const Icon = ENTITY_ICONS[entry.entityType] || FileText;
  const colorClass = ENTITY_COLORS[entry.entityType] || "text-[var(--text-secondary)]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="neu-flat p-5 hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`neu-sm w-10 h-10 flex items-center justify-center shrink-0 ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-[var(--text-primary)] capitalize">
              {entry.entityType}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              entry.action === "CREATED" || entry.action === "COMPLETED" || entry.action === "ACTIVATED"
                ? "text-[var(--accent-success)] bg-[var(--accent-success)]/10"
                : entry.action === "REVOKED" || entry.action === "FAILED"
                ? "text-[var(--accent-danger)] bg-[var(--accent-danger)]/10"
                : "text-[var(--accent-warning)] bg-[var(--accent-warning)]/10"
            }`}>
              {entry.action}
            </span>
          </div>

          <div className="text-xs text-[var(--text-secondary)] mb-2">
            <HashDisplay hash={entry.transactionHash} />
          </div>

          {entry.data && (
            <div className="neu-inset p-2 rounded-lg text-xs text-[var(--text-secondary)] mb-2">
              <pre className="overflow-x-auto">{JSON.stringify(entry.data, null, 2)}</pre>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(entry.createdAt).toLocaleString()}
            </span>
            <span>Block #{entry.blockNumber || "Pending"}</span>
            {entry.validatedBy && (
              <span className="flex items-center gap-1 text-[var(--accent-success)]">
                <Check className="w-3 h-3" />
                Validated
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Stats card
function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="neu-flat p-5 text-center">
      <div className={`neu-sm w-12 h-12 mx-auto mb-3 flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="text-2xl font-bold text-[var(--text-primary)]">{value.toLocaleString()}</div>
      <div className="text-sm text-[var(--text-secondary)] capitalize">{label}</div>
    </div>
  );
}

// Main Blockchain Explorer
export default function BlockchainExplorer() {
  const [filter, setFilter] = useState<string>("all");
  const [showVerify, setShowVerify] = useState(false);

  const { data: entries, isLoading, refetch } = trpc.blockchain.list.useQuery(
    { limit: 50, entityType: filter === "all" ? undefined : (filter as any) },
    { refetchInterval: 10000 }
  );

  const { data: stats } = trpc.blockchain.stats.useQuery();
  const { data: verifyResult } = trpc.blockchain.verify.useQuery(undefined, {
    enabled: showVerify,
  });

  const entityTypes = ["all", "ticket", "session", "payment", "merchant", "user"];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--bg-primary)]/90 backdrop-blur-sm border-b border-[var(--shadow-dark)]">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link to="/" className="neu-btn p-2.5">
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="gradient-accent p-2.5 rounded-xl">
                  <Database className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-[var(--text-primary)]">Blockchain Ledger</h1>
                  <p className="text-xs text-[var(--text-secondary)]">Immutable audit trail</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowVerify(!showVerify)}
                className="neu-btn px-4 py-2 text-sm flex items-center gap-2"
              >
                <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
                Verify Chain
              </button>
              <button
                onClick={() => refetch()}
                className="neu-btn p-2.5"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <Link to="/dashboard" className="neu-btn px-4 py-2 text-sm">
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            <StatCard label="Total Entries" value={stats.totalEntries} icon={Database} color="text-[var(--accent-primary)]" />
            {Object.entries(stats.byType).map(([type, count]) => (
              <StatCard
                key={type}
                label={`${type}s`}
                value={count as number}
                icon={ENTITY_ICONS[type] || FileText}
                color={ENTITY_COLORS[type] || "text-[var(--text-secondary)]"}
              />
            ))}
          </div>
        )}

        {/* Verification result */}
        {showVerify && verifyResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-6"
          >
            <div className={`neu-flat p-5 ${verifyResult.isValid ? "border-l-4 border-[var(--accent-success)]" : "border-l-4 border-[var(--accent-danger)]"}`}>
              <div className="flex items-center gap-3 mb-2">
                {verifyResult.isValid ? (
                  <Check className="w-6 h-6 text-[var(--accent-success)]" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-[var(--accent-danger)]" />
                )}
                <h3 className="font-semibold text-[var(--text-primary)]">
                  {verifyResult.isValid ? "Chain Integrity Verified" : "Chain Issues Detected"}
                </h3>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">
                Total entries: {verifyResult.totalEntries}. {" "}
                {verifyResult.isValid
                  ? "All blocks are properly linked and the chain is valid."
                  : `Issues found: ${verifyResult.issues.join(", ")}`}
              </p>
            </div>
          </motion.div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {entityTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`neu-btn px-4 py-2 text-sm capitalize ${
                filter === type ? "ring-2 ring-[var(--accent-primary)]" : ""
              }`}
            >
              {type === "all" ? "All Entries" : `${type}s`}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-6 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[var(--accent-success)]" /> Valid
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[var(--accent-primary)]" /> Ticket
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[var(--accent-warning)]" /> Payment
          </span>
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3" /> SHA-256 Encrypted
          </span>
        </div>

        {/* Entries list */}
        {isLoading ? (
          <div className="text-center py-16">
            <RefreshCw className="w-8 h-8 text-[var(--accent-primary)] animate-spin mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">Loading blockchain data...</p>
          </div>
        ) : entries && entries.length > 0 ? (
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <LedgerEntry key={entry.id} entry={entry} index={i} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 neu-flat">
            <Database className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">No ledger entries found</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Entries will appear as tickets, sessions, and payments are created.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--shadow-dark)] py-6">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            <Shield className="w-4 h-4 inline mr-1 text-[var(--accent-success)]" />
            All records are cryptographically signed and stored on the blockchain ledger.
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-2">
            {COPYRIGHT_TEXT}
          </p>
        </div>
      </footer>
    </div>
  );
}
