"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { invertirCajaJefe, transferirBaseEmpresaAAdmin } from "@/lib/capital";
import type { CapitalResponse } from "@/lib/capital";
import { formatMontoEnteroInput } from "@/lib/monto-input-es";

function formatMonto(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function parseMontoInput(value: string): { num: number; valid: boolean } {
  const raw = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const num = Number(raw);
  if (raw === "" || Number.isNaN(num)) return { num: 0, valid: false };
  if (num <= 0) return { num, valid: false };
  return { num, valid: true };
}

export type InversionPendiente =
  | { tipo: "empresa"; monto: number }
  | { tipo: "admin"; monto: number; adminUid: string; adminNombre: string };

export function ModalConfirmarInversion({
  inversion,
  onClose,
  onSuccess,
}: {
  inversion: InversionPendiente;
  onClose: () => void;
  onSuccess: (data: Partial<CapitalResponse>) => void;
}) {
  const { user } = useAuth();
  const [montoConfirm, setMontoConfirm] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || saving) return;
      onClose();
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [saving, onClose]);

  const handleConfirmar = async () => {
    if (!user) return;
    const { num, valid } = parseMontoInput(montoConfirm);
    if (!valid) {
      setModalError(
        montoConfirm.trim() === "" ? "Repite el monto para confirmar." : "El monto debe ser mayor a 0."
      );
      return;
    }
    if (num !== inversion.monto) {
      setModalError("El monto repetido no coincide con el de la inversión.");
      return;
    }
    setModalError(null);
    setSaving(true);
    try {
      const token = await user.getIdToken();
      if (inversion.tipo === "empresa") {
        const data = await invertirCajaJefe(token, { monto: inversion.monto });
        onSuccess(data);
      } else {
        const data = await transferirBaseEmpresaAAdmin(token, {
          adminUid: inversion.adminUid,
          monto: inversion.monto,
        });
        onSuccess(data);
      }
      onClose();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Error al registrar la operación");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="gf-modal-backdrop"
      onClick={() => {
        if (!saving) onClose();
      }}
      aria-hidden
    >
      <div
        className="gf-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gf-modal-inversion-title"
        aria-describedby="gf-modal-inversion-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="gf-modal-inversion-title" className="gf-modal-title">
          {inversion.tipo === "empresa"
            ? "Confirmar inversión en empresa"
            : "Confirmar inversión a administrador"}
        </h2>
        <p id="gf-modal-inversion-desc" className="gf-modal-desc">
          {inversion.tipo === "empresa" ? (
            <>
              Vas a registrar una <strong>entrada de liquidez</strong> por{" "}
              <span className="gf-modal-monto">${formatMonto(inversion.monto)}</span>. Aumentarán
              la caja de la empresa y el capital total. Para confirmar,{" "}
              <strong>repite el mismo monto</strong> abajo.
            </>
          ) : (
            <>
              Vas a transferir{" "}
              <span className="gf-modal-monto">${formatMonto(inversion.monto)}</span> desde la
              caja de la empresa hacia <strong>{inversion.adminNombre}</strong>. El capital total no
              cambia. Para confirmar, <strong>repite el mismo monto</strong> abajo.
            </>
          )}
        </p>
        <label htmlFor="gf-modal-inversion-monto-confirm" className="gf-modal-label">
          Repite el monto
        </label>
        <input
          id="gf-modal-inversion-monto-confirm"
          type="text"
          inputMode="decimal"
          value={montoConfirm}
          onChange={(e) => {
            setMontoConfirm(formatMontoEnteroInput(e.target.value));
            setModalError(null);
          }}
          className={`gf-modal-input${modalError ? " gf-capital-input-error" : ""}`}
          disabled={saving}
          autoComplete="off"
        />
        {modalError && (
          <p className="gf-capital-input-msg-error" role="alert">
            {modalError}
          </p>
        )}
        <div className="gf-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirmar} disabled={saving}>
            {saving ? (
              <>
                <span className="gf-btn-spinner" aria-hidden />
                Registrando…
              </>
            ) : (
              "Confirmar inversión"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
