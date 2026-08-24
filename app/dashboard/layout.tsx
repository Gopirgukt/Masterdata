import { Sidebar } from "@/components/Sidebar";
import { TopHeader } from "@/components/TopHeader";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-page overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-64 min-w-0">
        <TopHeader />
        <main className="flex-1 overflow-y-auto overflow-x-auto p-8">{children}</main>
      </div>
    </div>
  );
}
