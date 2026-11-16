import type { Metadata } from "next";
import { AuthFlow } from "@/components/auth-flow";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Créer un compte" };

export default function Page() {
  return (
    <main className="page">
      <header className={ui.pageHead}>
        <h1>Créer un compte</h1>
        <p>Gratuit. L&apos;application reste utilisable sans compte.</p>
      </header>
      <AuthFlow mode="signup" />
    </main>
  );
}
