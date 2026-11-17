export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden className="flex-none">
      <rect width="128" height="128" rx="30" className="fill-accent" />
      <path
        d="M64 24 98 36v26c0 22-14.5 38.5-34 46-19.5-7.5-34-24-34-46V36Z"
        className="fill-accent-fg"
        opacity="0.16"
      />
      <path
        d="M64 24 98 36v26c0 22-14.5 38.5-34 46-19.5-7.5-34-24-34-46V36Z"
        fill="none"
        className="stroke-accent-fg"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <path
        d="m48 65 11 11 22-23"
        fill="none"
        className="stroke-accent-fg"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={22} />
      <span className="text-[14px] font-semibold tracking-[-0.01em] text-fg">ShieldFix</span>
    </span>
  );
}
