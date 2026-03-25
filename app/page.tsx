import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingClient } from "@/components/landing/landing-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Krux AI — AI-Powered SAP ABAP Migration",
  description:
    "Migrate your legacy SAP ABAP codebase to S/4HANA in days, not years. Krux AI uses Claude to convert, review, and approve your ABAP objects automatically.",
};

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");
  return <LandingClient />;
}
