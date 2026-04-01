import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ProjectProvider } from "@/components/providers/project-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  return (
    <ProjectProvider>
      <div className="flex h-screen overflow-hidden bg-transparent">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto">
            <div className="h-full">{children}</div>
          </main>
        </div>
      </div>
    </ProjectProvider>
  );
}
