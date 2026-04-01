"use client";

import { useState } from "react";

export function WaitlistForm({ size = "default" }: { size?: "default" | "large" }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    // TODO: POST to your waitlist API / Formspree / Tally
    await new Promise((r) => setTimeout(r, 600)); // simulate
    setDone(true);
    setLoading(false);
  }

  const isLarge = size === "large";

  if (done) {
    return (
      <div className="flex items-center gap-2 text-[#4ecb8d] font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.85rem" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        You&apos;re on the list — we&apos;ll be in touch.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 flex-wrap">
      <input
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        className={`
          flex-1 min-w-[200px] rounded-md
          border border-white/8 bg-white/4
          text-[#ddd5c5] placeholder:text-white/20 outline-none
          focus:border-[rgba(232,168,58,0.4)] focus:ring-1 focus:ring-[rgba(232,168,58,0.2)]
          transition-colors
          ${isLarge ? "px-4 py-3 text-sm" : "px-3.5 py-2.5 text-xs"}
        `}
      />
      <button
        type="submit"
        disabled={loading}
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        className={`
          rounded-md bg-[#e8a83a] hover:bg-[#f0b84a] active:scale-[0.98]
          text-[#07090c] font-semibold whitespace-nowrap tracking-wide
          transition-all disabled:opacity-60 cursor-pointer
          shadow-[0_4px_20px_rgba(232,168,58,0.25)]
          ${isLarge ? "px-6 py-3 text-sm" : "px-4 py-2.5 text-xs"}
        `}
      >
        {loading ? "Joining…" : "Get Early Access"}
      </button>
    </form>
  );
}
