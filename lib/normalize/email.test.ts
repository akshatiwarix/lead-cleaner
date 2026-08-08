import { describe, expect, it } from "vitest";
import { identifiesCompany, identifiesPerson, normalizeEmail } from "./email.ts";

describe("normalizeEmail", () => {
  it("trims, lower-cases and unwraps display forms", () => {
    expect(normalizeEmail("  Bob.Reyes@Acme.Example  ").normalized).toBe("bob.reyes@acme.example");
    expect(normalizeEmail("mailto:bob@acme.example").normalized).toBe("bob@acme.example");
    expect(normalizeEmail('"Reyes, Bob" <bob@acme.example>').normalized).toBe("bob@acme.example");
  });

  it("drops a +tag, which routes to the same mailbox", () => {
    const tagged = normalizeEmail("b.reyes+webinar@acme.example");
    expect(tagged.canonical).toBe("b.reyes@acme.example");
    expect(tagged.normalized).toBe("b.reyes+webinar@acme.example");
    expect(tagged.notes.some((note) => note.rule.includes("+tag"))).toBe(true);
  });

  it("drops dots only where the provider ignores them", () => {
    // Gmail treats these as one mailbox.
    expect(normalizeEmail("b.reyes@gmail.com").canonical).toBe("breyes@gmail.com");
    // Everywhere else a dot is a different address, and removing it would merge
    // two people who happen to have similar local parts.
    expect(normalizeEmail("b.reyes@acme.example").canonical).toBe("b.reyes@acme.example");
  });

  it("keeps the original alongside the canonical form", () => {
    // Canonicalisation has to be visible: a user who cannot see that the tool
    // rewrote the address cannot audit a merge that turned on it.
    const email = normalizeEmail("B.Reyes+list@GoogleMail.com");
    expect(email.normalized).toBe("b.reyes+list@googlemail.com");
    expect(email.canonical).toBe("breyes@googlemail.com");
    // Four separate decisions, each one recoverable from the notes: the case
    // fold, the dropped tag, the dropped dots, and the freemail classification.
    expect(email.notes.map((note) => note.rule)).toEqual([
      "trimmed and lower-cased the address",
      "dropped the +tag, which routes to the same mailbox",
      "dropped dots, which googlemail.com ignores",
      "consumer mailbox, so it identifies a person but not an employer",
    ]);
  });

  it("classifies a corporate address as personal", () => {
    const email = normalizeEmail("adaeze.okafor@northstar.example");
    expect(email.kind).toBe("personal");
    expect(identifiesPerson(email.kind)).toBe(true);
    expect(identifiesCompany(email.kind)).toBe(true);
  });

  it("classifies a shared inbox as a role, not a person", () => {
    for (const address of [
      "info@acme.example",
      "SALES@acme.example",
      "no-reply@acme.example",
      "customer.service@acme.example",
      "sales+eu@acme.example",
    ]) {
      const email = normalizeEmail(address);
      expect(email.kind, address).toBe("role");
      expect(identifiesPerson(email.kind), address).toBe(false);
    }
  });

  it("classifies a consumer mailbox as a person but not a company", () => {
    const email = normalizeEmail("bobreyes82@gmail.com");
    expect(email.kind).toBe("freemail");
    // The distinction the whole type exists for: it is one human's mailbox, so
    // two records sharing it are the same human — but it says nothing about
    // where that human works.
    expect(identifiesPerson(email.kind)).toBe(true);
    expect(identifiesCompany(email.kind)).toBe(false);
  });

  it("rejects malformed addresses instead of guessing at them", () => {
    for (const address of [
      "not-an-email",
      "two@@acme.example",
      "spaces in@acme.example",
      "bob@acme",
      "bob@.example",
      "@acme.example",
      "bob@acme.example, alice@acme.example",
    ]) {
      expect(normalizeEmail(address).kind, address).toBe("invalid");
    }
  });

  it("rejects a local part that canonicalises to nothing", () => {
    expect(normalizeEmail("+tag@acme.example").kind).toBe("invalid");
    expect(normalizeEmail("...@gmail.com").kind).toBe("invalid");
  });

  it("reports a missing address as missing rather than invalid", () => {
    // Different failure, different handling downstream: a row with no email can
    // still match on phone, where a row with a broken one has a data problem.
    for (const input of [undefined, "", "   "]) {
      expect(normalizeEmail(input).kind).toBe("missing");
    }
  });

  it("accepts international domains and local parts", () => {
    expect(normalizeEmail("jose.munoz@grupo-solar.example").kind).toBe("personal");
    expect(normalizeEmail("wei.chen@长城.example").kind).toBe("personal");
  });

  it("gives two spellings of the same mailbox one canonical form", () => {
    // The pair the dataset uses to prove alias handling.
    const dotted = normalizeEmail("b.reyes@gmail.com");
    const tagged = normalizeEmail("breyes+crm@gmail.com");
    expect(dotted.canonical).toBe(tagged.canonical);
  });
});
