"use client";

import JefeGestionFinancieraPanel from "@/components/jefe/JefeGestionFinancieraPanel";

export default function InicioJefePage() {
  return (
    <div className="jefe-inicio-compact-wrap">
      <JefeGestionFinancieraPanel showPageHeader={false} />
    </div>
  );
}
