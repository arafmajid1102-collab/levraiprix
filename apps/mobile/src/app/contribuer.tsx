import { formatDate, formatPrice, formatQuantity, type BrandType, type ContentUnit } from '@lvp/core';
import {
  contentUnitLabel,
  getContributableProduct,
  listContributableStores,
  listMySubmissions,
  proofKindLabel,
  proposeProduct,
  proposeStore,
  reviewStatusLabel,
  reviewSubmission,
  searchContributableProducts,
  submitPrice,
  toDateInput,
  uploadProof,
  validatePriceDraft,
  validateProductDraft,
  validateStoreDraft,
  type ContributableProduct,
  type ContributableStore,
  type PriceDraft,
  type ProductDraft,
  type ProofKind,
  type StoreDraft,
  type Submission,
} from '@lvp/data-supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { useAccount } from '@/lib/account';
import { refreshCatalog, useCatalog } from '@/lib/catalog';
import { pickProofPhoto, type ProofPhoto } from '@/lib/photo';
import { ActionButton, Field, Notice, type NoticeValue } from '@/ui/form';
import { Badge, Card, EmptyState, Loading, Screen, Text } from '@/ui/primitives';
import { radius, space, useTheme } from '@/ui/theme';

const emptyProduct: ProductDraft = {
  name: '',
  brand: '',
  brandType: 'national',
  categoryId: '',
  barcode: '',
  amount: '',
  unit: 'l',
  packCount: '',
  usesCount: '',
};
const emptyStore: StoreDraft = { retailer: '', name: '', postalCode: '', city: '' };
const daysAgo = (n: number) => toDateInput(new Date(Date.now() - n * 86_400_000));
const emptyPrice = (): PriceDraft => ({ price: '', observedOn: daysAgo(0), isPromo: false, referencePrice: '', promoLabel: '' });

const storeLabel = (s: ContributableStore) =>
  `${s.retailerName === 'Indépendant' ? '' : `${s.retailerName} — `}${s.name}, ${s.postalCode} ${s.city}${s.pending ? ' (en attente)' : ''}`;

/** Choix unique parmi quelques options, sous forme de pastilles. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | '';
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  const { color } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="small" style={{ fontWeight: '600' }}>
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map(([option, text]) => {
          const selected = option === value;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: selected ? color.accent : color.borderStrong,
                backgroundColor: selected ? color.accentSoft : 'transparent',
              }}>
              <Text variant="small" tone={selected ? 'accentText' : 'textMuted'} style={{ fontWeight: '600' }}>
                {text}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Row({ title, detail, onPress }: { title: string; detail?: string; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        padding: space.md,
        borderWidth: 1,
        borderColor: color.border,
        borderRadius: radius.md,
        gap: 2,
        opacity: pressed ? 0.75 : 1,
      })}>
      <Text style={{ fontWeight: '600' }}>{title}</Text>
      {detail ? (
        <Text variant="small" tone="textSubtle">
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

const statusTone = { pending: 'info', accepted: 'good', rejected: 'danger' } as const;

export default function ContributeScreen() {
  const { produit, code } = useLocalSearchParams<{ produit?: string; code?: string }>();
  // Code-barres transmis par le scanner : le produit est inconnu, on ouvre directement sa création.
  const scanned = /^\d{8,14}$/.test(code ?? '') ? code! : '';
  const router = useRouter();
  const account = useAccount();
  const catalog = useCatalog();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContributableProduct[] | null>(null);
  const [product, setProduct] = useState<ContributableProduct | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(scanned !== '');
  const [productDraft, setProductDraft] = useState<ProductDraft>({ ...emptyProduct, barcode: scanned });

  const [stores, setStores] = useState<ContributableStore[] | null>(null);
  const [storeId, setStoreId] = useState('');
  const [addingStoreChosen, setAddingStoreChosen] = useState(false);
  const [storeDraft, setStoreDraft] = useState<StoreDraft>(emptyStore);

  const [price, setPrice] = useState<PriceDraft>(emptyPrice);
  const [photo, setPhoto] = useState<ProofPhoto | null>(null);
  const [proofKind, setProofKind] = useState<ProofKind>('shelf_label');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeValue>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [sent, setSent] = useState(0);

  const client = account.status === 'signedIn' ? account.client : null;
  const userId = account.status === 'signedIn' ? account.userId : null;

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    listContributableStores(client).then((result) => {
      if (cancelled) return;
      if (result.ok) setStores(result.value);
      else setNotice({ tone: 'error', text: result.message });
    });
    if (produit) getContributableProduct(client, produit).then((found) => !cancelled && found && setProduct(found));
    return () => {
      cancelled = true;
    };
  }, [client, produit]);

  useEffect(() => {
    if (!client || !userId) return;
    let cancelled = false;
    listMySubmissions(client, userId).then((result) => !cancelled && result.ok && setSubmissions(result.value));
    return () => {
      cancelled = true;
    };
  }, [client, userId, sent]);

  if (account.status === 'unavailable') {
    return (
      <Screen>
        <EmptyState title="Indisponible en mode démonstration">
          <Text variant="small" tone="textMuted">
            Aucune base de données n’est connectée : la contribution n’est pas possible.
          </Text>
        </EmptyState>
      </Screen>
    );
  }
  if (account.status === 'loading') {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (account.status === 'signedOut') {
    return (
      <Screen>
        <EmptyState title="Connectez-vous pour ajouter un prix">
          <Text variant="small" tone="textMuted">
            Un compte est nécessaire pour contribuer : chaque relevé est relu avant d’être publié.
          </Text>
          <ActionButton label="Se connecter" onPress={() => router.push('/connexion')} />
        </EmptyState>
      </Screen>
    );
  }

  const session = account.client;
  const { moderator } = account;
  const categories = catalog.state === 'ready' ? catalog.data.categories : [];
  const category = categories.find((c) => c.id === productDraft.categoryId);
  const addingStore = addingStoreChosen || stores?.length === 0;
  const chosenStore = stores?.find((s) => s.id === storeId);

  const setP = (patch: Partial<ProductDraft>) => setProductDraft((d) => ({ ...d, ...patch }));
  const setS = (patch: Partial<StoreDraft>) => setStoreDraft((d) => ({ ...d, ...patch }));
  const setV = (patch: Partial<PriceDraft>) => setPrice((d) => ({ ...d, ...patch }));

  async function addPhoto(source: 'camera' | 'library') {
    setNotice(null);
    try {
      const picked = await pickProofPhoto(source);
      if (picked) setPhoto(picked);
    } catch (reason) {
      setNotice({ tone: 'error', text: reason instanceof Error ? reason.message : 'Cette photo n’a pas pu être préparée.' });
    }
  }

  async function search() {
    setBusy(true);
    setNotice(null);
    const result = await searchContributableProducts(session, query);
    setBusy(false);
    if (result.ok) setResults(result.value);
    else setNotice({ tone: 'error', text: result.message });
  }

  async function submit() {
    const stop = (text: string) => setNotice({ tone: 'error', text });
    setNotice(null);

    // Tout est contrôlé avant le premier envoi : rien n'est créé si une saisie est fausse.
    if (!product && !creatingProduct) return stop('Choisissez un produit, ou ajoutez-le s’il n’existe pas encore.');
    const newProduct = product ? null : validateProductDraft(productDraft);
    if (newProduct && !newProduct.ok) return stop(newProduct.message);
    if (!addingStore && !storeId) return stop('Choisissez le magasin où vous avez vu ce prix.');
    const newStore = addingStore ? validateStoreDraft(storeDraft) : null;
    if (newStore && !newStore.ok) return stop(newStore.message);
    const checkedPrice = validatePriceDraft(price);
    if (!checkedPrice.ok) return stop(checkedPrice.message);

    setBusy(true);
    try {
      let productId = product?.id;
      let quantity = product?.quantity;
      if (newProduct?.ok) {
        const created = await proposeProduct(session, newProduct.value);
        if (!created.ok) return stop(created.message);
        productId = created.value;
        const saved = await getContributableProduct(session, created.value);
        quantity = saved?.quantity ?? {
          amount: newProduct.value.amount,
          unit: newProduct.value.unit,
          packCount: newProduct.value.packCount,
          ...(newProduct.value.usesCount ? { usesCount: newProduct.value.usesCount } : {}),
        };
        if (saved) setProduct(saved);
        setCreatingProduct(false);
      }
      let finalStoreId = storeId;
      if (newStore?.ok) {
        const created = await proposeStore(session, newStore.value);
        if (!created.ok) return stop(created.message);
        finalStoreId = created.value;
        const refreshed = await listContributableStores(session);
        if (refreshed.ok) setStores(refreshed.value);
        setStoreId(finalStoreId);
        setAddingStoreChosen(false);
        setStoreDraft(emptyStore);
      }
      const me = account.status === 'signedIn' ? account.userId : '';
      let proof: { path: string; kind: ProofKind } | undefined;
      if (photo) {
        const uploaded = await uploadProof(session, me, photo.data, 'image/jpeg');
        if (!uploaded.ok) return stop(uploaded.message);
        proof = { path: uploaded.value, kind: proofKind };
      }
      const saved = await submitPrice(session, {
        userId: me,
        productId: productId!,
        storeId: finalStoreId,
        quantity: quantity!,
        price: checkedPrice.value,
        proof,
      });
      if (!saved.ok) return stop(saved.message);

      // Un modérateur publie directement ses propres relevés.
      let published = false;
      if (moderator) {
        published = (await reviewSubmission(session, saved.value, true)).ok;
        if (published) refreshCatalog();
      }
      setPrice(emptyPrice());
      setPhoto(null);
      setSent((n) => n + 1);
      setNotice({
        tone: 'good',
        text: published
          ? 'Prix publié. Il est visible dans le catalogue.'
          : 'Merci ! Votre relevé est enregistré. Il sera visible de tous après validation.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text variant="small" tone="textMuted">
        Indiquez un prix que vous avez vu en magasin. Chaque relevé est relu avant d’être publié.
      </Text>

      <Card>
        <Text variant="title">1 · Le produit</Text>
        {product ? (
          <>
            <View style={{ gap: 2 }}>
              <Text style={{ fontWeight: '600' }}>{product.name}</Text>
              <Text variant="small" tone="textSubtle">
                {product.brandName} · {formatQuantity(product.quantity)}
                {product.pending ? ' · en attente de validation' : ''}
              </Text>
            </View>
            <ActionButton kind="secondary" label="Changer" disabled={busy} onPress={() => setProduct(null)} />
          </>
        ) : creatingProduct ? (
          <>
            <Field label="Nom du produit" hint="Tel qu’il figure sur l’emballage." value={productDraft.name} onChangeText={(name) => setP({ name })} maxLength={200} autoCapitalize="sentences" />
            <Field label="Marque" value={productDraft.brand} onChangeText={(brand) => setP({ brand })} maxLength={80} autoCapitalize="words" />
            <Choice<BrandType>
              label="Type de marque"
              value={productDraft.brandType}
              onChange={(brandType) => setP({ brandType })}
              options={[
                ['national', 'Marque nationale'],
                ['private_label', 'Marque de distributeur'],
              ]}
            />
            <Choice
              label="Catégorie"
              value={productDraft.categoryId}
              onChange={(categoryId) => setP({ categoryId })}
              options={categories.map((c) => [c.id, c.name] as const)}
            />
            <Field label="Code-barres (facultatif)" value={productDraft.barcode} onChangeText={(barcode) => setP({ barcode })} keyboardType="number-pad" maxLength={18} />
            <Field label="Contenance" placeholder="1,5" value={productDraft.amount} onChangeText={(amount) => setP({ amount })} keyboardType="decimal-pad" />
            <Choice<ContentUnit>
              label="Unité"
              value={productDraft.unit}
              onChange={(unit) => setP({ unit })}
              options={(Object.keys(contentUnitLabel) as ContentUnit[]).map((unit) => [unit, contentUnitLabel[unit]] as const)}
            />
            <Field label="Articles dans le lot" placeholder="1" value={productDraft.packCount} onChangeText={(packCount) => setP({ packCount })} keyboardType="number-pad" />
            {category?.comparisonBasis === 'per_wash' ? (
              <Field label="Nombre de lavages" hint="Indiqué sur l’emballage, par article." value={productDraft.usesCount} onChangeText={(usesCount) => setP({ usesCount })} keyboardType="number-pad" />
            ) : null}
            <ActionButton kind="secondary" label="Revenir à la recherche" disabled={busy} onPress={() => setCreatingProduct(false)} />
          </>
        ) : (
          <>
            <Field label="Nom du produit ou code-barres" value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={search} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <ActionButton kind="secondary" label="Chercher" disabled={busy} onPress={search} />
              <ActionButton kind="secondary" label="Scanner" disabled={busy} onPress={() => router.push('/scanner')} />
            </View>
            {results
              ? results.length > 0
                ? results.map((p) => (
                    <Row
                      key={p.id}
                      title={p.name}
                      detail={`${p.brandName} · ${formatQuantity(p.quantity)}${p.pending ? ' · en attente de validation' : ''}`}
                      onPress={() => setProduct(p)}
                    />
                  ))
                : (
                    <Text variant="small" tone="textMuted">
                      Aucun produit trouvé.
                    </Text>
                  )
              : null}
            <ActionButton
              kind="secondary"
              label="Mon produit n’est pas dans la liste"
              disabled={busy}
              onPress={() => {
                setCreatingProduct(true);
                setP(/^\d{8,14}$/.test(query.trim()) ? { barcode: query.trim() } : { name: query.trim() });
              }}
            />
          </>
        )}
      </Card>

      <Card>
        <Text variant="title">2 · Le magasin</Text>
        {stores === null ? (
          <Loading />
        ) : addingStore ? (
          <>
            {stores.length === 0 ? (
              <Text variant="small" tone="textMuted">
                Aucun magasin n’est encore enregistré : ajoutez le vôtre.
              </Text>
            ) : null}
            <Field label="Enseigne" hint="Laissez vide pour un commerce indépendant." value={storeDraft.retailer} onChangeText={(retailer) => setS({ retailer })} maxLength={80} autoCapitalize="words" />
            <Field label="Nom du magasin" hint="Par exemple le quartier ou la rue." value={storeDraft.name} onChangeText={(name) => setS({ name })} maxLength={120} autoCapitalize="words" />
            <Field label="Code postal" value={storeDraft.postalCode} onChangeText={(postalCode) => setS({ postalCode })} keyboardType="number-pad" maxLength={5} autoComplete="postal-code" />
            <Field label="Ville" value={storeDraft.city} onChangeText={(city) => setS({ city })} maxLength={80} autoCapitalize="words" />
            {stores.length > 0 ? (
              <ActionButton kind="secondary" label="Choisir un magasin existant" disabled={busy} onPress={() => setAddingStoreChosen(false)} />
            ) : null}
          </>
        ) : chosenStore ? (
          <>
            <Text style={{ fontWeight: '600' }}>{storeLabel(chosenStore)}</Text>
            <ActionButton kind="secondary" label="Changer" disabled={busy} onPress={() => setStoreId('')} />
          </>
        ) : (
          <>
            {stores.map((s) => (
              <Row key={s.id} title={storeLabel(s)} onPress={() => setStoreId(s.id)} />
            ))}
            <ActionButton kind="secondary" label="Ajouter un magasin" disabled={busy} onPress={() => setAddingStoreChosen(true)} />
          </>
        )}
      </Card>

      <Card>
        <Text variant="title">3 · Le prix</Text>
        <Field
          label="Prix affiché (€)"
          hint="Le prix du conditionnement entier, pas le prix au litre."
          placeholder="3,49"
          value={price.price}
          onChangeText={(value) => setV({ price: value })}
          keyboardType="decimal-pad"
        />
        <Choice
          label="Date du relevé"
          value={price.observedOn}
          onChange={(observedOn) => setV({ observedOn })}
          options={[
            [daysAgo(0), 'Aujourd’hui'],
            [daysAgo(1), 'Hier'],
            [daysAgo(2), 'Avant-hier'],
          ]}
        />
        <Choice
          label="Ce prix était-il présenté comme une promotion ?"
          value={price.isPromo ? 'oui' : 'non'}
          onChange={(answer) => setV({ isPromo: answer === 'oui' })}
          options={[
            ['non', 'Non'],
            ['oui', 'Oui'],
          ]}
        />
        {price.isPromo ? (
          <>
            <Field
              label="Prix barré annoncé (€)"
              hint="Facultatif. Il sert à vérifier si la promotion est réelle."
              value={price.referencePrice}
              onChangeText={(referencePrice) => setV({ referencePrice })}
              keyboardType="decimal-pad"
            />
            <Field label="Mention de la promotion" placeholder="−30 %, 2+1 offert…" value={price.promoLabel} onChangeText={(promoLabel) => setV({ promoLabel })} maxLength={80} />
          </>
        ) : null}
        <View style={{ gap: space.sm }}>
          <Text variant="small" style={{ fontWeight: '600' }}>
            Photo de l’étiquette ou du ticket (facultatif)
          </Text>
          {photo ? (
            <>
              <Image source={{ uri: photo.uri }} accessibilityLabel="Photo jointe au relevé" resizeMode="contain" style={{ width: '100%', height: 200, borderRadius: radius.md }} />
              <Choice<ProofKind>
                label="Que montre la photo ?"
                value={proofKind}
                onChange={setProofKind}
                options={(Object.keys(proofKindLabel) as ProofKind[]).map((kind) => [kind, proofKindLabel[kind]] as const)}
              />
              <ActionButton kind="secondary" label="Retirer la photo" disabled={busy} onPress={() => setPhoto(null)} />
            </>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <ActionButton kind="secondary" label="Prendre une photo" disabled={busy} onPress={() => addPhoto('camera')} />
              <ActionButton kind="secondary" label="Choisir une photo" disabled={busy} onPress={() => addPhoto('library')} />
            </View>
          )}
          <Text variant="small" tone="textMuted">
            {photo
              ? 'Elle n’est vue que par vous et par la personne qui valide ; sa localisation a été retirée.'
              : 'Avec une photo, le prix peut être affiché comme « confirmé ». Sans photo, il reste un « prix constaté ».'}
          </Text>
        </View>
        <Notice notice={notice} />
        <ActionButton stretch label={busy ? 'Envoi…' : moderator ? 'Publier ce prix' : 'Envoyer ce prix'} disabled={busy} onPress={submit} />
      </Card>

      {submissions.length > 0 ? (
        <View style={{ gap: space.md }}>
          <Text variant="heading">Mes envois</Text>
          {submissions.map((item) => (
            <Card key={item.id}>
              <View style={{ gap: 2 }}>
                <Text style={{ fontWeight: '600' }}>{item.productName}</Text>
                <Text variant="small" tone="textSubtle">
                  {item.storeLabel} · relevé du {formatDate(item.observedAt)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
                <Text variant="price">{formatPrice(item.priceCents)}</Text>
                <Badge label={reviewStatusLabel[item.status]} tone={statusTone[item.status]} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
