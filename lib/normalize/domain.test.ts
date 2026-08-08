import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email.ts";
import { hostFrom, normalizeDomain } from "./domain.ts";

describe("hostFrom", () => {
  it("reduces every spelling of a website to one host", () => {
    for (const input of [
      "acme.example",
      "www.acme.example",
      "https://acme.example",
      "http://www.acme.example/",
      "https://www.acme.example/about?utm=x#team",
      "HTTPS://ACME.EXAMPLE",
      "acme.example.",
      "acme.example:8080",
      "  acme.example  ",
    ]) {
      expect(hostFrom(input), input).toBe("acme.example");
    }
  });

  it("recovers a host from an email address in the wrong column", () => {
    expect(hostFrom("bob@acme.example")).toBe("acme.example");
  });

  it("rejects anything that is not host-shaped", () => {
    for (const input of ["", "   ", "acme", "localhost", "-.example", "not a host"]) {
      expect(hostFrom(input), input).toBeUndefined();
    }
  });
});

describe("normalizeDomain", () => {
  const noEmail = normalizeEmail(undefined);

  it("prefers an explicit website column", () => {
    const domain = normalizeDomain("https://northstar.example", normalizeEmail("bob@acme.example"));
    expect(domain).toEqual({ value: "northstar.example", source: "website" });
  });

  it("falls back to a corporate email domain", () => {
    const domain = normalizeDomain(undefined, normalizeEmail("bob@acme.example"));
    expect(domain).toEqual({ value: "acme.example", source: "email" });
  });

  it("refuses a consumer mailbox as a company domain", () => {
    // The rule that keeps the signal meaningful. Let `gmail.com` through and
    // every person with a personal address shares a "company" with every other,
    // while the match rules go on weighting domain equality heavily.
    expect(normalizeDomain(undefined, normalizeEmail("bobreyes82@gmail.com"))).toEqual({
      source: "none",
    });
    expect(normalizeDomain("https://www.gmail.com", noEmail)).toEqual({ source: "none" });
  });

  it("ignores a website column someone filled in with their webmail", () => {
    const domain = normalizeDomain("yahoo.co.uk", normalizeEmail("bob@acme.example"));
    expect(domain).toEqual({ value: "acme.example", source: "email" });
  });

  it("does not take a domain from a shared inbox", () => {
    // `info@acme.example` does identify the company — but it reaches the record
    // through the company name, not by making a role address look like a person
    // with an employer. Keeping the two apart is what stops a role row from
    // acquiring the domain signal that helps merges.
    expect(normalizeDomain(undefined, normalizeEmail("info@acme.example"))).toEqual({
      source: "none",
    });
  });

  it("reports no domain rather than an empty one", () => {
    expect(normalizeDomain(undefined, noEmail)).toEqual({ source: "none" });
    expect(normalizeDomain("not a host", normalizeEmail("bad-email"))).toEqual({ source: "none" });
  });
});
