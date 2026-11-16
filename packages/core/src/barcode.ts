/** Ne garde que les chiffres d'une saisie de code-barres. */
export function normalizeBarcode(input: string): string {
  return input.replace(/\D/g, "");
}

/** Valide la clé de contrôle d'un EAN-8, UPC-A (12), EAN-13 ou GTIN-14. */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
