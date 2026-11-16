/**
 * Prépare une photo de preuve avant l'envoi : réduite à 1600 px au plus et
 * réencodée en JPEG. Le réencodage retire aussi les métadonnées de l'appareil
 * (dont la position GPS), qui ne quittent donc jamais le navigateur.
 */
const MAX_SIDE = 1600;

export async function prepareProofPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choisissez une image.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Cette image n'a pas pu être lue. Essayez une photo JPEG ou PNG.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("Cette image n'a pas pu être préparée.");
  return blob;
}
