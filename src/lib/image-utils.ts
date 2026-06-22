/**
 * Captura un frame de video como JPEG comprimido.
 * Centraliza la lógica para evitar duplicación en cobrar/gastos/jefe.
 */
export function captureVideoFrameAsJpeg(
  video: HTMLVideoElement,
  filename: string,
  quality = 0.72
): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas no disponible"));
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo generar la imagen"));
          return;
        }
        const baseName = filename.replace(/\.[^.]+$/, "");
        resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      quality
    );
  });
}
