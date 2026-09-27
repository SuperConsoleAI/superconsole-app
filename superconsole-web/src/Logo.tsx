export function Logo() {
  return (
    <svg
      className="logo"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SuperConsole"
    >
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path
        d="M10 12l5 4-5 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 20h7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
