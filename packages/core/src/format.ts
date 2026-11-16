import type { Quantity, UnitPrice } from "./types";
import { basisLabel } from "./units";

const NBSP = " ";

function formatAmount(cents: number, decimals: number): string {
  const sign = cents < 0 ? "-" : "";
  const fixed = (Math.abs(cents) / 100).toFixed(decimals);
  const [int = "0", frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped}${frac ? `,${frac}` : ""}${NBSP}€`;
}

/** « 3,49 € » */
export function formatPrice(cents: number): string {
  return formatAmount(Math.round(cents), 2);
}

/** « 0,18 € / lavage » — trois décimales sous 10 centimes pour rester comparable. */
export function formatUnitPrice(unitPrice: UnitPrice): string {
  const decimals = unitPrice.cents < 10 ? 3 : 2;
  return `${formatAmount(unitPrice.cents, decimals)} / ${basisLabel[unitPrice.basis]}`;
}

/** « −12 % » / « +3 % » */
export function formatPercent(ratio: number): string {
  const pct = Math.round(ratio * 100);
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct)}${NBSP}%`;
}

/** « aujourd'hui », « hier », « il y a 12 jours », « il y a 3 mois » */
export function formatRelativeDay(iso: string, now: Date): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 60) return `il y a ${days} jours`;
  const months = Math.floor(days / 30);
  if (months < 24) return `il y a ${months} mois`;
  return `il y a ${Math.floor(days / 365)} ans`;
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 4 nov. 2026 » (en UTC, pour un rendu identique serveur/client). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const UNIT_TEXT = { l: "L", ml: "ml", kg: "kg", g: "g" } as const;

/** « 1,5 L », « 3 × 750 ml », « 20 unités », « 1,5 L · 30 lavages » */
export function formatQuantity(quantity: Quantity): string {
  const { amount, unit, packCount, usesCount } = quantity;
  const unitText = unit === "unit" ? (amount > 1 ? "unités" : "unité") : UNIT_TEXT[unit];
  const base = `${packCount > 1 ? `${packCount} × ` : ""}${String(amount).replace(".", ",")} ${unitText}`;
  return usesCount ? `${base} · ${usesCount * packCount} lavages` : base;
}
