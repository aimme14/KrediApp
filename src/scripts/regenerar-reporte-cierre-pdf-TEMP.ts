/**
 * TEMPORAL — borrar si ya no lo necesitás (la UI tiene «Reintentar PDF»).
 *
 * npx tsx src/scripts/regenerar-reporte-cierre-pdf-TEMP.ts <empresaId> <reporteDiaId>
 */

import path from "path";
import dotenv from "dotenv";

for (const p of [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), ".env")]) {
  dotenv.config({ path: p });
}

async function main() {
  const empresaId = process.argv[2]?.trim();
  const reporteDiaId = process.argv[3]?.trim();
  if (!empresaId || !reporteDiaId) {
    console.error(
      "Uso: npx tsx src/scripts/regenerar-reporte-cierre-pdf-TEMP.ts <empresaId> <reporteDiaId>"
    );
    process.exit(1);
  }

  const { getAdminFirestore } = await import("@/lib/firebase-admin");
  const { regenerarPdfReporteCierreDia } = await import("@/lib/regenerar-reporte-cierre-pdf-admin");

  const db = getAdminFirestore();
  const { pdfStoragePath } = await regenerarPdfReporteCierreDia(db, empresaId, reporteDiaId);
  console.log("Listo:", pdfStoragePath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
