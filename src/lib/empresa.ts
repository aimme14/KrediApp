import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import { uploadImage, getImageAccept, IMAGE_ACCEPT, IMAGE_MAX_SIZE_MB } from "./storage";
import type { EmpresaProfile } from "@/types/empresa";
import { EMPRESAS_COLLECTION } from "./empresas-db";

export async function getEmpresa(jefeUid: string): Promise<EmpresaProfile | null> {
  if (!db) return null;
  const docRef = doc(db, EMPRESAS_COLLECTION, jefeUid);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    nombre: d.nombre ?? "",
    logo: d.logo ?? "",
    dueño: d.dueño ?? "",
    sedePrincipal: d.sedePrincipal ?? "",
    activa: d.activa !== false,
  };
}

export async function saveEmpresa(jefeUid: string, data: EmpresaProfile): Promise<void> {
  const res = await fetch("/api/jefe/empresa", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jefeUid, ...data }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Error al guardar");
}

export function getLogoAccept(): string {
  return getImageAccept(IMAGE_ACCEPT);
}

/**
 * Sube una imagen como logo de la empresa a Firebase Storage y devuelve la URL pública.
 */
export async function uploadLogo(jefeUid: string, file: File): Promise<string> {
  return uploadImage(file, {
    folder: "empresas",
    ownerId: jefeUid,
    filename: "logo",
    acceptTypes: IMAGE_ACCEPT,
    maxSizeMB: IMAGE_MAX_SIZE_MB,
  });
}
