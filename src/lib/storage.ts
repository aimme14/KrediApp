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

/** Máximo lado de la imagen tras redimensionar (px). */
const IMAGE_MAX_DIMENSION = 1280;

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
  /**
   * "photo" (default): convierte a JPEG, max 1280px, calidad 0.72.
   * "logo": preserva PNG con transparencia; JPEG si es opaco.
   * "skip": sin compresión (para casos especiales).
   */
  imageProfile?: "photo" | "logo" | "skip";
}

async function comprimirImagen(
  file: File,
  profile: "photo" | "logo"
): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
        if (width > height) {
          height = Math.round((height * IMAGE_MAX_DIMENSION) / width);
          width = IMAGE_MAX_DIMENSION;
        } else {
          width = Math.round((width * IMAGE_MAX_DIMENSION) / height);
          height = IMAGE_MAX_DIMENSION;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      let tieneAlpha = false;
      if (profile === "logo" && file.type === "image/png") {
        const sample = ctx.getImageData(0, 0, Math.min(width, 64), Math.min(height, 64));
        for (let i = 3; i < sample.data.length; i += 4) {
          if (sample.data[i] < 255) {
            tieneAlpha = true;
            break;
          }
        }
      }

      const outputType =
        profile === "logo" && tieneAlpha ? "image/png" : "image/jpeg";
      const quality = outputType === "image/jpeg" ? 0.72 : 1;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          if (blob.size >= file.size) {
            resolve(file);
            return;
          }
          const ext = outputType === "image/jpeg" ? "jpg" : "png";
          const baseName = file.name.replace(/\.[^.]+$/, "");
          resolve(new File([blob], `${baseName}.${ext}`, { type: outputType }));
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
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
    imageProfile = "photo",
  } = options;

  const validTypes = acceptTypes.split(",").map((t) => t.trim());
  if (!validTypes.includes(file.type)) {
    throw new Error("Formato no válido. Usa JPG, PNG, WebP o GIF.");
  }

  if (file.size > maxSizeMB * 1024 * 1024 * 5) {
    throw new Error(`El archivo no debe superar ${maxSizeMB * 5} MB.`);
  }

  const fileParaSubir =
    imageProfile === "skip" ? file : await comprimirImagen(file, imageProfile);

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (fileParaSubir.size > maxBytes) {
    throw new Error(`El archivo no debe superar ${maxSizeMB} MB.`);
  }

  const ext = fileParaSubir.name.split(".").pop() || "jpg";
  const finalName = filename === "auto" ? `${Date.now()}.${ext}` : `${filename}.${ext}`;
  const path = `${folder}/${ownerId}/${finalName}`;

  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, fileParaSubir, { contentType: fileParaSubir.type });
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
