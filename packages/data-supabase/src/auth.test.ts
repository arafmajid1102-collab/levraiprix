import { describe, expect, it } from "vitest";
import {
  describeAuthError,
  normalizeCode,
  normalizeEmail,
  validateCode,
  validateEmail,
  validatePassword,
} from "./auth";

describe("validation des champs de compte", () => {
  it("accepte une adresse e-mail plausible, avec espaces et majuscules tolérés", () => {
    expect(validateEmail("  Marie.Dupont@Exemple.fr ")).toBeNull();
    expect(normalizeEmail("  Marie.Dupont@Exemple.fr ")).toBe("marie.dupont@exemple.fr");
  });

  it("refuse les adresses incomplètes", () => {
    for (const bad of ["", "marie", "marie@", "marie@exemple", "ma rie@exemple.fr"]) {
      expect(validateEmail(bad), bad).not.toBeNull();
    }
  });

  it("exige dix caractères de mot de passe", () => {
    expect(validatePassword("123456789")).not.toBeNull();
    expect(validatePassword("1234567890")).toBeNull();
  });

  it("accepte un code saisi avec des espaces", () => {
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(validateCode("123 456")).toBeNull();
    expect(validateCode("12345")).not.toBeNull();
  });
});

describe("messages d'erreur", () => {
  it("distingue l'adresse non confirmée pour rediriger vers la saisie du code", () => {
    expect(describeAuthError({ code: "email_not_confirmed" })).toMatchObject({ ok: false, reason: "unconfirmed" });
  });

  it("ne dit pas si c'est l'adresse ou le mot de passe qui est faux", () => {
    const result = describeAuthError({ code: "invalid_credentials" });
    expect(result).toMatchObject({ ok: false, message: "Adresse e-mail ou mot de passe incorrect." });
  });

  it("reconnaît une limite de débit et une panne réseau", () => {
    expect(describeAuthError({ status: 429 })).toMatchObject({ reason: "rate_limited" });
    expect(describeAuthError({ name: "AuthRetryableFetchError", status: 0 })).toMatchObject({ reason: "network" });
  });

  it("ne laisse jamais fuiter un message technique", () => {
    const result = describeAuthError({ code: "unexpected_failure", message: "pq: relation does not exist" });
    expect(result).toMatchObject({ reason: "other" });
    expect(JSON.stringify(result)).not.toContain("pq:");
  });
});
