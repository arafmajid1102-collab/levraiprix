import { isValidGtin, normalizeBarcode } from '@lvp/core';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, View } from 'react-native';

import { useCatalog } from '@/lib/catalog';
import { ActionButton, Field, Notice, type NoticeValue } from '@/ui/form';
import { Card, EmptyState, Loading, Screen, Text } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

/** Lecture d'un code-barres à la caméra, avec saisie manuelle toujours possible. */
export default function ScannerScreen() {
  const router = useRouter();
  const catalog = useCatalog();
  const { color } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [unknown, setUnknown] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeValue>(null);
  // La caméra signale le même code plusieurs fois par seconde : un seul traitement à la fois.
  const handling = useRef(false);

  function resolve(code: string) {
    if (catalog.state !== 'ready') return;
    const match = catalog.data.views.find((v) => v.product.barcode === code);
    if (match) router.replace({ pathname: '/produit/[id]', params: { id: match.product.id } });
    else setUnknown(code);
  }

  function onScanned(raw: string) {
    const code = normalizeBarcode(raw);
    if (handling.current || !isValidGtin(code)) return;
    handling.current = true;
    resolve(code);
  }

  function submitManual() {
    const code = normalizeBarcode(manual);
    if (!isValidGtin(code)) {
      return setNotice({ tone: 'error', text: 'Ce code-barres n’est pas valide : vérifiez les chiffres (8, 12, 13 ou 14).' });
    }
    setNotice(null);
    resolve(code);
  }

  if (catalog.state === 'loading') {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (catalog.state === 'error') {
    return (
      <Screen>
        <EmptyState title="Catalogue indisponible">
          <Text variant="small" tone="textMuted">
            Le catalogue n’a pas pu être chargé : impossible de reconnaître un produit pour l’instant.
          </Text>
          <ActionButton label="Réessayer" onPress={catalog.retry} />
        </EmptyState>
      </Screen>
    );
  }

  if (unknown) {
    return (
      <Screen>
        <EmptyState title="Produit inconnu">
          <Text variant="small" tone="textMuted">
            Le code-barres {unknown} n’est pas encore dans le catalogue. Vous pouvez l’ajouter avec son prix.
          </Text>
          <ActionButton
            label="Ajouter ce produit"
            onPress={() => router.replace({ pathname: '/contribuer', params: { code: unknown } })}
          />
          <ActionButton
            kind="secondary"
            label="Scanner un autre code"
            onPress={() => {
              handling.current = false;
              setManual('');
              setUnknown(null);
            }}
          />
        </EmptyState>
      </Screen>
    );
  }

  const frame = {
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.borderStrong,
    backgroundColor: color.bgSunken,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
  } as const;

  return (
    <Screen>
      {permission?.granted ? (
        <>
          <View style={[frame, { padding: 0 }]}>
            <CameraView
              style={{ width: '100%', height: '100%' }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={({ data }) => onScanned(data)}
            />
          </View>
          <Text variant="small" tone="textMuted">
            Placez le code-barres face à l’appareil. La lecture est automatique. L’image n’est ni envoyée ni
            enregistrée.
          </Text>
        </>
      ) : (
        <View style={frame}>
          {permission === null ? (
            <Loading />
          ) : permission.canAskAgain ? (
            <>
              <Text variant="small" tone="textMuted" style={{ textAlign: 'center' }}>
                Pour lire un code-barres, l’application a besoin de l’appareil photo. L’image reste sur votre
                téléphone.
              </Text>
              <ActionButton label="Autoriser l’appareil photo" onPress={() => void requestPermission()} />
            </>
          ) : (
            <>
              <Text variant="small" tone="textMuted" style={{ textAlign: 'center' }}>
                L’accès à l’appareil photo a été refusé. Autorisez-le dans les réglages, ou saisissez le code
                ci-dessous.
              </Text>
              <ActionButton kind="secondary" label="Ouvrir les réglages" onPress={() => void Linking.openSettings()} />
            </>
          )}
        </View>
      )}

      <Card>
        <Field
          label="Ou saisissez les chiffres du code-barres"
          value={manual}
          onChangeText={setManual}
          keyboardType="number-pad"
          maxLength={18}
          returnKeyType="search"
          onSubmitEditing={submitManual}
        />
        <ActionButton kind="secondary" label="Chercher" onPress={submitManual} />
        <Notice notice={notice} />
      </Card>
    </Screen>
  );
}
