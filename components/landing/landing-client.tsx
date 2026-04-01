"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { WaitlistForm } from "./waitlist-form";

// ── Scroll reveal ─────────────────────────────────────────────────────────────
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            (e.target as HTMLElement).setAttribute("data-in", "1");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ── Scrolled nav ──────────────────────────────────────────────────────────────
function useScrolled() {
  const [s, setS] = useState(false);
  useEffect(() => {
    const h = () => setS(window.scrollY > 60);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return s;
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Count({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !done.current) {
          done.current = true;
          const dur = 1400, t0 = performance.now();
          const tick = (t: number) => {
            const p = Math.min((t - t0) / dur, 1);
            setN(Math.round((1 - Math.pow(1 - p, 3)) * to));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [to]);
  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  );
}

// ── Code panel animation ──────────────────────────────────────────────────────
type Phase = "legacy" | "scan" | "converting" | "modern";
const PHASES: Phase[] = ["legacy", "scan", "converting", "modern"];

function usePhase(): Phase {
  const [phase, setPhase] = useState<Phase>("legacy");
  useEffect(() => {
    let mounted = true;
    function run() {
      if (!mounted) return;
      setPhase("legacy");
      setTimeout(() => { if (mounted) setPhase("scan"); }, 2400);
      setTimeout(() => { if (mounted) setPhase("converting"); }, 4000);
      setTimeout(() => { if (mounted) setPhase("modern"); }, 5200);
      setTimeout(() => { if (mounted) run(); }, 10500);
    }
    run();
    return () => { mounted = false; };
  }, []);
  return phase;
}

// ── Data ──────────────────────────────────────────────────────────────────────
const STEPS = [
  { n: "01", title: "Upload ABAP", desc: "Drag & drop .abap files. abapGit naming auto-detected and parsed." },
  { n: "02", title: "Static scan", desc: "Every table access, BAPI, user exit, and obsolete pattern flagged with severity." },
  { n: "03", title: "AI conversion", desc: "Claude converts to ABAP 7.5+ with a confidence score and breaking-change annotations." },
  { n: "04", title: "Human review", desc: "Side-by-side diff. Approve, reject, or edit inline. Bulk-approve high-confidence runs." },
  { n: "05", title: "Export ZIP", desc: "abapGit-compatible ZIP with MANIFEST.txt confidence scores. Transport-ready." },
];

const FEATURES = [
  { n: "01", title: "Claude-powered conversion",  desc: "Tailored system prompt with S/4HANA table renames, ABAP 7.5+ rules, and ECC anti-patterns. 90% cheaper on prompt-cache hits." },
  { n: "02", title: "Confidence scoring",          desc: "1–10 score per object. Enhancement spots and user exits auto-flagged. High-confidence objects bulk-approvable." },
  { n: "03", title: "Real-time progress",          desc: "BullMQ + Redis pub/sub → SSE. Watch objects move PENDING → CONVERTING → CONVERTED live in the UI." },
  { n: "04", title: "Breaking change detection",   desc: "BSEG/BSID/MKPF/KONV renames, ENDSELECT/CONCATENATE obsolete syntax, Dynpro patterns, user exit → BADI." },
  { n: "05", title: "Multi-org team roles",        desc: "Orgs, projects, Admin/Reviewer/Viewer access, full audit log. Every action tracked with user, timestamp, metadata." },
  { n: "06", title: "abapGit-ready export",        desc: "ZIP with abapGit naming + MANIFEST.txt with confidence scores. JSON export also available." },
];

const PRICING = [
  {
    plan: "Assessment", price: "Free", sub: null,
    desc: "Scan and get complexity estimates.",
    items: ["Up to 25 objects converted", "Static ABAP analysis report", "Confidence score preview"],
    missing: ["Human review workflow", "ZIP export", "Team access"],
    cta: "Join Waitlist", href: "#waitlist", featured: false,
  },
  {
    plan: "Migration", price: "$0.08", sub: "/object",
    desc: "Full pipeline: convert, review, export.",
    items: ["Unlimited objects", "AI conversion + confidence scores", "Full review workflow", "ZIP + JSON export", "5 team seats", "Audit logs"],
    missing: [],
    cta: "Get Early Access", href: "#waitlist", featured: true,
  },
  {
    plan: "Enterprise", price: "Custom", sub: null,
    desc: "Large landscapes, SLAs, direct connect.",
    items: ["Volume pricing", "SAP direct connect", "SSO + custom roles", "Unlimited seats", "Dedicated engineer", "SLA guarantee"],
    missing: [],
    cta: "Contact Sales", href: "mailto:hello@kruxai.com", featured: false,
  },
];

const TICKER_ITEMS = [
  "847 objects this week",
  "ECC 6.0 → S/4HANA 2023",
  "BSEG · BSID · MKPF · KONV renames detected",
  "abapGit-compatible export",
  "Claude Sonnet powered",
  "Real-time SSE progress",
  "94% avg confidence score",
  "ZIP + JSON export",
];

// ── Hero code panel ───────────────────────────────────────────────────────────
function CodePanel({ phase }: { phase: Phase }) {
  const isModern     = phase === "modern";
  const isScanning   = phase === "scan";
  const isConverting = phase === "converting";

  const badgeCls =
    isModern ? "ok" : isScanning ? "scanning" : isConverting ? "converting" : "err";
  const badgeText =
    isModern ? "✓ S/4HANA READY" : isScanning ? "⟳ SCANNING" : isConverting ? "◌ CONVERTING" : "⚠ LEGACY ECC";

  return (
    <div className="lp-cpanel">
      {/* Title bar */}
      <div className="lp-cpanel-bar">
        <span className="lp-cpanel-dot r" />
        <span className="lp-cpanel-dot y" />
        <span className="lp-cpanel-dot g" />
        <span className="lp-cpanel-file">
          {isModern ? "converted.abap" : "legacy.abap"}
        </span>
        <span className={`lp-cpanel-badge ${badgeCls}`}>{badgeText}</span>
      </div>

      {/* Code body */}
      <div className={`lp-cpanel-body${isConverting ? " converting" : ""}`}>
        {isScanning && <div className="lp-scanline" />}
        <pre className="lp-cpanel-pre">
          {isModern ? (
            <>
              <span className="lp-c-cmt">&quot; Modern JOIN — S/4HANA 2023{"\n"}</span>
              <span className="lp-c-kw">SELECT</span>
              <span className="lp-c-tx"> k~kunnr, k~name1,{"\n"}</span>
              <span className="lp-c-tx">       a~dmbtr, a~waers{"\n"}</span>
              <span className="lp-c-kw">  FROM </span>
              <span className="lp-c-ty">kna1</span>
              <span className="lp-c-kw"> AS </span>
              <span className="lp-c-tx">k{"\n"}</span>
              <span className="lp-c-kw">  INNER JOIN </span>
              <span className="lp-c-ok">i_customerbalance</span>
              <span className="lp-c-kw"> AS </span>
              <span className="lp-c-tx">a{"\n"}</span>
              <span className="lp-c-kw">    ON </span>
              <span className="lp-c-tx">a~kunnr = k~kunnr{"\n"}</span>
              <span className="lp-c-kw">  WHERE </span>
              <span className="lp-c-tx">k~kunnr IN </span>
              <span className="lp-c-kw">@</span>
              <span className="lp-c-tx">s_kunnr{"\n"}</span>
              <span className="lp-c-kw">  INTO TABLE </span>
              <span className="lp-c-kw">@DATA</span>
              <span className="lp-c-tx">(lt_result).{"\n\n"}</span>
              <span className="lp-c-kw">LOOP AT </span>
              <span className="lp-c-tx">lt_result </span>
              <span className="lp-c-kw">INTO DATA</span>
              <span className="lp-c-tx">(ls).{"\n"}</span>
              <span className="lp-c-kw">  DATA</span>
              <span className="lp-c-tx">(lv_out) ={"\n"}</span>
              <span className="lp-c-st">{"    `|{ ls-name1 } | { ls-dmbtr }|`"}</span>
              <span className="lp-c-tx">.{"\n"}</span>
              <span className="lp-c-kw">ENDLOOP</span>
              <span className="lp-c-tx">.{"\n"}</span>
            </>
          ) : (
            <>
              <span className="lp-c-cmt">* Nested SELECT — BLOCKED in S/4HANA{"\n"}</span>
              <span className="lp-c-kw">SELECT</span>
              <span className="lp-c-tx"> kunnr name1{"\n"}</span>
              <span className="lp-c-kw">  INTO</span>
              <span className="lp-c-tx"> (lv_kunnr, lv_name1){"\n"}</span>
              <span className="lp-c-kw">  FROM </span>
              <span className="lp-c-ty">kna1{"\n"}</span>
              <span className="lp-c-kw">  WHERE</span>
              <span className="lp-c-tx"> kunnr IN s_kunnr.{"\n\n"}</span>
              <span className="lp-c-kw">  SELECT SINGLE</span>
              <span className="lp-c-tx"> dmbtr waers{"\n"}</span>
              <span className="lp-c-kw">    FROM</span>
              <span className={`lp-c-er${isScanning ? " pulse" : ""}`}> bsid</span>
              <span className="lp-c-warn">  ← ⚠ BLOCKED{"\n"}</span>
              <span className="lp-c-kw">    WHERE</span>
              <span className="lp-c-tx"> kunnr = lv_kunnr.{"\n\n"}</span>
              <span className={`lp-c-er${isScanning ? " pulse" : ""}`}>  CONCATENATE</span>
              <span className="lp-c-tx"> lv_name1 </span>
              <span className="lp-c-st">&apos; | &apos;</span>
              <span className="lp-c-tx"> lv_amt</span>
              <span className="lp-c-warn">  ← obsolete{"\n"}</span>
              <span className="lp-c-kw">    INTO</span>
              <span className="lp-c-tx"> lv_display.{"\n\n"}</span>
              <span className={`lp-c-er${isScanning ? " pulse" : ""}`}>ENDSELECT</span>
              <span className="lp-c-tx">.</span>
              <span className="lp-c-warn">  ← ⚠ REMOVED in S/4{"\n"}</span>
            </>
          )}
        </pre>
      </div>

      {/* Confidence bar (modern only) */}
      {isModern && (
        <div className="lp-cpanel-score">
          <span className="lp-score-label">Confidence</span>
          <span className="lp-score-val">
            9.2<span className="lp-score-max">/10</span>
          </span>
          <div className="lp-score-bar">
            <div className="lp-score-fill" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function LandingClient() {
  useReveal();
  const scrolled = useScrolled();
  const phase = usePhase();

  return (
    <div className="lp-root">
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className={`lp-nav${scrolled ? " scrolled" : ""}`}>
        <a href="#" className="lp-nav-brand">
          <div className="lp-nav-mark">K</div>
          <span className="lp-nav-name">Krux AI</span>
        </a>
        <div className="lp-nav-links">
          <a href="#how-it-works" className="lp-nav-link">How it works</a>
          <a href="#features"     className="lp-nav-link">Features</a>
          <a href="#pricing"      className="lp-nav-link">Pricing</a>
        </div>
        <Link href="/login" className="lp-nav-signin">Sign in →</Link>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        {/* Left — copy */}
        <div className="lp-hero-left">
          <div className="lp-eyebrow">
            <span className="lp-eyebrow-dot" />
            AI-Powered SAP ABAP Migration
          </div>

          <h1 className="lp-h1">
            Your ABAP,<br />
            <em>S/4HANA-ready.</em><br />
            Automatically.
          </h1>

          <p className="lp-hero-sub">
            Purpose-built AI pipeline for SAP ABAP → S/4HANA migration.
            Static analysis, Claude-powered conversion, human review,
            and abapGit export. From months to days.
          </p>

          <div className="lp-hero-actions">
            <a href="#waitlist" className="lp-btn-primary">Get early access</a>
            <a href="#how-it-works" className="lp-btn-ghost">How it works ↓</a>
          </div>

          <div className="lp-hero-stats">
            {[
              { to: 847, s: "",  label: "objects converted" },
              { to: 94,  s: "%", label: "avg confidence" },
              { to: 3,   s: "d", label: "avg migration time" },
            ].map(({ to, s, label }) => (
              <div key={label}>
                <span className="lp-hero-stat-n">
                  <Count to={to} suffix={s} />
                </span>
                <span className="lp-hero-stat-l">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — code panel */}
        <div className="lp-hero-right">
          <CodePanel phase={phase} />
          <div className="lp-phase-track">
            {PHASES.map((p, i) => (
              <div
                key={p}
                className={`lp-phase-dot${phase === p ? " active" : ""}${
                  PHASES.indexOf(phase) > i ? " past" : ""
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────────────────── */}
      <div className="lp-ticker">
        <div className="lp-ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} className="lp-ticker-item">
              {item}
              <span className="lp-ticker-sep">◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="lp-section" id="how-it-works">
        <div className="lp-section-head" data-reveal>
          <span className="lp-section-label">Process</span>
          <h2 className="lp-h2">From upload to transport-ready</h2>
          <p className="lp-section-sub">
            Five deterministic steps, fully automated except where human judgement matters.
          </p>
        </div>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="lp-step"
              data-reveal
              style={{ "--delay": `${i * 80}ms` } as React.CSSProperties}
            >
              <div className="lp-step-num">{s.n}</div>
              <h3 className="lp-step-title">{s.title}</h3>
              <p className="lp-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────── */}
      <div className="lp-section-full" id="features">
        <div className="lp-section-inner">
          <div className="lp-section-head" data-reveal>
            <span className="lp-section-label">Capabilities</span>
            <h2 className="lp-h2">
              Built for <em>ABAP engineers</em>
            </h2>
            <p className="lp-section-sub">
              Everything you need to migrate safely and at scale, with full auditability.
            </p>
          </div>
          <div className="lp-features">
            {FEATURES.map((f, i) => (
              <div
                key={f.n}
                className="lp-feature"
                data-reveal
                style={{ "--delay": `${i * 60}ms` } as React.CSSProperties}
              >
                <span className="lp-feature-n">{f.n}</span>
                <h3 className="lp-feature-title">{f.title}</h3>
                <p className="lp-feature-body">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section className="lp-section" id="pricing">
        <div className="lp-section-head" data-reveal>
          <span className="lp-section-label">Pricing</span>
          <h2 className="lp-h2">Simple, object-based pricing</h2>
          <p className="lp-section-sub">
            Pay for what you convert. No per-seat fees, no surprises.
          </p>
        </div>
        <div className="lp-pricing">
          {PRICING.map((p, i) => (
            <div
              key={p.plan}
              className={`lp-price-card${p.featured ? " featured" : ""}`}
              data-reveal
              style={{ "--delay": `${i * 80}ms` } as React.CSSProperties}
            >
              {p.featured && <div className="lp-price-badge">MOST POPULAR</div>}
              <div>
                <span className="lp-price-plan">{p.plan}</span>
                <div className="lp-price-amount">
                  <span className="lp-price-main">{p.price}</span>
                  {p.sub && <span className="lp-price-sub">{p.sub}</span>}
                </div>
                <p className="lp-price-desc">{p.desc}</p>
              </div>
              <ul className="lp-price-items">
                {p.items.map((item) => (
                  <li key={item} className="lp-price-item ok">
                    <span className="lp-price-check">✓</span>
                    {item}
                  </li>
                ))}
                {p.missing.map((item) => (
                  <li key={item} className="lp-price-item no">
                    <span className="lp-price-check">—</span>
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={p.href}
                className={`lp-price-cta${p.featured ? " featured" : ""}`}
              >
                {p.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── Waitlist CTA ─────────────────────────────────────────────── */}
      <section className="lp-cta" id="waitlist">
        <div className="lp-cta-inner" data-reveal>
          <span className="lp-section-label">Early access</span>
          <h2 className="lp-h2">Start migrating today</h2>
          <p className="lp-cta-sub">
            Join the waitlist for early access.
            We onboard new teams every week.
          </p>
          <div className="lp-cta-form">
            <WaitlistForm size="large" />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <div className="lp-nav-mark" style={{ width: 22, height: 22, fontSize: "0.65rem" }}>
            K
          </div>
          <span className="lp-nav-name" style={{ fontSize: "0.8rem" }}>Krux AI</span>
        </div>
        <div className="lp-footer-links">
          <a href="mailto:hello@kruxai.com" className="lp-footer-link">hello@kruxai.com</a>
          <a href="#" className="lp-footer-link">Privacy</a>
          <a href="#" className="lp-footer-link">Terms</a>
        </div>
        <p className="lp-footer-copy">© 2024 Krux AI. All rights reserved.</p>
      </footer>
    </div>
  );
}
