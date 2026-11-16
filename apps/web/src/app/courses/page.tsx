import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Courses" };

export default function CoursesPage() {
  return (
    <ComingSoon
      title="Courses"
      intro="Des listes partagées, et le magasin où votre panier complet coûte réellement le moins cher."
      phase="phase 4"
      planned={[
        "Listes de courses synchronisées entre les membres du foyer",
        "Comparaison du coût total du panier par magasin",
        "Prise en compte du trajet et des frais de livraison avant de recommander un magasin",
      ]}
    />
  );
}
