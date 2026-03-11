"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { getEmpresa, saveEmpresa, uploadLogo, getLogoAccept } from "@/lib/empresa";
import type { EmpresaProfile } from "@/types/empresa";

/** Genera iniciales: "Mi Empresa S.A." → "ME" (máx. 2 caracteres). */
function getInicialesNombre(texto: string): string {
  const partes = texto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** Iniciales para dueño: "Josué Pérez" → "JP". */
function getInicialesDueño(texto: string): string {
  const partes = texto.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const ICON_SIZE = 20;

function IconBuilding() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconMapPin() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconDiscard() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

export default function PerfilEmpresaPage() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState<EmpresaProfile>({
    nombre: "",
    logo: "",
    dueño: "",
    sedePrincipal: "",
  });
  const [initialForm, setInitialForm] = useState<EmpresaProfile | null>(null);
  const [activa, setActiva] = useState<boolean>(true);

  useEffect(() => {
    if (!profile || profile.role !== "jefe") return;
    let cancelled = false;
    getEmpresa(profile.uid)
      .then((data) => {
        if (cancelled || !data) return;
        setForm(data);
        setInitialForm(data);
        setActiva(data.activa !== false);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setSuccess(false);
    if (!form.nombre.trim()) {
      setError("El nombre de la empresa es obligatorio.");
      return;
    }
    if (!form.dueño.trim()) {
      setError("El dueño es obligatorio.");
      return;
    }
    if (!form.sedePrincipal.trim()) {
      setError("La sede principal es obligatoria.");
      return;
    }
    setSaving(true);
    try {
      await saveEmpresa(profile.uid, form);
      setInitialForm(form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (initialForm) {
      setForm(initialForm);
      setError(null);
      setSuccess(false);
    }
  };

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    e.target.value = "";
    setError(null);
    setUploadingLogo(true);
    try {
      const url = await uploadLogo(profile.uid, file);
      setForm((f) => ({ ...f, logo: url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir la imagen");
    } finally {
      setUploadingLogo(false);
    }
  };

  const displayDueño = form.dueño.trim() || profile?.displayName || "";
  const inicialesEmpresa = form.nombre.trim() ? getInicialesNombre(form.nombre) : "";

  if (loading) {
    return (
      <div className="card perfil-empresa-card">
        <div className="perfil-empresa-loading" role="status" aria-live="polite">
          <div className="perfil-empresa-loading-avatar" />
          <div className="perfil-empresa-loading-title" />
          <div className="perfil-empresa-loading-desc" />
          <div className="perfil-empresa-loading-field" />
          <div className="perfil-empresa-loading-field" />
          <div className="perfil-empresa-loading-field" />
          <span className="visually-hidden">Cargando perfil de la empresa...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card perfil-empresa-card">
      <header className="perfil-empresa-header">
        <div
          className="perfil-empresa-avatar"
          role="img"
          aria-label={form.logo ? "Logo de la empresa" : inicialesEmpresa ? `Iniciales: ${inicialesEmpresa}` : "Sin logo"}
        >
          {form.logo ? (
            <img src={form.logo} alt="" />
          ) : (
            <span className="perfil-empresa-avatar-iniciales">
              {inicialesEmpresa || <IconBuilding />}
            </span>
          )}
        </div>
        <div className="perfil-empresa-header-text">
          <h1 className="perfil-empresa-title">Perfil de la empresa</h1>
          <p className="perfil-empresa-desc">Configura nombre, logo, dueño y sede principal.</p>
        </div>
        <span
          className={`perfil-empresa-badge ${activa ? "perfil-empresa-badge-activa" : "perfil-empresa-badge-inactiva"}`}
          aria-label={activa ? "Empresa activa" : "Empresa inactiva"}
        >
          <span className="perfil-empresa-badge-dot" aria-hidden />
          {activa ? "ACTIVA" : "INACTIVA"}
        </span>
      </header>

      <form onSubmit={handleSubmit} className="perfil-empresa-form" noValidate>
        <div className="perfil-empresa-field perfil-empresa-field-anim" style={{ animationDelay: "0.05s" }}>
          <label htmlFor="perfil-empresa-nombre" className="perfil-empresa-label">
            NOMBRE DE LA EMPRESA *
          </label>
          <div className="perfil-empresa-input-wrap">
            <input
              id="perfil-empresa-nombre"
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej. Mi Empresa S.A."
              className="perfil-empresa-input perfil-empresa-input-with-icon-end"
              autoComplete="organization"
              aria-required="true"
              aria-invalid={!!(error && !form.nombre.trim())}
            />
            <span className="perfil-empresa-input-icon perfil-empresa-input-icon-end" aria-hidden>
              <IconHome />
            </span>
          </div>
        </div>

        <div className="perfil-empresa-field perfil-empresa-field-anim" style={{ animationDelay: "0.1s" }}>
          <label className="perfil-empresa-label">LOGO DE LA EMPRESA</label>
          <div className="perfil-empresa-logo-row">
            <div className="perfil-empresa-logo-preview-box">
              {form.logo ? (
                <img src={form.logo} alt="Vista previa del logo" className="perfil-empresa-logo-preview-img" />
              ) : (
                <div className="perfil-empresa-logo-empty" aria-hidden>
                  <IconImage />
                  <span>Preview</span>
                </div>
              )}
            </div>
            <div className="perfil-empresa-logo-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept={getLogoAccept()}
                onChange={handleLogoFile}
                className="perfil-empresa-file-input"
                aria-label="Cargar imagen del logo"
              />
              <button
                type="button"
                className="btn btn-secondary perfil-empresa-btn-upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                title="Cargar imagen desde tu dispositivo"
              >
                <IconUpload aria-hidden />
                {uploadingLogo ? "Subiendo..." : "CARGAR IMAGEN"}
              </button>
              <span className="perfil-empresa-hint">JPG, PNG, WebP o GIF · Máx. 2 MB</span>
            </div>
          </div>
        </div>

        <div className="perfil-empresa-field perfil-empresa-field-anim" style={{ animationDelay: "0.15s" }}>
          <label htmlFor="perfil-empresa-dueño" className="perfil-empresa-label">
            DUEÑO *
          </label>
          <div className="perfil-empresa-input-wrap perfil-empresa-input-wrap-with-avatar">
            <span className="perfil-empresa-dueño-avatar" aria-hidden>
              {getInicialesDueño(displayDueño)}
            </span>
            <input
              id="perfil-empresa-dueño"
              type="text"
              value={form.dueño}
              onChange={(e) => setForm((f) => ({ ...f, dueño: e.target.value }))}
              placeholder="Nombre del dueño"
              className="perfil-empresa-input perfil-empresa-input-with-avatar"
              aria-required="true"
              aria-invalid={!!(error && !form.dueño.trim())}
            />
          </div>
        </div>

        <div className="perfil-empresa-field perfil-empresa-field-anim" style={{ animationDelay: "0.2s" }}>
          <label htmlFor="perfil-empresa-sede" className="perfil-empresa-label">
            SEDE PRINCIPAL *
          </label>
          <div className="perfil-empresa-input-wrap">
            <input
              id="perfil-empresa-sede"
              type="text"
              value={form.sedePrincipal}
              onChange={(e) => setForm((f) => ({ ...f, sedePrincipal: e.target.value }))}
              placeholder="Ciudad o dirección"
              className="perfil-empresa-input perfil-empresa-input-with-icon-end"
              autoComplete="street-address"
              aria-required="true"
              aria-invalid={!!(error && !form.sedePrincipal.trim())}
            />
            <span className="perfil-empresa-input-icon perfil-empresa-input-icon-end" aria-hidden>
              <IconMapPin />
            </span>
          </div>
        </div>

        {error && (
          <div className="perfil-empresa-msg perfil-empresa-msg-error" role="alert">
            {error}
          </div>
        )}
        {success && (
          <div className="perfil-empresa-msg perfil-empresa-msg-success" role="status">
            Cambios guardados correctamente.
          </div>
        )}

        <footer className="perfil-empresa-footer">
          <span className="perfil-empresa-required-hint">* Campos requeridos</span>
          <div className="perfil-empresa-actions">
            <button
              type="button"
              className="btn btn-secondary perfil-empresa-btn-discard"
              onClick={handleDiscard}
              disabled={!initialForm || saving}
              title="Descartar cambios y restaurar valores guardados"
            >
              <IconDiscard aria-hidden />
              Descartar
            </button>
            <button
              type="submit"
              className="btn btn-primary perfil-empresa-btn-save"
              disabled={saving}
              title="Guardar cambios"
            >
              <IconSave aria-hidden />
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
