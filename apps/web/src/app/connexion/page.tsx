import type { Metadata } from "next";
import { AuthFlow } from "@/components/auth-flow";
import ui from "@/components/ui.module.css";

export const metadata: Metadata = { title: "Se connecter" };

export default function Page() {
  return (
    <main className="page">
      <header className={ui.pageHead}>
        <h1>Se connecter</h1>
        <p>Retrouvez votre compte sur cet appareil.</p>
      </header>
      <AuthFlow mode="signin" />
    </main>
  );
}
