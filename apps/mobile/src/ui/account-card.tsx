import { PASSWORD_MIN_LENGTH, changePassword, deleteAccount, exportAccountData, signOut } from '@lvp/data-supabase';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { useAccount } from '@/lib/account';

import { ActionButton, Field, Notice, type NoticeValue } from './form';
import { Card, Text } from './primitives';
import { space, useTheme } from './theme';

/** Bloc « Compte » du profil : connexion, mot de passe, export et suppression des données. */
export function AccountCard() {
  const account = useAccount();
  const router = useRouter();
  const { color } = useTheme();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState<NoticeValue>(null);
  const [exportNotice, setExportNotice] = useState<NoticeValue>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<NoticeValue>(null);

  if (account.status === 'unavailable' || account.status === 'loading') {
    return (
      <Card>
        <Text variant="title">Compte</Text>
        <Text variant="small" tone="textMuted">
          {account.status === 'loading'
            ? 'Chargement…'
            : 'Les comptes ne sont pas disponibles en mode démonstration : aucune base de données n’est connectée.'}
        </Text>
      </Card>
    );
  }
  if (account.status === 'signedOut') {
    return (
      <Card>
        <Text variant="title">Compte</Text>
        <Text variant="small" tone="textMuted">
          Vous n’êtes pas connecté. La recherche et la comparaison des prix fonctionnent sans compte ; il servira à
          retrouver vos réglages sur tous vos appareils et à contribuer des prix.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm }}>
          <ActionButton label="Se connecter" onPress={() => router.push('/connexion')} />
          <ActionButton
            kind="secondary"
            label="Créer un compte"
            onPress={() => router.push({ pathname: '/connexion', params: { mode: 'signup' } })}
          />
        </View>
      </Card>
    );
  }

  const { client, email } = account;
  const divider = { borderTopWidth: 1, borderTopColor: color.border, paddingTop: space.lg, gap: space.md } as const;

  async function submitPassword() {
    setBusy(true);
    const result = await changePassword(client, password);
    setBusy(false);
    if (result.ok) setPassword('');
    setPasswordNotice(result.ok ? { tone: 'good', text: 'Mot de passe enregistré.' } : { tone: 'error', text: result.message });
  }

  async function shareExport() {
    setBusy(true);
    setExportNotice(null);
    try {
      const data = await exportAccountData(client);
      await Share.share({ title: 'Mes données — Le vrai prix', message: JSON.stringify(data, null, 2) });
    } catch (error) {
      setExportNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Export impossible.' });
    }
    setBusy(false);
  }

  async function confirmDelete() {
    setBusy(true);
    const result = await deleteAccount(client);
    setBusy(false);
    // En cas de succès la session se ferme et ce bloc repasse en « non connecté ».
    if (!result.ok) setDeleteNotice({ tone: 'error', text: result.message });
    setConfirmingDelete(false);
  }

  return (
    <Card>
      <Text variant="title">Compte</Text>
      <Text variant="small" tone="textMuted">
        Connecté avec {email}
      </Text>
      <ActionButton kind="secondary" label="Se déconnecter" disabled={busy} onPress={() => signOut(client)} />

      <View style={divider}>
        <Text variant="small" style={{ fontWeight: '600' }}>
          Contribuer
        </Text>
        <Text variant="small" tone="textMuted">
          Ajoutez un prix vu en magasin et suivez vos envois.
        </Text>
        <ActionButton kind="secondary" label="Ajouter un prix" onPress={() => router.push('/contribuer')} />
      </View>

      <View style={divider}>
        <Field
          label="Nouveau mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
          hint={`${PASSWORD_MIN_LENGTH} caractères au minimum.`}
        />
        <ActionButton kind="secondary" label="Enregistrer" disabled={busy} onPress={submitPassword} />
        <Notice notice={passwordNotice} />
      </View>

      <View style={divider}>
        <Text variant="small" style={{ fontWeight: '600' }}>
          Mes données
        </Text>
        <Text variant="small" tone="textMuted">
          Récupérez tout ce que nous conservons sur vous : compte, profil, favoris, magasins et prix contribués.
        </Text>
        <ActionButton kind="secondary" label="Exporter mes données" disabled={busy} onPress={shareExport} />
        <Notice notice={exportNotice} />
      </View>

      <View style={divider}>
        <Text variant="small" style={{ fontWeight: '600' }}>
          Supprimer mon compte
        </Text>
        <Text variant="small" tone="textMuted">
          Définitif. Votre profil, vos favoris et vos réglages sont effacés. Les prix que vous avez contribués
          restent dans le catalogue, sans aucun lien avec vous.
        </Text>
        {confirmingDelete ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <ActionButton
              kind="danger"
              label={busy ? 'Suppression…' : 'Oui, supprimer définitivement'}
              disabled={busy}
              onPress={confirmDelete}
            />
            <ActionButton kind="secondary" label="Annuler" disabled={busy} onPress={() => setConfirmingDelete(false)} />
          </View>
        ) : (
          <ActionButton kind="danger" label="Supprimer mon compte" disabled={busy} onPress={() => setConfirmingDelete(true)} />
        )}
        <Notice notice={deleteNotice} />
      </View>
    </Card>
  );
}
