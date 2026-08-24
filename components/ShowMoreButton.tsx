export function ShowMoreButton({
  visibleCount,
  total,
  onClick,
}: {
  visibleCount: number;
  total: number;
  onClick: () => void;
}) {
  if (visibleCount >= total) return null;

  return (
    <div className="flex items-center justify-center py-3">
      <button
        onClick={onClick}
        className="rounded-md border border-line-strong bg-surface px-4 py-1.5 text-sm text-ink-secondary transition-colors hover:border-accent hover:text-accent"
      >
        Show more ({total - visibleCount} remaining)
      </button>
    </div>
  );
}
