"use client";

import {
  formatDate,
  formatPrice,
  formatUnitPrice,
  statusLabel,
  type ComparisonBasis,
  type HistoryPoint,
} from "@lvp/core";
import { useMemo, useState } from "react";
import styles from "./price-history-chart.module.css";

export interface ChartSeries {
  storeId: string;
  storeName: string;
  points: HistoryPoint[];
}

const W = 760;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 30, left: 62 };

interface Plotted {
  series: number;
  x: number;
  y: number;
  point: HistoryPoint;
}

/**
 * Historique des prix unitaires constatés, une courbe par magasin.
 * Chaque point est une observation réelle ; les estimations sont dessinées en creux.
 */
export function PriceHistoryChart({ series, basis }: { series: ChartSeries[]; basis: ComparisonBasis }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<Plotted | null>(null);

  const { plotted, paths, yTicks, xTicks } = useMemo(() => {
    const visible = series
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !hidden.has(s.storeId));
    const all = visible.flatMap(({ s }) => s.points.filter((p) => p.unitPriceCents !== null));
    if (all.length === 0) return { plotted: [], paths: [], yTicks: [], xTicks: [] };

    const times = all.map((p) => new Date(p.observedAt).getTime());
    const values = all.map((p) => p.unitPriceCents!);
    const [t0, t1] = [Math.min(...times), Math.max(...times)];
    const span = Math.max(...values) - Math.min(...values) || Math.max(...values) * 0.1 || 1;
    const [v0, v1] = [Math.min(...values) - span * 0.15, Math.max(...values) + span * 0.15];
    const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - ((v - v0) / (v1 - v0)) * (H - PAD.top - PAD.bottom);

    const plotted: Plotted[] = [];
    const paths = visible.map(({ s, i }) => {
      const pts = s.points
        .filter((p) => p.unitPriceCents !== null)
        .map((point) => {
          const item = { series: i, x: x(new Date(point.observedAt).getTime()), y: y(point.unitPriceCents!), point };
          plotted.push(item);
          return item;
        });
      return { series: i, d: pts.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") };
    });
    const yTicks = [0, 1, 2, 3].map((k) => {
      const v = v0 + ((v1 - v0) * k) / 3;
      return { y: y(v), label: formatUnitPrice({ basis, cents: v }).split(" / ")[0]! };
    });
    const xTicks = [0, 0.5, 1].map((k) => {
      const t = t0 + (t1 - t0) * k;
      return { x: x(t), label: formatDate(new Date(t).toISOString()) };
    });
    return { plotted, paths, yTicks, xTicks };
  }, [series, hidden, basis]);

  function nearest(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const py = ((event.clientY - rect.top) / rect.height) * H;
    let best: Plotted | null = null;
    let bestDistance = Infinity;
    for (const p of plotted) {
      const d = (p.x - px) ** 2 + ((p.y - py) * 0.6) ** 2;
      if (d < bestDistance) [best, bestDistance] = [p, d];
    }
    setActive(best);
  }

  return (
    <figure className={styles.figure}>
      <div className={styles.legend}>
        {series.map((s, i) => {
          const off = hidden.has(s.storeId);
          return (
            <button
              key={s.storeId}
              type="button"
              className={styles.legendItem}
              aria-pressed={!off}
              onClick={() => {
                const next = new Set(hidden);
                if (off) next.delete(s.storeId);
                else next.add(s.storeId);
                setHidden(next);
                setActive(null);
              }}
            >
              <i style={{ background: `var(--chart-${(i % 4) + 1})` }} />
              {s.storeName}
            </button>
          );
        })}
      </div>

      <div className={styles.plot}>
        {plotted.length === 0 ? (
          <p className={styles.none}>Sélectionnez au moins un magasin pour afficher l&apos;historique.</p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Évolution du prix unitaire constaté par magasin. Le détail figure dans le tableau ci-dessous."
            onPointerMove={nearest}
            onPointerDown={nearest}
            onPointerLeave={() => setActive(null)}
          >
            {yTicks.map((t) => (
              <g key={t.y}>
                <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y} className={styles.grid} />
                <text x={PAD.left - 10} y={t.y + 4} textAnchor="end" className={styles.tick}>
                  {t.label}
                </text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text
                key={t.x}
                x={t.x}
                y={H - 8}
                textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                className={styles.tick}
              >
                {t.label}
              </text>
            ))}
            {paths.map((p) => (
              <path key={p.series} d={p.d} className={styles.line} stroke={`var(--chart-${(p.series % 4) + 1})`} />
            ))}
            {plotted.map((p) => {
              const color = `var(--chart-${(p.series % 4) + 1})`;
              const estimated = p.point.status === "estimated";
              return (
                <circle
                  key={`${p.series}-${p.point.observedAt}`}
                  cx={p.x}
                  cy={p.y}
                  r={p === active ? 6 : p.point.isPromo ? 4.5 : 3}
                  fill={estimated ? "var(--color-surface)" : color}
                  stroke={p.point.isPromo ? "var(--color-text)" : color}
                  strokeWidth={p.point.isPromo || estimated ? 1.5 : 0}
                  strokeDasharray={estimated ? "2 2" : undefined}
                />
              );
            })}
            {active ? (
              <line x1={active.x} x2={active.x} y1={PAD.top} y2={H - PAD.bottom} className={styles.cursor} />
            ) : null}
          </svg>
        )}
        {active ? (
          <div
            className={styles.tooltip}
            style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}
            data-flip={active.x > W * 0.62 || undefined}
          >
            <strong>{series[active.series]!.storeName}</strong>
            <span className="num">{formatUnitPrice({ basis, cents: active.point.unitPriceCents! })}</span>
            <span>
              {formatPrice(active.point.priceCents)} · {formatDate(active.point.observedAt)}
            </span>
            <span>
              {statusLabel[active.point.status]}
              {active.point.isPromo ? " · en promotion" : ""}
            </span>
          </div>
        ) : null}
      </div>

      <figcaption className={styles.caption}>
        Chaque point est un prix relevé. Points cerclés : prix présentés comme promotionnels.
      </figcaption>

      <details className={styles.table}>
        <summary>Voir les relevés sous forme de tableau</summary>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">Magasin</th>
                <th scope="col">Date</th>
                <th scope="col">Prix</th>
                <th scope="col">Prix unitaire</th>
                <th scope="col">Nature</th>
              </tr>
            </thead>
            <tbody>
              {series.flatMap((s) =>
                [...s.points].reverse().map((p) => (
                  <tr key={`${s.storeId}-${p.observedAt}`}>
                    <td>{s.storeName}</td>
                    <td>{formatDate(p.observedAt)}</td>
                    <td className="num">{formatPrice(p.priceCents)}</td>
                    <td className="num">
                      {p.unitPriceCents === null ? "—" : formatUnitPrice({ basis, cents: p.unitPriceCents })}
                    </td>
                    <td>
                      {statusLabel[p.status]}
                      {p.isPromo ? " (promotion)" : ""}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
