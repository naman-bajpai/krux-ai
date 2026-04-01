"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { useSession } from "next-auth/react";

/**
 * /projects/new — opens the create-project dialog immediately.
 * On cancel or after creation it navigates back to /projects.
 */
export default function NewProjectPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);

  // Open dialog on first render
  useEffect(() => {
    setOpen(true);
  }, []);

  return (
    <div className="p-6">
      <CreateProjectDialog
        orgId={session?.user?.organizationId}
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) router.push("/projects");
        }}
      >
        {/* No trigger child — dialog is controlled via open prop */}
        <span />
      </CreateProjectDialog>
    </div>
  );
}
