"use client";

import { isValidGtin, normalizeBarcode } from "@lvp/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { findProductIdByBarcode } from "@/lib/actions";
import auth from "./auth.module.css";
import styles from "./scanner.module.css";
import ui from "./ui.module.css";

/** API de détection native du navigateur (Chrome, Edge, Android). Absente de Safari et Firefox. */
interface NativeBarcodeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorClass = (new (options: { formats: string[] }) => NativeBarcodeDetector) & {
  getSupportedFormats(): Promise<string[]>;
};
/** Formats des produits de grande consommation. Un UPC-A est aussi lu comme EAN-13 précédé d'un zéro. */
const WANTED_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

type Camera = "starting" | "live" | "unsupported" | "denied" | "unavailable" | "stopped";

const cameraMessage: Partial<Record<Camera, string>> = {
  starting: "Démarrage de la caméra…",
  unsupported: "Ce navigateur ne sait pas lire les codes-barres avec la caméra. Saisissez le code ci-dessous.",
  denied: "L'accès à la caméra a été refusé. Autorisez-le dans votre navigateur, ou saisissez le code ci-dessous.",
  unavailable: "Aucune caméra n'est disponible sur cet appareil. Saisissez le code ci-dessous.",
  stopped: "Caméra arrêtée.",
};

/** Lecture d'un code-barres à la caméra, avec saisie manuelle toujours possible. */
export function BarcodeScanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<Camera>("starting");
  const [attempt, setAttempt] = useState(0);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);

  async function resolve(code: string) {
    setBusy(true);
    setError(null);
    try {
      const id = await findProductIdByBarcode(code);
      if (id) router.push(`/produit/${id}`);
      else setUnknown(code);
    } catch {
      setError("La recherche n'a pas abouti. Vérifiez votre connexion et réessayez.");
    }
    setBusy(false);
  }
  // Le rappel de détection vit plus longtemps qu'un rendu : il lit toujours la dernière version.
  const onCode = useRef(resolve);
  useEffect(() => {
    onCode.current = resolve;
  });

  const scanning = unknown === null;
  useEffect(() => {
    if (!scanning) return;
    const Detector = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
    if (!Detector) {
      // Différé d'un tic : l'état ne se modifie pas pendant la mise en place de l'effet.
      const timer = setTimeout(() => setCamera("unsupported"));
      return () => clearTimeout(timer);
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    (async () => {
      // Demander un format que le navigateur ne connaît pas ferait échouer la création du détecteur.
      const supported = await Detector.getSupportedFormats().catch(() => [] as string[]);
      const formats = WANTED_FORMATS.filter((format) => supported.includes(format));
      if (formats.length === 0) {
        if (!cancelled) setCamera("unsupported");
        return;
      }
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("no camera", "NotFoundError");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (reason) {
        if (!cancelled) setCamera((reason as DOMException).name === "NotAllowedError" ? "denied" : "unavailable");
        return;
      }
      if (cancelled || !video.current) return stream.getTracks().forEach((track) => track.stop());
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      setCamera("live");
      const detector = new Detector({ formats });
      let reading = false;
      timer = setInterval(async () => {
        if (reading || !video.current || video.current.readyState < 2) return;
        reading = true;
        try {
          const found = (await detector.detect(video.current)).map((c) => normalizeBarcode(c.rawValue)).find(isValidGtin);
          if (found && !cancelled) {
            clearInterval(timer);
            void onCode.current(found);
          }
        } catch {
          // Une image illisible n'est pas une erreur : on réessaie à la suivante.
        }
        reading = false;
      }, 250);
    })();
    return () => {
      cancelled = true;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning, attempt]);

  function submitManual(event: FormEvent) {
    event.preventDefault();
    const code = normalizeBarcode(manual);
    if (!isValidGtin(code)) return setError("Ce code-barres n'est pas valide : vérifiez les chiffres (8, 12, 13 ou 14).");
    void resolve(code);
  }

  if (unknown) {
    return (
      <section className={ui.empty}>
        <h2>Produit inconnu</h2>
        <p>
          Le code-barres <span className="num">{unknown}</span> n&apos;est pas encore dans le catalogue. Vous pouvez
          l&apos;ajouter avec son prix.
        </p>
        <div className={auth.row}>
          <Link href={`/contribuer?code=${unknown}`} className={ui.button}>
            Ajouter ce produit
          </Link>
          <button
            type="button"
            className={auth.secondary}
            onClick={() => {
              setUnknown(null);
              setManual("");
              setCamera("starting");
              setAttempt((n) => n + 1);
            }}
          >
            Scanner un autre code
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.viewport} data-live={camera === "live" || undefined}>
        <video ref={video} muted playsInline aria-label="Image de la caméra" hidden={camera !== "live"} />
        {camera !== "live" ? (
          <p className={styles.status} role="status">
            {cameraMessage[camera]}
          </p>
        ) : null}
      </div>
      {camera === "live" ? (
        <p className={auth.note} role="status">
          {busy ? "Code lu, recherche du produit…" : "Placez le code-barres dans le cadre. La lecture est automatique."}
        </p>
      ) : null}
      <form className={`${ui.card} ${styles.manual}`} onSubmit={submitManual} noValidate>
        <div className={auth.field}>
          <label htmlFor="manual-code">Ou saisissez les chiffres du code-barres</label>
          <input id="manual-code" className={auth.input} value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" maxLength={18} autoComplete="off" />
        </div>
        <button type="submit" className={auth.secondary} disabled={busy}>
          Chercher
        </button>
      </form>
      {error ? (
        <p className={auth.message} data-tone="error" role="alert">
          {error}
        </p>
      ) : null}
      <p className={auth.note}>L&apos;image de la caméra est analysée sur votre appareil ; elle n&apos;est ni envoyée ni enregistrée.</p>
    </div>
  );
}
