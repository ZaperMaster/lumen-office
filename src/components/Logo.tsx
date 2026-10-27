export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lumen-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22c1ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#lumen-g)" />
      <path d="M20 16h6v26h18v6H20z" fill="#fff" />
    </svg>
  );
}
