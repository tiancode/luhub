import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireAdmin } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div>
      <AdminHeader />
      {children}
    </div>
  );
}
