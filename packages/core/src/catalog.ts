import type { Category, DataSource, PriceObservation, Product, Store } from "./types";

export interface ProductQuery {
  text?: string;
  categoryId?: string;
}

/**
 * Contrat d'accès au catalogue. Les écrans ne connaissent que cette interface :
 * on peut brancher le jeu de démonstration, Supabase ou un autre fournisseur
 * sans modifier l'interface utilisateur.
 */
export interface CatalogRepository {
  /** Nature du jeu de données servi — affichée à l'utilisateur. */
  readonly dataset: { kind: "demo" | "live"; label: string };
  listCategories(): Promise<Category[]>;
  listStores(): Promise<Store[]>;
  listSources(): Promise<DataSource[]>;
  searchProducts(query: ProductQuery): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  getProductByBarcode(barcode: string): Promise<Product | null>;
  listObservations(productId: string): Promise<PriceObservation[]>;
}
