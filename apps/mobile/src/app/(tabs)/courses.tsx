import { Screen } from '@/ui/primitives';
import { ComingSoon } from '@/ui/states';

export default function ShoppingScreen() {
  return (
    <Screen>
      <ComingSoon
        title="Courses"
        intro="Des listes partagées, et le magasin où votre panier complet coûte réellement le moins cher."
        planned={[
          'Listes synchronisées entre les membres du foyer',
          'Coût total du panier par magasin',
          'Trajet et frais de livraison pris en compte avant toute recommandation',
        ]}
      />
    </Screen>
  );
}
