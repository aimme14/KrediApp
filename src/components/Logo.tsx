"use client";

import Image from "next/image";

type LogoVariant = "header" | "page";

/** ~5 cm de ancho a 96 dpi (1 cm ≈ 37.8 px) */
const WIDTH_5CM = 189;

/** Header compacto (logo cuadrado) */
const HEADER_LOGO_WIDTH = 48;
const HEADER_LOGO_HEIGHT = 48;

const SIZES: Record<LogoVariant, { width: number; height?: number }> = {
  header: { width: HEADER_LOGO_WIDTH, height: HEADER_LOGO_HEIGHT },
  page: { width: WIDTH_5CM },
};

interface LogoProps {
  variant?: LogoVariant;
  className?: string;
  priority?: boolean;
}

/** Logo de angry birds. Se usa en el header del dashboard, en login y en pantallas de cuenta. */
export default function Logo({ variant = "page", className = "", priority = false }: LogoProps) {
  const { width, height } = SIZES[variant];
  const h = height ?? width;
  return (
    <Image
      src="/angry-birds-logo.png"
      alt="angry birds"
      width={width}
      height={h}
      className={className}
      priority={priority}
      style={{ width: `${width}px`, height: "auto", maxWidth: "100%", objectFit: "contain" }}
    />
  );
}
