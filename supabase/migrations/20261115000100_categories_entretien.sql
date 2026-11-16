-- Référentiel initial : catégories de produits d'entretien et leur base de comparaison.
-- Ce sont des données de référence réelles (pas des données de démonstration).
insert into public.categories (slug, name, comparison_basis, fallback_basis) values
  ('lessives', 'Lessives', 'per_wash', 'per_litre'),
  ('liquides-vaisselle', 'Liquides vaisselle', 'per_litre', null),
  ('produits-menagers', 'Produits ménagers', 'per_litre', null),
  ('nettoyants-sols', 'Nettoyants pour sols', 'per_litre', null),
  ('salle-de-bain', 'Salle de bain', 'per_litre', null),
  ('desinfectants', 'Désinfectants', 'per_litre', null),
  ('eponges-accessoires', 'Éponges et accessoires', 'per_unit', null),
  ('sacs-poubelle', 'Sacs-poubelle', 'per_unit', null),
  ('entretien-specialise', 'Entretien spécialisé', 'per_litre', null)
on conflict (slug) do nothing;
