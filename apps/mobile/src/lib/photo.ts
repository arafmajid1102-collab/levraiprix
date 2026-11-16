import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface ProofPhoto {
  data: ArrayBuffer;
  /** Aperçu local, jamais envoyé tel quel. */
  uri: string;
}

/**
 * Prend ou choisit une photo de preuve, puis la réduit à 1600 px et la
 * réencode en JPEG : les métadonnées de l'appareil (dont la position GPS) ne
 * quittent pas le téléphone. Renvoie null si l'utilisateur annule.
 */
export async function pickProofPhoto(source: 'camera' | 'library'): Promise<ProofPhoto | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('L’accès à l’appareil photo est refusé. Autorisez-le dans les réglages du téléphone.');
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], exif: false, quality: 1 };
  const picked =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;

  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > 1600 || asset.height > 1600) {
    context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  const data = await (await fetch(saved.uri)).arrayBuffer();
  return { data, uri: saved.uri };
}
