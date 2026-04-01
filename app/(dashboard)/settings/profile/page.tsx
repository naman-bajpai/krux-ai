import { redirect } from "next/navigation";

// Profile settings live in the main settings page
export default function ProfilePage() {
  redirect("/settings");
}
