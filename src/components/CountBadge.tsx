export function CountBadge({ count }: { count: number }) {
  if (!count || count < 1) return null;
  return (
    <span className="ml-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}