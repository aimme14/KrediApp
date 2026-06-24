"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ClienteItem, PrestamoItem } from "@/lib/empresa-api";
import {
  captureElementToCanvas,
  formatCurrencyCobro,
  getImageBlob,
} from "@/lib/cobrar-utils";

type Props = {
  cliente: ClienteItem;
  prestamo: PrestamoItem;
  montoCobroConfirmado: number;
  saldoTrasCobro: number;
  backHref: string;
  backLabel: string;
  renovarPrestamoHref: string;
  empresaNombre: string | null;
  empresaMetaListo: boolean;
  error: string | null;
  onError: (msg: string | null) => void;
};

function ComprobanteLoadingIcon() {
  return (
    <svg className="comprobante-spinner-icon" width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/** Pantalla post-cobro con comprobante (html2canvas) y compartir. */
export default function CobrarComprobanteConfirmacion({
  cliente,
  prestamo,
  montoCobroConfirmado,
  saldoTrasCobro,
  backHref,
  backLabel,
  renovarPrestamoHref,
  empresaNombre,
  empresaMetaListo,
  error,
  onError,
}: Props) {
  const comprobanteRef = useRef<HTMLDivElement>(null);
  const comprobanteBlobRef = useRef<Blob | null>(null);
  const comprobanteObjectUrlRef = useRef<string | null>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const [comprobanteDisplayUrl, setComprobanteDisplayUrl] = useState<string | null>(null);
  const [comprobanteGenerando, setComprobanteGenerando] = useState(false);
  const [comprobanteError, setComprobanteError] = useState<string | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);

  const totalAPagarCobro = prestamo.totalAPagar ?? 0;
  const numeroCuotasCobro = prestamo.numeroCuotas ?? 0;
  const cuotasRestantesCobro =
    totalAPagarCobro > 0 && numeroCuotasCobro > 0
      ? Math.min(
          numeroCuotasCobro,
          Math.ceil((saldoTrasCobro / totalAPagarCobro) * numeroCuotasCobro)
        )
      : 0;
  const prestamoSaldado = saldoTrasCobro === 0;
  const marcaComprobante = empresaNombre?.trim() || "Empresa";
  const textoComprobanteWa =
    `Comprobante ${marcaComprobante} — ${cliente.nombre}\n` +
    `Monto pagado: ${formatCurrencyCobro(montoCobroConfirmado)}\n` +
    `Saldo restante: ${formatCurrencyCobro(saldoTrasCobro)}\n` +
    `${new Date().toLocaleString("es-CO")}`;
  const mostrarPlaceholderCarga =
    !comprobanteDisplayUrl && (!comprobanteError || comprobanteGenerando);

  useEffect(() => {
    if (!showShareMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showShareMenu]);

  useEffect(() => {
    return () => {
      if (comprobanteObjectUrlRef.current) {
        URL.revokeObjectURL(comprobanteObjectUrlRef.current);
        comprobanteObjectUrlRef.current = null;
      }
    };
  }, []);

  const generarComprobanteLocal = useCallback(async () => {
    const el = comprobanteRef.current;
    if (!el) throw new Error("No se encontró el comprobante en pantalla");
    setComprobanteError(null);
    setComprobanteGenerando(true);
    try {
      const canvas = await captureElementToCanvas(el);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/png", 0.95)
      );
      if (!blob) throw new Error("No se pudo generar la imagen");
      comprobanteBlobRef.current = blob;
      if (comprobanteObjectUrlRef.current) {
        URL.revokeObjectURL(comprobanteObjectUrlRef.current);
        comprobanteObjectUrlRef.current = null;
      }
      const objUrl = URL.createObjectURL(blob);
      comprobanteObjectUrlRef.current = objUrl;
      setComprobanteDisplayUrl(objUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al generar comprobante";
      setComprobanteError(msg);
      throw e;
    } finally {
      setComprobanteGenerando(false);
    }
  }, []);

  const reintentarComprobante = useCallback(async () => {
    try {
      await generarComprobanteLocal();
    } catch {
      /* generarComprobanteLocal ya registró el error */
    }
  }, [generarComprobanteLocal]);

  useEffect(() => {
    if (comprobanteDisplayUrl || !empresaMetaListo) return;
    const el = comprobanteRef.current;
    if (!el) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          await generarComprobanteLocal();
          if (cancelled) return;
        } catch {
          /* error de generación */
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [comprobanteDisplayUrl, generarComprobanteLocal, empresaMetaListo]);

  const descargarComprobanteDesdeDOM = useCallback(async () => {
    const blobCached = comprobanteBlobRef.current;
    if (blobCached) {
      const url = URL.createObjectURL(blobCached);
      const a = document.createElement("a");
      a.href = url;
      a.download = "comprobante-pago.png";
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const el = comprobanteRef.current;
    if (!el) return;
    try {
      const canvas = await captureElementToCanvas(el);
      canvas.toBlob((blob) => {
        if (!blob) return;
        comprobanteBlobRef.current = blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "comprobante-pago.png";
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png", 0.95);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error al generar descarga");
    }
  }, [onError]);

  return (
    <div className="card cobrar-card cobrar-confirmacion">
      <h2 className="cobrar-title">Cobro registrado</h2>
      {prestamoSaldado && (
        <div className="cobrar-prestamo-saldado" role="status">
          <strong>Préstamo saldado.</strong> Este préstamo quedó pagado en su totalidad.
        </div>
      )}
      {comprobanteError && !comprobanteDisplayUrl && (
        <div className="cobrar-comprobante-error" role="alert">
          <p className="cobrar-comprobante-error-msg">
            Cobro registrado correctamente. No se pudo generar la imagen del comprobante para compartir.
          </p>
          <p className="cobrar-comprobante-error-detail">{comprobanteError}</p>
          <div className="cobrar-comprobante-error-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void reintentarComprobante()}
              disabled={comprobanteGenerando}
            >
              {comprobanteGenerando ? "Generando…" : "Reintentar comprobante"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void descargarComprobanteDesdeDOM()}>
              Descargar comprobante (desde pantalla)
            </button>
          </div>
        </div>
      )}
      {comprobanteDisplayUrl ? (
        <div className="comprobante-cobro comprobante-imagen-wrap">
          <img src={comprobanteDisplayUrl} alt="Comprobante de pago" className="comprobante-imagen" />
        </div>
      ) : (
        <>
          {mostrarPlaceholderCarga && (
            <div className="comprobante-placeholder" role="status" aria-live="polite" aria-busy={mostrarPlaceholderCarga}>
              <ComprobanteLoadingIcon />
              <span className="comprobante-placeholder-texto">Generando comprobante…</span>
              <span className="comprobante-placeholder-hint">Preparando imagen para compartir</span>
            </div>
          )}
          <div className="comprobante-capture-offscreen" aria-hidden="true">
            <div ref={comprobanteRef} className="comprobante-cobro comprobante-voucher" aria-label="Comprobante para el cliente">
              <div className="voucher-header">
                <div className="voucher-icon" aria-hidden>✓</div>
                <h3 className="voucher-title">Pago exitoso</h3>
                <p className="voucher-subtitle">Comprobante de pago</p>
              </div>
              <div className="voucher-monto">
                <span className="voucher-monto-label">Monto pagado</span>
                <span className="voucher-monto-value">{formatCurrencyCobro(montoCobroConfirmado)}</span>
              </div>
              <div className="voucher-rows">
                <div className="voucher-row">
                  <span className="voucher-row-label">Cliente</span>
                  <span className="voucher-row-value">{cliente.nombre}</span>
                </div>
                {cliente.cedula && (
                  <div className="voucher-row">
                    <span className="voucher-row-label">Cédula</span>
                    <span className="voucher-row-value">{cliente.cedula}</span>
                  </div>
                )}
                {cliente.telefono && (
                  <div className="voucher-row">
                    <span className="voucher-row-label">Teléfono</span>
                    <span className="voucher-row-value">{cliente.telefono}</span>
                  </div>
                )}
                <div className="voucher-row">
                  <span className="voucher-row-label">Cuotas restantes</span>
                  <span className="voucher-row-value">
                    {cuotasRestantesCobro} de {numeroCuotasCobro}
                  </span>
                </div>
                <div className="voucher-row">
                  <span className="voucher-row-label">Saldo restante</span>
                  <span className="voucher-row-value">{formatCurrencyCobro(saldoTrasCobro)}</span>
                </div>
              </div>
              <div className="voucher-footer">
                <p className="voucher-fecha">
                  {new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" })}
                </p>
                <p className="voucher-brand">{marcaComprobante} · Comprobante válido</p>
              </div>
            </div>
          </div>
        </>
      )}
      {error && <p className="error-msg" role="alert">{error}</p>}
      <div className="cobrar-confirmacion-actions">
        <div className="compartir-wrap" ref={shareMenuRef}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              setShowShareMenu((v) => !v);
              onError(null);
            }}
            aria-expanded={showShareMenu}
            aria-haspopup="true"
            disabled={!comprobanteDisplayUrl}
          >
            Compartir
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void descargarComprobanteDesdeDOM()}
            title="Descargar comprobante como imagen"
          >
            Descargar comprobante
          </button>
          {showShareMenu && (
            <div className="compartir-dropdown compartir-dropdown-wa" role="menu">
              <p className="compartir-pregunta">¿Enviar comprobante por WhatsApp?</p>
              <button
                type="button"
                className="compartir-opcion compartir-opcion-icono"
                role="menuitem"
                disabled={!comprobanteDisplayUrl}
                onClick={async () => {
                  if (!comprobanteDisplayUrl) return;
                  setShowShareMenu(false);
                  onError(null);
                  try {
                    const blob = comprobanteBlobRef.current ?? (await getImageBlob(comprobanteDisplayUrl));
                    const file = new File([blob], "comprobante-pago.png", { type: blob.type || "image/png" });
                    const hasShareApi = typeof navigator !== "undefined" && "share" in navigator;
                    const canShare =
                      hasShareApi &&
                      (typeof navigator.canShare === "function" ? navigator.canShare({ files: [file] }) : true);
                    if (canShare) {
                      await navigator.share({ files: [file], title: "Comprobante de pago" });
                    } else {
                      const dl = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = dl;
                      a.download = "comprobante-pago.png";
                      a.click();
                      URL.revokeObjectURL(dl);
                      window.open("https://wa.me/?text=" + encodeURIComponent(textoComprobanteWa), "_blank", "noopener");
                    }
                  } catch (e) {
                    onError(e instanceof Error ? e.message : "Error al compartir la imagen");
                  }
                }}
              >
                <span className="compartir-icono compartir-icono-wa" aria-hidden>
                  <WhatsAppIcon />
                </span>
                <span>WhatsApp</span>
              </button>
            </div>
          )}
        </div>
        <Link href={backHref} className="btn btn-secondary">
          {backLabel}
        </Link>
      </div>
      {prestamoSaldado && (
        <div
          style={{
            marginTop: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--card-border)",
          }}
        >
          <p style={{ margin: "0 0 0.65rem", fontSize: "0.875rem", color: "var(--text-muted)", fontWeight: 600 }}>
            Renovación
          </p>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            El préstamo de {cliente.nombre} quedó saldado. ¿Deseas crear un nuevo préstamo?
          </p>
          <Link
            href={renovarPrestamoHref}
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Renovar préstamo
          </Link>
        </div>
      )}
    </div>
  );
}
