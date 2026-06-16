import { redirect } from "next/navigation";

export default function TreasuryPage() {
  redirect("/streams?tab=analytics");
}
