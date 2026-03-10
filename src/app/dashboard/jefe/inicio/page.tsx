"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getEmpresa } from "@/lib/empresa";

export default function InicioJefePage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [nombre, setNombre] = useState("");
  const [logo, setLogo] = useState("");

  useEffect(() => {
    if (!profile || profile.role !== "jefe") return;
    let cancelled = false;
    getEmpresa(profile.uid)
      .then((data) => {
        if (!cancelled && data) {
          setNombre(data.nombre || "");
          setLogo(data.logo || "");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile]);

  if (loading) {
    return (
      <div className="card">
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="card jefe-inicio-card">
      <div className="jefe-inicio-header">
        {logo ? (
          <div className="jefe-inicio-logo-wrap">
            <img src={logo} alt="" className="jefe-inicio-logo" />
          </div>
        ) : (
          <div className="jefe-inicio-logo-placeholder" aria-hidden>
            <span className="jefe-inicio-logo-icon">🏢</span>
          </div>
        )}
        <h1 className="jefe-inicio-nombre">
          {nombre || "Mi empresa"}
        </h1>
        {!nombre && !logo && (
          <p className="jefe-inicio-hint">
            Configura el nombre y el logo en{" "}
            <Link href="/dashboard/jefe/empresa">Perfil de la empresa</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
