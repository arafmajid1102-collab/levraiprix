/** Minuscule, sans accents ni ponctuation : « Éponges » → « eponges ». */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Vrai si chaque mot de la requête apparaît (en préfixe de mot) dans le texte. */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalizeText(haystack).split(" ");
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}
