"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { WaitlistForm } from "./waitlist-form";

// ─── Scroll-reveal hook ───────────────────────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).style.opacity = "1";
            (e.target as HTMLElement).style.transform = "translateY(0) scale(1)";
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);
}

// ─── Counter animation hook ────────────────────────────────────────────────────
function AnimatedCount({ target, suffix = "", prefix = "" }: { target: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const duration = 1800;
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const ease = 1 - Math.pow(1 - t, 3);
          setCount(Math.round(ease * target));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);

  return <span ref={ref}>{prefix}{count}{suffix}</span>;
}

// ─── Typing animation ─────────────────────────────────────────────────────────
function useTyping(lines: string[], speed = 28) {
  const [displayed, setDisplayed] = useState<string[]>([]);
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started.current) return;
    if (lineIdx >= lines.length) return;
    const line = lines[lineIdx];
    if (charIdx <= line.length) {
      const t = setTimeout(() => {
        setDisplayed((prev) => {
          const next = [...prev];
          next[lineIdx] = line.slice(0, charIdx);
          return next;
        });
        setCharIdx((c) => c + 1);
      }, speed);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setLineIdx((l) => l + 1);
        setCharIdx(0);
      }, 60);
      return () => clearTimeout(t);
    }
  }, [lineIdx, charIdx, lines, speed]);

  return { displayed, ref };
}

// ─── Mouse spotlight ──────────────────────────────────────────────────────────
function MouseSpotlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (ref.current) {
        ref.current.style.left = e.clientX + "px";
        ref.current.style.top = e.clientY + "px";
      }
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed z-0"
      style={{
        width: "600px",
        height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)",
        transform: "translate(-50%, -50%)",
        transition: "left 0.12s ease-out, top 0.12s ease-out",
      }}
    />
  );
}

// ─── Floating orb ─────────────────────────────────────────────────────────────
function Orbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      <div style={{
        position: "absolute", width: "800px", height: "800px",
        borderRadius: "50%", top: "-200px", left: "-200px",
        background: "radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 65%)",
        animation: "orbFloat1 18s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", width: "600px", height: "600px",
        borderRadius: "50%", top: "30%", right: "-150px",
        background: "radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 65%)",
        animation: "orbFloat2 22s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", width: "500px", height: "500px",
        borderRadius: "50%", bottom: "-100px", left: "30%",
        background: "radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 65%)",
        animation: "orbFloat3 26s ease-in-out infinite",
      }} />
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────
function AnimatedGrid() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
        `,
        backgroundSize: "64px 64px",
        maskImage: "radial-gradient(ellipse 80% 80% at 50% 10%, black 20%, transparent 100%)",
        animation: "gridDrift 40s linear infinite",
      }}
    />
  );
}

// ─── Beam ─────────────────────────────────────────────────────────────────────
function Beam() {
  return (
    <div
      className="pointer-events-none fixed top-0 left-1/2 -translate-x-1/2 z-0"
      style={{
        width: "2px",
        height: "60vh",
        background: "linear-gradient(180deg, transparent, rgba(99,102,241,0.6), transparent)",
        animation: "beamFade 4s ease-in-out infinite",
      }}
    />
  );
}

// ─── Reveal wrapper ───────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div
      data-reveal
      className={className}
      style={{
        opacity: 0,
        transform: "translateY(28px) scale(0.98)",
        transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Feature card with tilt ───────────────────────────────────────────────────
function FeatureCard({ icon, color, title, desc }: { icon: string; color: string; title: string; desc: string }) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(600px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateZ(4px)`;
    el.style.boxShadow = `${-x * 12}px ${-y * 12}px 40px rgba(99,102,241,0.12), 0 0 0 1px rgba(99,102,241,0.18)`;
  };

  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
    el.style.boxShadow = "";
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{
        background: "#0a0a0a",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "14px",
        padding: "1.5rem",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        willChange: "transform",
        cursor: "default",
      }}
    >
      <div
        style={{
          width: "42px", height: "42px",
          borderRadius: "10px",
          background: color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "1.2rem", marginBottom: "1rem",
          animation: "iconFloat 3s ease-in-out infinite",
        }}
      >
        {icon}
      </div>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.4rem", color: "#fff" }}>{title}</div>
      <div style={{ fontSize: "0.82rem", color: "#5a5a7a", lineHeight: 1.65 }}>{desc}</div>
    </div>
  );
}

// ─── Code pane lines ─────────────────────────────────────────────────────────
const LEGACY_LINES = [
  { t: "cmt", v: "* Nested SELECT — removed in S/4HANA" },
  { t: "kw",  v: "SELECT" },          { t: "tx", v: " kunnr name1" },
  { t: "kw",  v: "  INTO" },          { t: "tx", v: " (lv_kunnr, lv_name1)" },
  { t: "kw",  v: "  FROM" },          { t: "ty", v: " kna1" },
  { t: "kw",  v: "  WHERE" },         { t: "tx", v: " kunnr IN s_kunnr." },
  { t: "sp",  v: "" },
  { t: "kw",  v: "  SELECT SINGLE" }, { t: "tx", v: " dmbtr waers" },
  { t: "kw",  v: "    FROM" },        { t: "er", v: " bsid" }, { t: "cmt", v: "  ← BLOCKED in S/4" },
  { t: "kw",  v: "    WHERE" },       { t: "tx", v: " kunnr = lv_kunnr." },
  { t: "sp",  v: "" },
  { t: "kw",  v: "  CONCATENATE" },   { t: "tx", v: " lv_name1 " }, { t: "st", v: "' | '" }, { t: "tx", v: " lv_amt" },
  { t: "kw",  v: "    INTO" },        { t: "tx", v: " lv_display." }, { t: "cmt", v: " ← obsolete" },
  { t: "sp",  v: "" },
  { t: "er",  v: "ENDSELECT" },       { t: "tx", v: "." }, { t: "cmt", v: "              ← removed in S/4" },
];

const MODERN_LINES = [
  { t: "cmt", v: '" Modern: JOIN + CDS view — S/4HANA 2023' },
  { t: "kw",  v: "SELECT" },   { t: "tx", v: " k~kunnr, k~name1," },
  { t: "tx",  v: "       a~dmbtr, a~waers" },
  { t: "kw",  v: "  FROM" },   { t: "ty", v: " kna1" }, { t: "kw", v: " AS" }, { t: "tx", v: " k" },
  { t: "kw",  v: "  INNER JOIN" }, { t: "ok", v: " i_customerbalance" }, { t: "kw", v: " AS" }, { t: "tx", v: " a" },
  { t: "kw",  v: "    ON" },    { t: "tx", v: " a~kunnr = k~kunnr" },
  { t: "kw",  v: "  WHERE" },  { t: "tx", v: " k~kunnr IN @s_kunnr" },
  { t: "kw",  v: "  INTO TABLE" }, { t: "tx", v: " @" }, { t: "kw", v: "DATA" }, { t: "tx", v: "(lt_result)." },
  { t: "sp",  v: "" },
  { t: "kw",  v: "LOOP AT" },  { t: "tx", v: " lt_result " }, { t: "kw", v: "INTO DATA" }, { t: "tx", v: "(ls)." },
  { t: "kw",  v: "  DATA" },   { t: "tx", v: "(lv_display) = " },
  { t: "st",  v: "  `|{ ls-name1 } | { ls-dmbtr }|`" }, { t: "tx", v: "." },
  { t: "kw",  v: "ENDLOOP" },  { t: "tx", v: "." },
];

function codeLine(parts: typeof LEGACY_LINES) {
  return parts.map((p, i) => {
    const color =
      p.t === "kw"  ? "#c792ea" :
      p.t === "cmt" ? "#444466" :
      p.t === "ty"  ? "#ffcb6b" :
      p.t === "st"  ? "#c3e88d" :
      p.t === "er"  ? "#ff5572" :
      p.t === "ok"  ? "#80cbc4" :
      p.t === "sp"  ? "transparent" :
                       "#c8c8e8";
    return <span key={i} style={{ color }}>{p.v}</span>;
  });
}

// ─── Step card ────────────────────────────────────────────────────────────────
const STEPS = [
  { num: "01", icon: "📂", title: "Upload ABAP", desc: "Drag & drop .abap files. abapGit naming auto-detected." },
  { num: "02", icon: "🔍", title: "Static scan", desc: "Every table access, BAPI, exit, and obsolete pattern flagged." },
  { num: "03", icon: "🤖", title: "AI conversion", desc: "Claude converts to ABAP 7.5+ with confidence score and breaking changes." },
  { num: "04", icon: "👁️", title: "Human review", desc: "Side-by-side diff. Approve, reject, or edit inline." },
  { num: "05", icon: "📦", title: "Export ZIP", desc: "abapGit-compatible structure. Drop straight into transport." },
];

const FEATURES = [
  { icon: "🧠", color: "rgba(99,102,241,0.18)",  title: "Claude-powered conversion", desc: "Tailored system prompt with S/4HANA table renames, ABAP 7.5+ rules, and ECC anti-patterns. 90% cheaper on cache hits." },
  { icon: "📊", color: "rgba(34,197,94,0.14)",   title: "Confidence scoring",        desc: "1–10 score per object. Enhancement spots and user exits auto-flagged. High-confidence objects bulk-approvable." },
  { icon: "⚡", color: "rgba(59,130,246,0.14)",  title: "Real-time progress",        desc: "BullMQ + Redis pub/sub → SSE. Watch objects move PENDING → CONVERTING → CONVERTED live in the UI." },
  { icon: "🔎", color: "rgba(239,68,68,0.12)",   title: "Breaking change detection", desc: "BSEG/BSID/MKPF/KONV renames, ENDSELECT/CONCATENATE obsolete syntax, Dynpro patterns, user exit → BADI flags." },
  { icon: "🏢", color: "rgba(234,179,8,0.12)",   title: "Multi-org team roles",      desc: "Orgs, projects, Admin/Reviewer/Viewer access, full audit log. Every action tracked with user, timestamp, metadata." },
  { icon: "📦", color: "rgba(99,102,241,0.14)",  title: "abapGit-ready export",      desc: "ZIP with abapGit naming + MANIFEST.txt with confidence scores. JSON export also available." },
];

const PRICING = [
  {
    plan: "Assessment", price: "Free", sub: null,
    desc: "Scan and get complexity estimates.",
    items: [
      { ok: true,  t: "Up to 25 objects converted" },
      { ok: true,  t: "Static ABAP analysis report" },
      { ok: true,  t: "Confidence score preview" },
      { ok: false, t: "Human review workflow" },
      { ok: false, t: "ZIP export" },
      { ok: false, t: "Team access" },
    ],
    cta: "Join Waitlist", href: "#waitlist", hot: false,
  },
  {
    plan: "Migration", price: "$0.08", sub: "/ object",
    desc: "Full pipeline: convert, review, export.",
    items: [
      { ok: true, t: "Unlimited objects" },
      { ok: true, t: "AI conversion + scores" },
      { ok: true, t: "Full review workflow" },
      { ok: true, t: "ZIP + JSON export" },
      { ok: true, t: "5 team seats" },
      { ok: true, t: "Audit logs" },
    ],
    cta: "Get Early Access", href: "#waitlist", hot: true,
  },
  {
    plan: "Enterprise", price: "Custom", sub: null,
    desc: "Large landscapes, SLAs, direct connect.",
    items: [
      { ok: true, t: "Volume pricing" },
      { ok: true, t: "SAP direct connect" },
      { ok: true, t: "SSO + custom roles" },
      { ok: true, t: "Unlimited seats" },
      { ok: true, t: "Dedicated engineer" },
      { ok: true, t: "SLA guarantee" },
    ],
    cta: "Contact Sales", href: "mailto:hello@kruxai.com", hot: false,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export function LandingClient() {
  const [scrolled, setScrolled] = useState(false);

  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* ── Global styles ───────────────────────────────────────────────── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }

        @keyframes orbFloat1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33%     { transform: translate(60px,40px) scale(1.05); }
          66%     { transform: translate(-40px,60px) scale(0.97); }
        }
        @keyframes orbFloat2 {
          0%,100% { transform: translate(0,0) scale(1); }
          40%     { transform: translate(-70px,-50px) scale(1.06); }
          70%     { transform: translate(50px,-30px) scale(0.95); }
        }
        @keyframes orbFloat3 {
          0%,100% { transform: translate(0,0); }
          50%     { transform: translate(-50px,40px); }
        }
        @keyframes gridDrift {
          0%   { background-position: 0 0; }
          100% { background-position: 64px 64px; }
        }
        @keyframes beamFade {
          0%,100% { opacity: 0; transform: translateX(-50%) scaleY(0.3); }
          50%     { opacity: 1; transform: translateX(-50%) scaleY(1); }
        }
        @keyframes badgePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
          50%     { box-shadow: 0 0 0 8px rgba(99,102,241,0); }
        }
        @keyframes dotPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:0.3; transform:scale(1.6); }
        }
        @keyframes gradShift {
          0%,100% { background-position: 0% 50%; }
          50%     { background-position: 100% 50%; }
        }
        @keyframes iconFloat {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-5px); }
        }
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes scanline {
          0%   { top: -4px; }
          100% { top: 100%; }
        }
        @keyframes borderGlow {
          0%,100% { border-color: rgba(99,102,241,0.3); }
          50%     { border-color: rgba(99,102,241,0.7); }
        }
        @keyframes counterUp {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        .grad-text {
          background: linear-gradient(135deg, #818cf8 0%, #c084fc 40%, #60a5fa 80%, #818cf8 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradShift 6s ease infinite;
        }
        .btn-shimmer {
          position: relative; overflow: hidden;
        }
        .btn-shimmer::after {
          content: "";
          position: absolute;
          top: 0; left: 0; width: 40%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          animation: shimmer 2.5s ease-in-out infinite;
        }
        .code-line { animation: counterUp 0.3s ease both; }
      `}</style>

      <div style={{ background: "#000", minHeight: "100vh", color: "#c8c8e8", fontFamily: "system-ui,-apple-system,sans-serif", position: "relative", isolation: "isolate" }}>

        <MouseSpotlight />
        <Orbs />
        <AnimatedGrid />
        <Beam />

        {/* ── NAV ───────────────────────────────────────────────────── */}
        <nav style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.85rem 2rem",
          background: scrolled ? "rgba(0,0,0,0.88)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
          transition: "all 0.35s ease",
        }}>
          <a href="#" style={{ display: "flex", alignItems: "center", gap: "0.55rem", textDecoration: "none", color: "#fff" }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: "0.8rem", color: "#fff", animation: "badgePulse 3s ease infinite" }}>K</div>
            <span style={{ fontWeight: 800, fontSize: "1rem", letterSpacing: "-0.02em" }}>Krux AI</span>
          </a>

          <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            {["#how-it-works", "#features", "#pricing"].map((href, i) => (
              <a key={href} href={href} style={{
                color: "#5a5a7a", textDecoration: "none", fontSize: "0.85rem",
                transition: "color 0.2s", padding: "0.25rem 0",
                borderBottom: "1px solid transparent",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#fff"; (e.currentTarget as HTMLElement).style.borderBottomColor = "#6366f1"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#5a5a7a"; (e.currentTarget as HTMLElement).style.borderBottomColor = "transparent"; }}
              >
                {["How it works", "Features", "Pricing"][i]}
              </a>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Link href="/login" style={{ color: "#5a5a7a", textDecoration: "none", fontSize: "0.85rem", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#fff"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#5a5a7a"}
            >
              Sign in
            </Link>
            <a href="#waitlist" className="btn-shimmer" style={{
              background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
              color: "#fff", textDecoration: "none",
              fontSize: "0.85rem", fontWeight: 700,
              padding: "0.5rem 1.25rem", borderRadius: "8px",
              boxShadow: "0 0 20px rgba(99,102,241,0.35)",
              transition: "box-shadow 0.2s",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 0 35px rgba(99,102,241,0.6)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(99,102,241,0.35)"}
            >
              Join Waitlist
            </a>
          </div>
        </nav>

        {/* ── HERO ──────────────────────────────────────────────────── */}
        <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "8rem 1.5rem 5rem", position: "relative" }}>
          {/* Badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "0.6rem",
            background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: "999px", padding: "0.4rem 1.1rem",
            fontSize: "0.75rem", fontWeight: 600, color: "#818cf8",
            letterSpacing: "0.04em", marginBottom: "2.25rem",
            animation: "badgePulse 3s ease infinite",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "dotPulse 2s infinite" }} />
            Now in private beta · SAP ABAP → S/4HANA
          </div>

          {/* Headline */}
          <h1 style={{ fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1.05, marginBottom: "1.5rem", fontSize: "clamp(2.8rem, 7vw, 5rem)", color: "#fff", maxWidth: "900px" }}>
            Migrate ABAP to S/4HANA{" "}
            <span className="grad-text">10× faster</span>
            <br />with AI
          </h1>

          <p style={{ fontSize: "clamp(1rem, 2vw, 1.18rem)", color: "#4a4a6a", maxWidth: "560px", lineHeight: 1.75, marginBottom: "2.75rem" }}>
            Krux AI converts legacy SAP ABAP programs, function modules, and classes
            to S/4HANA-compatible code automatically — with confidence scores,
            breaking change detection, and a human review workflow built in.
          </p>

          <div id="waitlist" style={{ width: "100%", maxWidth: "440px" }}>
            <WaitlistForm size="large" />
            <p style={{ marginTop: "0.65rem", fontSize: "0.75rem", color: "#3a3a5a" }}>
              No spam. We&apos;ll reach out when your spot is ready.
            </p>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "3rem", marginTop: "5rem", paddingTop: "3.5rem", borderTop: "1px solid rgba(255,255,255,0.05)", width: "100%" }}>
            {[
              { label: "Faster than manual", val: 10, suf: "×" },
              { label: "Avg. first-pass confidence", val: 85, suf: "%" },
              { label: "ABAP object types", val: 12, suf: "+" },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 900, fontSize: "2.2rem", letterSpacing: "-0.05em", color: "#fff" }}>
                  <AnimatedCount target={s.val} suffix={s.suf} />
                </div>
                <div style={{ fontSize: "0.78rem", color: "#3a3a5a", marginTop: "0.25rem" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── CODE DEMO ─────────────────────────────────────────────── */}
        <section style={{ maxWidth: "1200px", margin: "0 auto", padding: "4rem 1.5rem 6rem" }}>
          <Reveal>
            <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6366f1", marginBottom: "0.75rem" }}>See it in action</p>
            <h2 style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(1.9rem, 4vw, 2.8rem)", color: "#fff", marginBottom: "0.75rem" }}>Legacy ABAP in. Clean S/4HANA out.</h2>
            <p style={{ color: "#3a3a5a", fontSize: "0.95rem", maxWidth: "500px", lineHeight: 1.7, marginBottom: "2.5rem" }}>
              Static analysis runs before Claude even sees your code — every table rename, BAPI, obsolete syntax, and user exit flagged automatically.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: "16px",
              overflow: "hidden", background: "#080808",
              animation: "borderGlow 4s ease infinite",
            }}>
              {/* Before */}
              <div style={{ borderRight: "1px solid rgba(255,255,255,0.05)", position: "relative", overflow: "hidden" }}>
                {/* Scanline */}
                <div style={{ position: "absolute", left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, rgba(255,80,80,0.3), transparent)", animation: "scanline 3s linear infinite", pointerEvents: "none" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "#3a3a5a" }}>ZCL_CUSTOMER_VALIDATOR.clas.abap</span>
                  <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "4px", background: "rgba(255,85,85,0.12)", color: "#ff5572", letterSpacing: "0.06em" }}>LEGACY ECC</span>
                </div>
                <pre style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: "0.74rem", lineHeight: 1.75, padding: "1.25rem", overflowX: "auto", color: "#c8c8e8" }}>
                  {LEGACY_LINES.map((ln, i) => (
                    <div key={i} className="code-line" style={{ animationDelay: `${i * 40}ms` }}>
                      {codeLine([ln])}
                    </div>
                  ))}
                </pre>
              </div>

              {/* After */}
              <div style={{ position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)", animation: "scanline 3s linear 1.5s infinite", pointerEvents: "none" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1.25rem", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "#3a3a5a" }}>Converted — S/4HANA 2023</span>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "4px", background: "rgba(34,197,94,0.12)", color: "#22c55e", letterSpacing: "0.06em" }}>92% CONF</span>
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "4px", background: "rgba(99,102,241,0.12)", color: "#818cf8", letterSpacing: "0.06em" }}>CLAUDE</span>
                  </div>
                </div>
                <pre style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: "0.74rem", lineHeight: 1.75, padding: "1.25rem", overflowX: "auto", color: "#c8c8e8" }}>
                  {MODERN_LINES.map((ln, i) => (
                    <div key={i} className="code-line" style={{ animationDelay: `${i * 40 + 300}ms` }}>
                      {codeLine([ln])}
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────────────── */}
        <section id="how-it-works" style={{ background: "#050505", borderTop: "1px solid rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)", padding: "6rem 1.5rem" }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            <Reveal>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6366f1", marginBottom: "0.75rem" }}>How it works</p>
              <h2 style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(1.9rem, 4vw, 2.8rem)", color: "#fff", marginBottom: "3rem" }}>From upload to approved in minutes</h2>
            </Reveal>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              {STEPS.map((s, i) => (
                <Reveal key={s.num} delay={i * 80}>
                  <div
                    style={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "1.6rem 1.4rem", height: "100%", transition: "border-color 0.25s, transform 0.25s", cursor: "default" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.4)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.transform = ""; }}
                  >
                    <div style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: "0.12em", color: "#6366f1", marginBottom: "0.75rem" }}>{s.num}</div>
                    <div style={{ fontSize: "1.6rem", marginBottom: "0.75rem", animation: `iconFloat ${3 + i * 0.4}s ease-in-out infinite` }}>{s.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#fff", marginBottom: "0.4rem" }}>{s.title}</div>
                    <div style={{ fontSize: "0.8rem", color: "#3a3a5a", lineHeight: 1.6 }}>{s.desc}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── FEATURES ──────────────────────────────────────────────── */}
        <section id="features" style={{ maxWidth: "1100px", margin: "0 auto", padding: "6rem 1.5rem" }}>
          <Reveal>
            <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6366f1", marginBottom: "0.75rem" }}>What&apos;s included</p>
            <h2 style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(1.9rem, 4vw, 2.8rem)", color: "#fff", marginBottom: "3rem" }}>Everything your migration team needs</h2>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1rem" }}>
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 60}>
                <FeatureCard {...f} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── PRICING ───────────────────────────────────────────────── */}
        <section id="pricing" style={{ background: "#050505", borderTop: "1px solid rgba(255,255,255,0.04)", padding: "6rem 1.5rem" }}>
          <div style={{ maxWidth: "960px", margin: "0 auto", textAlign: "center" }}>
            <Reveal>
              <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6366f1", marginBottom: "0.75rem" }}>Pricing</p>
              <h2 style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: "clamp(1.9rem, 4vw, 2.8rem)", color: "#fff", marginBottom: "0.75rem" }}>Simple, object-based pricing</h2>
              <p style={{ color: "#3a3a5a", marginBottom: "3rem" }}>Pay for what you migrate. Early access locks in founding-member rates.</p>
            </Reveal>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem", textAlign: "left" }}>
              {PRICING.map((plan, i) => (
                <Reveal key={plan.plan} delay={i * 80}>
                  <div style={{
                    background: plan.hot ? "linear-gradient(160deg, rgba(99,102,241,0.08), #0a0a0a 55%)" : "#0a0a0a",
                    border: `1px solid ${plan.hot ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)"}`,
                    borderRadius: "16px", padding: "2rem",
                    position: "relative", height: "100%",
                    animation: plan.hot ? "borderGlow 3s ease infinite" : "none",
                    transition: "transform 0.25s",
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}
                  >
                    {plan.hot && (
                      <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg,#6366f1,#8b5cf6)", color: "#fff", fontSize: "0.68rem", fontWeight: 800, padding: "0.22rem 0.8rem", borderRadius: "999px", whiteSpace: "nowrap", letterSpacing: "0.04em" }}>MOST POPULAR</div>
                    )}
                    <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3a3a5a", marginBottom: "0.4rem" }}>{plan.plan}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.3rem", marginBottom: "0.25rem" }}>
                      <span style={{ fontWeight: 900, fontSize: "2.1rem", letterSpacing: "-0.05em", color: "#fff" }}>{plan.price}</span>
                      {plan.sub && <span style={{ fontSize: "0.85rem", color: "#3a3a5a" }}>{plan.sub}</span>}
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "#3a3a5a", marginBottom: "1.5rem", lineHeight: 1.55 }}>{plan.desc}</p>
                    <ul style={{ listStyle: "none", marginBottom: "1.75rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
                      {plan.items.map((it) => (
                        <li key={it.t} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: it.ok ? "#c8c8e8" : "#2a2a3a" }}>
                          <span style={{ fontWeight: 800, fontSize: "0.72rem", color: it.ok ? "#22c55e" : "#2a2a3a" }}>{it.ok ? "✓" : "—"}</span>
                          {it.t}
                        </li>
                      ))}
                    </ul>
                    <a href={plan.href} className={plan.hot ? "btn-shimmer" : ""} style={{
                      display: "block", textAlign: "center", textDecoration: "none",
                      fontSize: "0.875rem", fontWeight: 700,
                      padding: "0.7rem", borderRadius: "9px",
                      ...(plan.hot
                        ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", boxShadow: "0 4px 20px rgba(99,102,241,0.4)" }
                        : { background: "transparent", color: "#c8c8e8", border: "1px solid rgba(255,255,255,0.1)" }
                      ),
                      transition: "opacity 0.2s",
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.82"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                    >
                      {plan.cta}
                    </a>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── BOTTOM CTA ────────────────────────────────────────────── */}
        <section style={{ maxWidth: "680px", margin: "0 auto", padding: "8rem 1.5rem", textAlign: "center" }}>
          <Reveal>
            <h2 style={{ fontWeight: 900, letterSpacing: "-0.05em", fontSize: "clamp(2rem, 5vw, 3.2rem)", color: "#fff", marginBottom: "1.25rem" }}>
              Stop doing this <span className="grad-text">manually.</span>
            </h2>
            <p style={{ color: "#3a3a5a", fontSize: "1rem", lineHeight: 1.75, marginBottom: "2.75rem" }}>
              SAP migration projects run years and cost millions — mostly because ABAP conversion is done by hand. Krux AI automates the first 80%. Join the waitlist and we&apos;ll set up your first project together.
            </p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <WaitlistForm size="large" />
            </div>
          </Reveal>
        </section>

        {/* ── FOOTER ────────────────────────────────────────────────── */}
        <footer style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "1.75rem 2rem", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <span style={{ fontWeight: 800, fontSize: "0.9rem", color: "#2a2a3a" }}>Krux AI</span>
          <div style={{ display: "flex", gap: "1.75rem" }}>
            {["#how-it-works", "#features", "#pricing"].map((href, i) => (
              <a key={href} href={href} style={{ color: "#2a2a3a", textDecoration: "none", fontSize: "0.8rem", transition: "color 0.2s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#fff"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#2a2a3a"}
              >
                {["How it works", "Features", "Pricing"][i]}
              </a>
            ))}
            <a href="mailto:hello@kruxai.com" style={{ color: "#2a2a3a", textDecoration: "none", fontSize: "0.8rem", transition: "color 0.2s" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#fff"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#2a2a3a"}
            >Contact</a>
          </div>
          <span style={{ fontSize: "0.75rem", color: "#1a1a2a" }}>© 2025 Krux AI</span>
        </footer>

      </div>
    </>
  );
}
