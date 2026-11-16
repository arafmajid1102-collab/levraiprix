import { Screen } from '@/ui/primitives';
import { ComingSoon } from '@/ui/states';

export default function StocksScreen() {
  return (
    <Screen>
      <ComingSoon
        title="Stocks"
        intro="L’inventaire de votre foyer, pour savoir ce qu’il vous reste et éviter d’acheter en double."
        planned={[
          'Comptes et foyers (nécessaires pour enregistrer un inventaire)',
          'Ajout manuel et par code-barres, par emplacement',
          'Seuils d’alerte et durée restante estimée — toujours signalée comme estimation',
        ]}
      />
    </Screen>
  );
}
