import { Loader } from "@/components/Loader";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left font-medium text-ink-secondary px-4 py-2.5 border-b border-line bg-surface-hover whitespace-nowrap">
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-2.5 border-b border-line text-ink ${className}`}>
      {children}
    </td>
  );
}

export function Tr({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={onClick ? "cursor-pointer transition-colors hover:bg-accent-soft" : "transition-colors hover:bg-surface-hover"}
    >
      {children}
    </tr>
  );
}

export function EmptyRow({ colSpan, label = "No results" }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-ink-muted text-sm">
        {label}
      </td>
    </tr>
  );
}

export function LoadingRow({ colSpan, label = "Loading..." }: { colSpan: number; label?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-ink-muted text-sm">
        <div className="flex items-center justify-center gap-2">
          <Loader />
          {label}
        </div>
      </td>
    </tr>
  );
}
