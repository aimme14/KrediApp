/**
 * Utilidades para subir y gestionar imágenes en Firebase Storage.
 * Reutilizable en cualquier parte de la aplicación.
 */

import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebase";

/** Formatos de imagen permitidos por defecto */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** Tamaño máximo por defecto: 2 MB */
export const IMAGE_MAX_SIZE_MB = 2;

export interface UploadImageOptions {
  /** Carpeta base (ej: "empresas", "avatars", "documentos") */
  folder: string;
  /** ID del propietario o contexto (ej: jefeUid, usuarioId) */
  ownerId: string;
  /** Nombre del archivo (sin extensión) o "auto" para generar uno único */
  filename?: string;
  /** Tipos MIME permitidos */
  acceptTypes?: string;
  /** Tamaño máximo en MB */
  maxSizeMB?: number;
}

/**
 * Sube una imagen a Firebase Storage y devuelve la URL pública de descarga.
 *
 * @example
 * // Logo de empresa
 * const url = await uploadImage(file, { folder: "empresas", ownerId: jefeUid, filename: "logo" });
 *
 * @example
 * // Avatar de usuario (nombre automático)
 * const url = await uploadImage(file, { folder: "avatars", ownerId: userId });
 */
export async function uploadImage(file: File, options: UploadImageOptions): Promise<string> {
  if (!storage) throw new Error("Firebase Storage no está disponible");

  const {
    folder,
    ownerId,
    filename = "auto",
    acceptTypes = IMAGE_ACCEPT,
    maxSizeMB = IMAGE_MAX_SIZE_MB,
  } = options;

  // Validar tipo
  const validTypes = acceptTypes.split(",").map((t) => t.trim());
  if (!validTypes.includes(file.type)) {
    throw new Error("Formato no válido. Usa JPG, PNG, WebP o GIF.");
  }

  // Validar tamaño
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`El archivo no debe superar ${maxSizeMB} MB.`);
  }

  const ext = file.name.split(".").pop() || "jpg";
  const finalName = filename === "auto" ? `${Date.now()}.${ext}` : `${filename}.${ext}`;
  const path = `${folder}/${ownerId}/${finalName}`;

  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  return getDownloadURL(storageRef);
}

/**
 * Extrae la ruta del bucket a partir de una URL de descarga de Firebase Storage.
 */
function getPathFromDownloadUrl(url: string): string | null {
  const match = url.match(/\/o\/(.+?)\?/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

/**
 * Elimina un archivo de Storage dada su URL completa de descarga.
 * Útil cuando el usuario cambia o elimina una imagen.
 */
export async function deleteImageByUrl(url: string): Promise<void> {
  if (!storage) throw new Error("Firebase Storage no está disponible");
  const path = getPathFromDownloadUrl(url);
  if (!path) throw new Error("URL de Firebase Storage no válida");
  const storageRef = ref(storage, path);
  await deleteObject(storageRef);
}

/**
 * Obtiene el atributo `accept` para inputs de tipo file.
 */
export function getImageAccept(acceptTypes = IMAGE_ACCEPT): string {
  return acceptTypes;
}
