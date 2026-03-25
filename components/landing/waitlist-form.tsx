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
      <div className="flex items-center gap-2 text-[#22c55e] font-medium">
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
        className={`
          flex-1 min-w-[200px] rounded-lg border border-white/10 bg-white/5
          text-white placeholder:text-white/30 outline-none
          focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30
          transition-colors
          ${isLarge ? "px-4 py-3 text-base" : "px-3.5 py-2.5 text-sm"}
        `}
      />
      <button
        type="submit"
        disabled={loading}
        className={`
          rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98]
          text-white font-semibold whitespace-nowrap
          transition-all disabled:opacity-60 cursor-pointer
          shadow-[0_4px_20px_rgba(99,102,241,0.35)]
          ${isLarge ? "px-6 py-3 text-base" : "px-4 py-2.5 text-sm"}
        `}
      >
        {loading ? "Joining…" : "Get Early Access"}
      </button>
    </form>
  );
}
