import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "…";
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function formatConfidenceScore(score: number | null): string {
  if (score === null) return "—";
  return `${Math.round(score * 100)}%`;
}

export function getConfidenceColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 0.85) return "text-foreground";
  if (score >= 0.65) return "text-muted-foreground";
  return "text-foreground/70";
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    PENDING:    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    CONVERTING: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    CONVERTED:  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    REVIEWED:   "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
    APPROVED:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium",
    FAILED:     "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    DRAFT:      "bg-muted text-muted-foreground",
    ACTIVE:     "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    PAUSED:     "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    COMPLETED:  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-medium",
    ARCHIVED:   "bg-muted text-muted-foreground",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}
