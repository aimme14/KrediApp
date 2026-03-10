"use client";

import Image from "next/image";

type LogoVariant = "header" | "page";

/** ~5 cm de ancho a 96 dpi (1 cm ≈ 37.8 px) */
const WIDTH_5CM = 189;

const SIZES: Record<LogoVariant, { width: number }> = {
  header: { width: WIDTH_5CM },
  page: { width: WIDTH_5CM },
};

interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  priority?: boolean;
}

/**
 * Logo de KrediApp. Se usa en el header del dashboard, en login y en pantallas de cuenta.
 */
export default function Logo({ variant = "page", className = "", priority = false }: LogoProps) {
  const { width } = SIZES[variant];
  return (
    <Image
      src="/krediapp-logo.png"
      alt="KrediApp"
      width={width}
      height={56}
      className={className}
      priority={priority}
      style={{ width: `${width}px`, height: "auto", maxWidth: "100%", objectFit: "contain" }}
    />
  );
}
