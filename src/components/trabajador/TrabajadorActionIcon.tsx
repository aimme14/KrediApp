/** Iconos con color para inicio, drawer y barra inferior del trabajador (viewBox 24×24). */

export type TrabajadorActionIconName =
  | "home"
  | "route"
  | "wallet"
  | "chart"
  | "client"
  | "loan"
  | "calc"
  | "expense"
  | "alert"
  | "menu";

export function TrabajadorActionIcon({ name, size = 22 }: { name: string; size?: number }) {
  switch (name as TrabajadorActionIconName) {
    case "home":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 10.5L12 4l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20V10.5z" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1.65" strokeLinejoin="round" />
          <path d="M9 21.5V12h6v9.5" stroke="#0369a1" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case "route":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M3 19.5C7 14.5 11.5 12 16 8.5"
            stroke="#99f6e4"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M3 19.5C7 14.5 11.5 12 16 8.5"
            stroke="#0e7490"
            strokeWidth="1.65"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="3" cy="19.5" r="2.2" fill="#2dd4bf" stroke="#0f766e" strokeWidth="1.15" />
          <path
            d="M16.5 3.75a2.65 2.65 0 0 1 2.65 2.65c0 1.95-2.65 4.85-2.65 4.85s-2.65-2.9-2.65-4.85a2.65 2.65 0 0 1 2.65-2.65z"
            fill="#ecfeff"
            stroke="#0e7490"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
          <circle cx="16.5" cy="6.4" r="0.95" fill="#0e7490" />
        </svg>
      );

    case "wallet":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 8a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v1H3V8z" fill="#fef3c7" stroke="#ca8a04" strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="2" y="9" width="20" height="12" rx="2.5" fill="#fffbeb" stroke="#d97706" strokeWidth="1.65" />
          <path d="M18 13h2.5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H18" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="17" cy="15" r="0.9" fill="#ea580c" />
        </svg>
      );

    case "chart":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="4" y="12" width="4" height="8" rx="1" fill="#3b82f6" />
          <rect x="10" y="8" width="4" height="12" rx="1" fill="#8b5cf6" />
          <rect x="16" y="4" width="4" height="16" rx="1" fill="#10b981" />
          <path d="M3 21h18" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case "client":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="9" cy="7" r="3.25" fill="#c7d2fe" stroke="#4f46e5" strokeWidth="1.5" />
          <path d="M3 20v-1.5C3 16 5.5 14 9 14s6 2 6 4.5V20" stroke="#6366f1" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="17" cy="8" r="2.5" fill="#e9d5ff" stroke="#7c3aed" strokeWidth="1.25" />
          <path d="M21 20v-.5c0-1.2-1.4-2.2-3.5-2.5" stroke="#9333ea" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case "loan":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" fill="#d1fae5" stroke="#34d399" strokeWidth="1.5" />
          <line x1="12" y1="4.5" x2="12" y2="19.5" stroke="#047857" strokeWidth="1.65" strokeLinecap="round" />
          <path
            d="M17 6.5H9.5a3.25 3.25 0 0 0 0 6.5h5a3.25 3.25 0 0 1 0 6.5H6"
            stroke="#059669"
            strokeWidth="1.65"
            strokeLinecap="round"
          />
        </svg>
      );

    case "calc":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="5" y="3" width="14" height="18" rx="2.5" fill="#fff7ed" stroke="#ea580c" strokeWidth="1.75" />
          <rect x="7.5" y="5.5" width="9" height="6" rx="1" fill="#ffedd5" stroke="#f97316" strokeWidth="1.25" />
          <circle cx="9" cy="15" r="1.25" fill="#fb923c" />
          <circle cx="12" cy="15" r="1.25" fill="#ea580c" />
          <circle cx="15" cy="15" r="1.25" fill="#f97316" />
          <rect x="8.5" y="17.5" width="7" height="2" rx="0.5" fill="#fdba74" />
        </svg>
      );

    case "expense":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
            fill="#eff6ff"
            stroke="#2563eb"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path d="M14 2v6h6" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.75" strokeLinejoin="round" />
          <path d="M8 13h8M8 17h8" stroke="#1d4ed8" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M10 10h4" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case "alert":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            fill="#fef9c3"
            stroke="#ca8a04"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path d="M12 9v4" stroke="#b45309" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1" fill="#b45309" />
        </svg>
      );

    case "menu":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
          <line x1="4" y1="7" x2="20" y2="7" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
          <line x1="4" y1="12" x2="20" y2="12" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
          <line x1="4" y1="17" x2="20" y2="17" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    default:
      return null;
  }
}
