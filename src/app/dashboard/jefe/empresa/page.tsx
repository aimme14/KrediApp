"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { getEmpresa, saveEmpresa, uploadLogo, getLogoAccept } from "@/lib/empresa";
import type { EmpresaProfile } from "@/types/empresa";

export default function PerfilEmpresaPage() {
  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EmpresaProfile>({
    nombre: "",
    logo: "",
    dueño: "",
    sedePrincipal: "",
  });

  useEffect(() => {
    if (!profile || profile.role !== "jefe") return;
    let cancelled = false;
    getEmpresa(profile.uid)
      .then((data) => {
        if (!cancelled && data) setForm(data);
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
    setSaving(true);
    try {
      await saveEmpresa(profile.uid, form);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <div className="card">
        <p>Cargando perfil de la empresa...</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Perfil de la empresa</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
        Configura el nombre, logo, dueño y sede principal de tu empresa.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Nombre de la empresa</label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej. Mi Empresa S.A."
          />
        </div>
        <div className="form-group">
          <label>Logo</label>
          <div className="empresa-logo-options">
            <div className="empresa-logo-upload">
              <input
                ref={fileInputRef}
                type="file"
                accept={getLogoAccept()}
                onChange={handleLogoFile}
                className="empresa-logo-file-input"
                aria-label="Cargar imagen del logo"
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
              >
                {uploadingLogo ? "Subiendo..." : "Cargar imagen"}
              </button>
              <span className="empresa-logo-hint">JPG, PNG, WebP o GIF (máx. 2 MB)</span>
            </div>
            <span className="empresa-logo-divider">o</span>
            <input
              type="url"
              value={form.logo}
              onChange={(e) => setForm((f) => ({ ...f, logo: e.target.value }))}
              placeholder="Pega una URL del logo (https://...)"
            />
          </div>
          {form.logo && (
            <div className="empresa-logo-preview">
              <img src={form.logo} alt="Vista previa del logo" />
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Dueño</label>
          <input
            type="text"
            value={form.dueño}
            onChange={(e) => setForm((f) => ({ ...f, dueño: e.target.value }))}
            placeholder="Nombre del dueño"
          />
        </div>
        <div className="form-group">
          <label>Sede principal</label>
          <input
            type="text"
            value={form.sedePrincipal}
            onChange={(e) => setForm((f) => ({ ...f, sedePrincipal: e.target.value }))}
            placeholder="Dirección o ciudad"
          />
        </div>
        {error && <p className="error-msg">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </form>
    </div>
  );
}
