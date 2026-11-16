/**
 * Identité de marque — PROVISOIRE.
 *
 * Le logo, l'icône et l'identité définitive seront choisis plus tard parmi
 * neuf propositions graphiques. Tout ce qui touche au nom ou au logotype doit
 * passer par ce fichier : aucun écran ne doit écrire « Le vrai prix » en dur.
 */
export const brand = {
  name: "Le vrai prix",
  /** Logotype typographique provisoire : partie neutre + partie accentuée. */
  wordmark: { lead: "Le vrai ", accent: "prix" },
  tagline: "Savoir ce qu'un produit coûte vraiment, où l'acheter et quand.",
  isProvisional: true,
} as const;

export type Brand = typeof brand;
