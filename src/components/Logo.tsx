"use client";

import Image from "next/image";

type LogoVariant = "header" | "page";

/** ~5 cm de ancho a 96 dpi (1 cm ≈ 37.8 px) */
const WIDTH_5CM = 189;

/** Header compacto: mismo ratio que el logo estándar (≈3.38:1) */
const HEADER_LOGO_WIDTH = 130;
const HEADER_LOGO_HEIGHT = 38;

const SIZES: Record<LogoVariant, { width: number; height?: number }> = {
  header: { width: HEADER_LOGO_WIDTH, height: HEADER_LOGO_HEIGHT },
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
  const { width, height } = SIZES[variant];
  const h = height ?? 56;
  return (
    <Image
      src="/krediapp-logo.png"
      alt="KrediApp"
      width={width}
      height={h}
      className={className}
      priority={priority}
      style={{ width: `${width}px`, height: "auto", maxWidth: "100%", objectFit: "contain" }}
    />
  );
}
