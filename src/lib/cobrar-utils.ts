import type { MotivoNoPago, MotivoPerdida } from "@/types/finanzas";

export function formatCurrencyCobro(value: number): string {
  return value.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
}

export const MOTIVOS_NO_PAGO: { value: MotivoNoPago; label: string }[] = [
  { value: "sin_fondos", label: "No tenía dinero" },
  { value: "no_estaba", label: "No estaba en casa" },
  { value: "promesa_pago", label: "Prometió pagar después" },
  { value: "otro", label: "Otro motivo" },
];

export const MOTIVOS_PERDIDA: { value: MotivoPerdida; label: string }[] = [
  { value: "imposible_cobrar", label: "Imposible cobrar" },
  { value: "cliente_perdido", label: "Cliente perdido" },
  { value: "acuerdo_quita", label: "Acuerdo / quita" },
  { value: "otro", label: "Otro" },
];

export type CobroSnapshot = {
  key: string;
  prestamoId: string;
  monto: number;
  metodoPago: "efectivo" | "transferencia";
  clienteId: string;
};

export function getCobroSnapshot(pid: string, uid: string): CobroSnapshot | null {
  try {
    const raw = localStorage.getItem(`kredi:cobro:${pid}:${uid}`);
    return raw ? (JSON.parse(raw) as CobroSnapshot) : null;
  } catch {
    return null;
  }
}

export function setCobroSnapshot(s: CobroSnapshot, uid: string): void {
  try {
    localStorage.setItem(`kredi:cobro:${s.prestamoId}:${uid}`, JSON.stringify(s));
  } catch {
    /* localStorage no disponible */
  }
}

export function clearCobroSnapshot(pid: string, uid: string): void {
  try {
    localStorage.removeItem(`kredi:cobro:${pid}:${uid}`);
  } catch {
    /* localStorage no disponible */
  }
}

export type NoPagoSnapshot = {
  key: string;
  prestamoId: string;
  /** Motivo elegido — solo informativo; el backend no lo reutiliza en replay. */
  motivoNoPago: string;
};

export function getNoPagoSnapshot(pid: string, uid: string): NoPagoSnapshot | null {
  try {
    const raw = localStorage.getItem(`kredi:nopago:${pid}:${uid}`);
    return raw ? (JSON.parse(raw) as NoPagoSnapshot) : null;
  } catch {
    return null;
  }
}

export function setNoPagoSnapshot(s: NoPagoSnapshot, uid: string): void {
  try {
    localStorage.setItem(`kredi:nopago:${s.prestamoId}:${uid}`, JSON.stringify(s));
  } catch {
    /* localStorage no disponible */
  }
}

export function clearNoPagoSnapshot(pid: string, uid: string): void {
  try {
    localStorage.removeItem(`kredi:nopago:${pid}:${uid}`);
  } catch {
    /* localStorage no disponible */
  }
}

/** Escala de captura: mínimo 2× para nitidez en móviles. */
export function getComprobanteCaptureScale(): number {
  if (typeof window === "undefined") return 2;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(2.5, Math.max(2, dpr));
}

/** Carga html2canvas solo en el cliente. */
export async function captureElementToCanvas(el: HTMLElement) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(el, {
    scale: getComprobanteCaptureScale(),
    backgroundColor: "#ffffff",
    logging: false,
    useCORS: true,
  });
}

/** Obtiene la imagen como Blob; si fetch falla por CORS, usa canvas desde img. */
export async function getImageBlob(url: string): Promise<Blob> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("No se pudo cargar la imagen");
    return await res.blob();
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas no disponible"));
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen"))),
          "image/png",
          0.95
        );
      };
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.src = url;
    });
  }
}
