import { useState, useEffect } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import { COPYRIGHT_TEXT, OWNER_NAME } from "@/const";
import {
  Wifi, Shield, QrCode, Smartphone, Lock,
  Zap, CreditCard, Clock, ChevronRight, Menu, X,
  Radio, Database, Bell, BarChart3, Users, Award
} from "lucide-react";

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const }
  })
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

// Navigation
function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "py-2" : "py-4"}`}>
      <div className="mx-auto max-w-7xl px-4">
        <div className={`neu-flat flex items-center justify-between px-6 py-3 transition-all duration-300 ${scrolled ? "bg-opacity-95 backdrop-blur-sm" : ""}`}>
          <Link to="/" className="flex items-center gap-3">
            <div className="gradient-accent p-2.5 rounded-xl">
              <Wifi className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">Sriyan</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-2">
            {["Features", "How It Works", "Security", "Pricing"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s/g, "-")}`}
                className="neu-btn px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary)]"
              >
                {item}
              </a>
            ))}
            <Link to="/dashboard" className="neu-btn-primary px-5 py-2.5 text-sm font-semibold ml-2">
              Dashboard
            </Link>
            <Link to="/connect" className="neu-btn px-5 py-2.5 text-sm font-semibold text-[var(--accent-primary)] ml-2">
              Connect WiFi
            </Link>
          </div>

          {/* Mobile toggle */}
          <button onClick={() => setIsOpen(!isOpen)} className="neu-btn p-2 md:hidden">
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="neu-flat mt-2 p-4 md:hidden"
          >
            {["Features", "How It Works", "Security", "Pricing"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s/g, "-")}`}
                onClick={() => setIsOpen(false)}
                className="block py-2 text-sm font-medium text-[var(--text-secondary)]"
              >
                {item}
              </a>
            ))}
            <Link to="/dashboard" className="block mt-2 neu-btn-primary px-5 py-2.5 text-sm font-semibold text-center">
              Dashboard
            </Link>
            <Link to="/connect" className="block mt-2 neu-btn px-5 py-2.5 text-sm font-semibold text-center text-[var(--accent-primary)]">
              Connect WiFi
            </Link>
          </motion.div>
        )}
      </div>
    </nav>
  );
}

// Hero Section
function HeroSection() {
  return (
    <section className="min-h-screen flex items-center pt-24 pb-12 px-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-[var(--accent-primary)] opacity-5 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-[var(--accent-secondary)] opacity-5 rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />
      </div>

      <div className="mx-auto max-w-7xl w-full grid lg:grid-cols-2 gap-12 items-center relative z-10">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.div variants={fadeInUp} custom={0} className="inline-flex items-center gap-2 neu-sm px-4 py-2 mb-6">
            <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-sm font-medium text-[var(--accent-primary)]">UPI Token WiFi Platform</span>
          </motion.div>

          <motion.h1 variants={fadeInUp} custom={1} className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Sriyan
            <span className="text-gradient block">WiFi Access</span>
            For Your Business
          </motion.h1>

          <motion.p variants={fadeInUp} custom={2} className="text-lg text-[var(--text-secondary)] mb-8 max-w-lg">
            Replace password sharing with locked UPI tokens. Merchants can use
            router WiFi or their own phone hotspot, and customers unlock access
            only after real payment confirmation.
          </motion.p>

          <motion.div variants={fadeInUp} custom={3} className="flex flex-wrap gap-4">
            <Link to="/dashboard" className="neu-btn-primary px-8 py-4 text-base font-semibold inline-flex items-center gap-2">
              Merchant Account
              <ChevronRight className="w-5 h-5" />
            </Link>
            <Link to="/connect" className="neu-btn px-8 py-4 text-base font-semibold inline-flex items-center gap-2 text-[var(--text-primary)]">
              <Wifi className="w-5 h-5" />
              Connect to WiFi
            </Link>
          </motion.div>

          <motion.div variants={fadeInUp} custom={4} className="flex gap-8 mt-10">
            {[
              { label: "Active Users", value: "10K+" },
              { label: "Businesses", value: "500+" },
              { label: "Countries", value: "15+" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl font-bold text-gradient">{stat.value}</div>
                <div className="text-sm text-[var(--text-secondary)]">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Hero visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="hidden lg:flex justify-center"
        >
          <div className="relative">
            {/* Main card */}
            <div className="neu-lg p-8 w-[420px] relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="gradient-accent p-2.5 rounded-xl">
                    <Wifi className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--text-primary)]">Tea Stall Corner</div>
                    <div className="text-xs text-[var(--text-secondary)]">WiFi Network</div>
                  </div>
                </div>
                <div className="neu-sm px-3 py-1">
                  <span className="text-xs font-medium text-[var(--accent-success)]">Active</span>
                </div>
              </div>

              {/* QR Code placeholder */}
              <div className="neu-pressed p-6 rounded-xl flex items-center justify-center mb-6">
                <QrCode className="w-32 h-32 text-[var(--accent-primary)]" />
              </div>

              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-[var(--text-secondary)]">Session Time</div>
                  <div className="text-xl font-bold text-[var(--text-primary)]">01:59:45</div>
                </div>
                <div className="neu-btn-primary px-4 py-2 text-sm">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Extend
                </div>
              </div>

              <div className="neu-inset p-3 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Speed</span>
                  <span className="font-medium">50 Mbps</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-[var(--text-secondary)]">Data Used</span>
                  <span className="font-medium">1.2 GB / 5 GB</span>
                </div>
              </div>
            </div>

            {/* Floating cards */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 3 }}
              className="neu-sm p-4 absolute -top-6 -left-6 z-20"
            >
              <Shield className="w-6 h-6 text-[var(--accent-success)]" />
              <div className="text-xs font-medium mt-1">Secure</div>
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ repeat: Infinity, duration: 3, delay: 1 }}
              className="neu-sm p-4 absolute -bottom-4 -right-6 z-20"
            >
              <Lock className="w-6 h-6 text-[var(--accent-primary)]" />
              <div className="text-xs font-medium mt-1">Encrypted</div>
            </motion.div>

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 3, delay: 0.5 }}
              className="neu-sm p-4 absolute top-1/2 -right-12 z-20"
            >
              <Database className="w-6 h-6 text-[var(--accent-warning)]" />
              <div className="text-xs font-medium mt-1">Ledger</div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// Features Section
function FeaturesSection() {
  const features = [
    {
      icon: QrCode,
      title: "QR Code Access",
      desc: "Generate unique QR codes for instant WiFi access. One scan, no passwords needed.",
      color: "text-[var(--accent-primary)]"
    },
    {
      icon: Smartphone,
      title: "OTP Authentication",
      desc: "Device-bound one-time passwords that cannot be shared or reused across devices.",
      color: "text-[var(--accent-success)]"
    },
    {
      icon: Shield,
      title: "Payment Security",
      desc: "Every ticket, payment, and hotspot session is recorded for merchant audit.",
      color: "text-[var(--accent-warning)]"
    },
    {
      icon: Clock,
      title: "Auto Expiry",
      desc: "Tickets automatically expire and disconnect users when time or data limits are reached.",
      color: "text-[var(--accent-danger)]"
    },
    {
      icon: CreditCard,
      title: "UPI Payments",
      desc: "UPI-compatible tokens for PhonePe, Google Pay, Paytm, BHIM, and gateway confirmation.",
      color: "text-[var(--accent-primary)]"
    },
    {
      icon: BarChart3,
      title: "Real-time Analytics",
      desc: "Track usage, revenue, peak hours, and customer behavior with detailed insights.",
      color: "text-[var(--accent-success)]"
    },
    {
      icon: Users,
      title: "Queue Management",
      desc: "Smart waiting queue with priority handling for busy networks.",
      color: "text-[var(--accent-warning)]"
    },
    {
      icon: Bell,
      title: "Smart Notifications",
      desc: "Push, SMS, WhatsApp, and email alerts for sessions, payments, and security.",
      color: "text-[var(--accent-danger)]"
    },
  ];

  return (
    <section id="features" className="py-20 px-4">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Everything You Need for <span className="text-gradient">Secure WiFi</span>
          </h2>
          <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
            A complete platform designed for Indian businesses — from tea shops to hotels,
            schools to railway stations.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeInUp}
              custom={i}
              className="neu-card p-6 group"
            >
              <div className={`neu-sm w-12 h-12 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <f.icon className={`w-6 h-6 ${f.color}`} />
              </div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-2">{f.title}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// How It Works Section
function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      title: "Merchant Generates Ticket",
      desc: "Merchant creates a locked QR or OTP with amount, duration, speed, and internet source.",
      icon: Radio
    },
    {
      num: "02",
      title: "Customer Pays Token",
      desc: "Customer scans from any UPI app or opens the Sriyan payment page from the hotspot.",
      icon: QrCode
    },
    {
      num: "03",
      title: "Gateway Verification",
      desc: "Sriyan waits for signed checkout or webhook confirmation before unlocking access.",
      icon: Database
    },
    {
      num: "04",
      title: "Secure WiFi Access",
      desc: "Customer gets instant, secure internet access with automatic expiry and disconnect.",
      icon: Wifi
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-4">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            How <span className="text-gradient">It Works</span>
          </h2>
          <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
            Four simple steps to payment-verified WiFi access
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="relative"
            >
              <div className="neu-flat p-6 h-full">
                <div className="text-5xl font-bold text-gradient opacity-30 mb-4">{step.num}</div>
                <div className="neu-sm w-12 h-12 flex items-center justify-center mb-4">
                  <step.icon className="w-6 h-6 text-[var(--accent-primary)]" />
                </div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--text-secondary)]">{step.desc}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-4 z-10">
                  <ChevronRight className="w-8 h-8 text-[var(--accent-primary)] opacity-50" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Security Section
function SecuritySection() {
  const features = [
    { icon: Lock, title: "AES-256 Encryption", desc: "Military-grade encryption for all data" },
    { icon: Shield, title: "Zero Trust Architecture", desc: "Never trust, always verify" },
    { icon: Database, title: "Audit Ledger", desc: "Signed payment and session trail" },
    { icon: Zap, title: "DDoS Protection", desc: "Advanced rate limiting and bot detection" },
    { icon: Users, title: "Device Fingerprinting", desc: "Unique device identification" },
    { icon: Award, title: "OWASP Compliant", desc: "Follows industry security standards" },
  ];

  return (
    <section id="security" className="py-20 px-4">
      <div className="mx-auto max-w-7xl">
        <div className="neu-lg p-8 sm:p-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Enterprise-Grade <span className="text-gradient">Security</span>
            </h2>
            <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
              Built with security-first architecture. Every connection is encrypted,
              verified, and logged in the audit ledger.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                variants={fadeInUp}
                custom={i}
                className="flex items-start gap-4 neu-sm p-4 hover:shadow-lg transition-shadow"
              >
                <div className="gradient-accent p-2.5 rounded-lg shrink-0">
                  <f.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-[var(--text-primary)]">{f.title}</h4>
                  <p className="text-sm text-[var(--text-secondary)]">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// Pricing Section
function PricingSection() {
  const plans = [
    {
      name: "Free",
      price: "0",
      period: "forever",
      features: ["50 tickets/month", "1 location", "Basic analytics", "Email support"],
      cta: "Start Free",
      popular: false
    },
    {
      name: "Basic",
      price: "499",
      period: "month",
      features: ["500 tickets/month", "3 locations", "Advanced analytics", "UPI payments", "Priority support"],
      cta: "Get Started",
      popular: true
    },
    {
      name: "Pro",
      price: "1,999",
      period: "month",
      features: ["Unlimited tickets", "10 locations", "Full analytics", "Queue management", "Audit ledger", "24/7 support"],
      cta: "Go Pro",
      popular: false
    },
  ];

  return (
    <section id="pricing" className="py-20 px-4">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Simple <span className="text-gradient">Pricing</span>
          </h2>
          <p className="text-[var(--text-secondary)] max-w-2xl mx-auto">
            Start free, upgrade as you grow. No hidden fees.
          </p>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto"
        >
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              variants={fadeInUp}
              custom={i}
              className={`neu-flat p-8 relative ${plan.popular ? "ring-2 ring-[var(--accent-primary)]" : ""}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="gradient-accent px-4 py-1 rounded-full text-xs font-semibold text-white">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-lg text-[var(--text-secondary)]">Rs.</span>
                  <span className="text-4xl font-bold text-gradient">{plan.price}</span>
                  <span className="text-sm text-[var(--text-secondary)]">/{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <Zap className="w-4 h-4 text-[var(--accent-success)] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/dashboard"
                className={`block text-center py-3 rounded-xl font-semibold transition-all ${
                  plan.popular
                    ? "neu-btn-primary"
                    : "neu-btn text-[var(--text-primary)]"
                }`}
              >
                {plan.cta}
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// Footer
function Footer() {
  return (
    <footer className="py-12 px-4 border-t border-[var(--shadow-dark)]">
      <div className="mx-auto max-w-7xl">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="gradient-accent p-2 rounded-lg">
                <Wifi className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-gradient">Sriyan</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              UPI token WiFi platform for merchants, users, router WiFi, and phone hotspots across India.
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-3">
              Founder CEO: {OWNER_NAME}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-[var(--text-primary)] mb-4">Product</h4>
            <ul className="space-y-2">
              {["Features", "Pricing", "Security", "API"].map((item) => (
                <li key={item}><a href="#" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)]">{item}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-[var(--text-primary)] mb-4">Company</h4>
            <ul className="space-y-2">
              {["About", "Blog", "Careers", "Contact"].map((item) => (
                <li key={item}><a href="#" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)]">{item}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-[var(--text-primary)] mb-4">Legal</h4>
            <ul className="space-y-2">
              {["Privacy", "Terms", "GDPR", "Compliance"].map((item) => (
                <li key={item}><a href="#" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)]">{item}</a></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-[var(--shadow-dark)] text-center text-sm text-[var(--text-secondary)]">
          <p>{COPYRIGHT_TEXT}</p>
        </div>
      </div>
    </footer>
  );
}

// Main Landing Page
export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-primary)" }}>
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <SecuritySection />
      <PricingSection />
      <Footer />
    </div>
  );
}
