"use client";

import Image from "next/image";
import { Inter } from "next/font/google";
import ThemeToggle from "@/components/ThemeToggle";
import styles from "./loginShell.module.css";
import { IconDots } from "./loginIcons";

const inter = Inter({ subsets: ["latin"], display: "swap" });

type LoginShellProps = {
  children: React.ReactNode;
};

/** Fondo de página para carga / redirección (respeta claro/oscuro vía `data-theme`). */
export function LoginBackdrop({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.className} ${styles.backdrop}`}>{children}</div>;
}

/** Login en dos columnas; estilos siguen `data-theme` en `<html>`. */
export default function LoginShell({ children }: LoginShellProps) {
  return (
    <div className={`${inter.className} ${styles.backdrop}`}>
      <div className={styles.shell}>
        <aside className={styles.left}>
          <div className={styles.bubble} aria-hidden />
          <div className={styles.brand}>
            <div className={styles.brandIcon}>
              <Image
                src="/angry-birds-icon.png"
                alt=""
                width={40}
                height={40}
                priority
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
            <span className={styles.brandName}>angry birds</span>
          </div>

          <div className={styles.copy}>
            <p className={styles.tagline}>

            </p>
          </div>
        </aside>

        <section className={styles.right} aria-labelledby="login-heading">
          <div className={styles.rightHeader}>
            <div className={styles.themeSlot}>
              <ThemeToggle />
            </div>
            <button type="button" className={styles.menuBtn} aria-label="Más opciones" title="Próximamente">
              <IconDots />
            </button>
          </div>
          <div className={styles.rightBody}>{children}</div>
        </section>
      </div>
    </div>
  );
}
