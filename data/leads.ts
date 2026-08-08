/**
 * The demo dataset: 150 rows, engineered rather than sampled.
 *
 * A random messy export would prove nothing. Every row here is annotated with
 * the `scenario` it exists to exercise, and every row carries a `truePersonId` —
 * the ground truth that makes the precision and recall numbers in the README
 * measurable rather than asserted.
 *
 * The **hard negatives** are the point. It is easy to build a dataset of true
 * duplicates and score 100% recall on it; the rows that matter are the ones that
 * *look* like duplicates and are not:
 *
 *   - a father and son sharing a name and an employer, told apart only by `Jr.`
 *   - two Wei Chens at one company
 *   - two people behind one `info@` inbox
 *   - two people on one switchboard, told apart only by extension
 *   - Alexander and Alexandra Novak, whose names are 0.96 similar
 *   - `J. Okafor` in a company that employs both a Jane and a John Okafor
 *   - the same name at two employers, where a job change and two different
 *     people are indistinguishable from the row alone
 *
 * Every domain is under `.example`, reserved by RFC 2606 and unregistrable, so no
 * row can ever point at a real company or a real mailbox. `data/leads.test.ts`
 * enforces that, along with the scenario coverage this file claims.
 *
 * Phone numbers use the `555-01xx` range reserved for fiction.
 */

import type { InputRow } from "../lib/clean/types.ts";

/** A row as it would arrive from a CSV, plus the two annotations. */
export type Lead = {
  id: string;
  /** Ground truth. Rows sharing this are the same human. */
  truePersonId: string;
  /** What this row proves. Keep it accurate — the dataset test reads these. */
  scenario: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  website?: string;
  title?: string;
  source?: string;
  updatedAt?: string;
};

// ---------------------------------------------------------------------------
// A. Duplicates the engine should find
// ---------------------------------------------------------------------------

const MERGES: Lead[] = [
  // Identical mailbox, written twice with different casing and a legal suffix.
  { id: "r001", truePersonId: "p001", scenario: "exact-duplicate", fullName: "Wei Chen", email: "wei.chen@cobalt.example", phone: "(555) 019-1001", company: "Cobalt Analytics", title: "Data Engineering Manager", source: "crm-export", updatedAt: "2026-02-04" },
  { id: "r002", truePersonId: "p001", scenario: "exact-duplicate", fullName: "wei chen", email: "WEI.CHEN@Cobalt.Example", phone: "555.019.1001", company: "cobalt analytics inc", title: "Data Engineering Manager", source: "form-fill", updatedAt: "2026-01-12" },

  // One mailbox at a dot-insensitive provider, spelled two ways, with a nickname.
  { id: "r003", truePersonId: "p002", scenario: "alias-dots", fullName: "Bob Reyes", email: "b.reyes@mailbox.example", phone: "(555) 019-1002", company: "Acme Robotics", title: "Sales Manager", source: "event-list", updatedAt: "2025-11-30" },
  { id: "r004", truePersonId: "p002", scenario: "alias-dots", fullName: "Robert Reyes", email: "breyes@mailbox.example", company: "Acme Robotics", title: "Regional Sales Manager", source: "crm-export", updatedAt: "2026-02-02" },

  // A +tag from a webinar signup routes to the same mailbox.
  { id: "r005", truePersonId: "p003", scenario: "alias-plus-tag", fullName: "Hana Sato", email: "hana.sato+webinar@hokusai.example", company: "Hokusai Trading", title: "Head of Partnerships", source: "event-list", updatedAt: "2026-03-18" },
  { id: "r006", truePersonId: "p003", scenario: "alias-plus-tag", fullName: "Hana Sato", email: "hana.sato@hokusai.example", phone: "(555) 019-1003", company: "Hokusai Trading", title: "Head of Partnerships", source: "crm-export", updatedAt: "2026-01-08" },

  // Different corporate addresses; the shared line and a nickname carry the merge.
  { id: "r007", truePersonId: "p004", scenario: "nickname-plus-phone", fullName: "Bill Trent", email: "bill.trent@kestrel.example", phone: "(555) 019-1004", company: "Kestrel Freight", title: "Operations Lead", source: "purchased-list", updatedAt: "2025-10-02" },
  { id: "r008", truePersonId: "p004", scenario: "nickname-plus-phone", fullName: "William Trent", email: "w.trent@kestrel.example", phone: "555-019-1004", company: "Kestrel Freight", title: "Director of Operations", source: "crm-export", updatedAt: "2026-04-21" },

  // A misspelled surname, rescued by a shared line.
  { id: "r009", truePersonId: "p005", scenario: "typo-with-phone", fullName: "Jonathon Ellery", email: "j.ellery@vega.example", phone: "(555) 019-1005", company: "Vega Logistics", title: "Fleet Analyst", source: "enrichment", updatedAt: "2026-02-27" },
  { id: "r010", truePersonId: "p005", scenario: "typo-with-phone", fullName: "Johnathon Ellery", email: "jellery@vega.example", phone: "555 019 1005", company: "Vega Logistics", title: "Fleet Analyst", source: "crm-export", updatedAt: "2026-05-30" },

  // The same typo with no phone: nothing authoritative, so it must go to review.
  { id: "r011", truePersonId: "p006", scenario: "typo-review-only", fullName: "Marguerite Dubois", email: "m.dubois@nordwind.example", company: "Nordwind Energie", title: "Grid Planner", source: "purchased-list", updatedAt: "2025-08-19" },
  { id: "r012", truePersonId: "p006", scenario: "typo-review-only", fullName: "Marguerite Duboise", email: "marguerite.duboise@nordwind.example", company: "Nordwind Energie GmbH", title: "Grid Planner", source: "event-list", updatedAt: "2026-06-04" },

  // An initials-only row, disambiguated by phone — the company employs a John too.
  { id: "r013", truePersonId: "p007", scenario: "initials-disambiguated-by-phone", fullName: "Jane Okafor", email: "jane.okafor@meridian.example", phone: "(555) 019-1007", company: "Meridian Health", title: "Clinical Data Lead", source: "crm-export", updatedAt: "2026-03-11" },
  { id: "r014", truePersonId: "p007", scenario: "initials-disambiguated-by-phone", fullName: "J. Okafor", phone: "555.019.1007", company: "Meridian Health", source: "purchased-list", updatedAt: "2025-12-01" },

  // Nothing wrong but whitespace, case, and an inverted `Last, First`.
  { id: "r015", truePersonId: "p008", scenario: "formatting-only", fullName: "  DIEGO   MORALES ", email: "DIEGO.MORALES@SOLARIS.EXAMPLE  ", phone: "(555) 019-1008", company: "Solaris Renewables", title: "PROCUREMENT MANAGER", source: "event-list", updatedAt: "2026-01-22" },
  { id: "r016", truePersonId: "p008", scenario: "formatting-only", fullName: "Morales, Diego", email: "diego.morales@solaris.example", phone: "555 019 1008", company: "solaris renewables", title: "Procurement Manager", source: "crm-export", updatedAt: "2026-02-15" },

  // One spelling keeps its diacritics; the other lost them in an export.
  { id: "r017", truePersonId: "p009", scenario: "accent-folding", fullName: "José Múñoz", email: "jose.munoz@gruposolar.example", phone: "(555) 019-1009", company: "Grupo Solar", title: "Ingeniero de Ventas", source: "crm-export", updatedAt: "2026-04-02" },
  { id: "r018", truePersonId: "p009", scenario: "accent-folding", fullName: "Jose Munoz", email: "j.munoz@gruposolar.example", phone: "555-019-1009", company: "Grupo Solar S.A.", title: "Sales Engineer", source: "enrichment", updatedAt: "2026-04-30" },

  // An honorific and a credential wrapped around an otherwise identical row.
  { id: "r019", truePersonId: "p010", scenario: "honorific-and-credentials", fullName: "Dr. Priya Raman, PhD", email: "priya.raman@ramantex.example", phone: "(555) 019-1010", company: "Raman Textiles", title: "Head of Materials Research", source: "enrichment", updatedAt: "2026-02-09" },
  { id: "r020", truePersonId: "p010", scenario: "honorific-and-credentials", fullName: "Priya Raman", email: "priya.raman@ramantex.example", company: "Raman Textiles Pvt Ltd", title: "Head of Materials Research", source: "crm-export", updatedAt: "2026-03-25" },

  // A changed surname. The mailbox is the identity; the name is what moved.
  { id: "r021", truePersonId: "p011", scenario: "surname-change-same-mailbox", fullName: "Sanne van der Berg", email: "s.vanderberg@blueharbor.example", phone: "(555) 019-1011", company: "Blue Harbor Marine", title: "Naval Architect", source: "purchased-list", updatedAt: "2025-07-14" },
  { id: "r022", truePersonId: "p011", scenario: "surname-change-same-mailbox", fullName: "Sanne Visser", email: "s.vanderberg@blueharbor.example", phone: "(555) 019-1011", company: "Blue Harbor Marine", title: "Principal Naval Architect", source: "crm-export", updatedAt: "2026-06-30" },

  // A job change reached through a personal mailbox: one human, two employers.
  // The merge is right at person grain, and the company conflict must be flagged
  // rather than silently resolved.
  { id: "r023", truePersonId: "p012", scenario: "job-change-shared-personal-mailbox", fullName: "Tomás Ferreira", email: "t.ferreira@mailbox.example", phone: "(555) 019-1012", company: "Apex Systems", title: "Solutions Consultant", source: "purchased-list", updatedAt: "2025-09-14" },
  { id: "r024", truePersonId: "p012", scenario: "job-change-shared-personal-mailbox", fullName: "Tomas Ferreira", email: "t.ferreira@mailbox.example", company: "Vega Logistics", title: "Senior Solutions Consultant", source: "crm-export", updatedAt: "2026-07-02" },

  // Three rows, chained: r025~r026 by mailbox, r026~r027 by line.
  { id: "r025", truePersonId: "p013", scenario: "transitive-three-row-cluster", fullName: "Nadia Haddad", email: "n.haddad@ironwood.example", company: "Ironwood Legal", title: "Counsel", source: "event-list", updatedAt: "2025-11-05" },
  { id: "r026", truePersonId: "p013", scenario: "transitive-three-row-cluster", fullName: "Nadia Haddad", email: "n.haddad@ironwood.example", phone: "(555) 019-1013", company: "Ironwood Legal", title: "Senior Counsel", source: "crm-export", updatedAt: "2026-05-12" },
  { id: "r027", truePersonId: "p013", scenario: "transitive-three-row-cluster", fullName: "N. Haddad", phone: "555-019-1013", company: "Ironwood Legal", source: "purchased-list", updatedAt: "2025-10-28" },

  // Three rows again, chained through a +tag on one side and a line on the other.
  { id: "r028", truePersonId: "p014", scenario: "transitive-mixed-evidence", fullName: "Yusuf Demir", email: "y.demir@apex.example", phone: "(555) 019-1014", company: "Apex Systems", title: "Account Executive", source: "crm-export", updatedAt: "2026-01-19" },
  { id: "r029", truePersonId: "p014", scenario: "transitive-mixed-evidence", fullName: "Yusuf Demir", email: "yusuf.demir+list@apex.example", company: "Apex Systems", title: "AE", source: "event-list", updatedAt: "2026-02-23" },
  { id: "r030", truePersonId: "p014", scenario: "transitive-mixed-evidence", fullName: "Yusuf Demir", email: "yusuf.demir@apex.example", phone: "555.019.1014", company: "Apex Systems", title: "Senior Account Executive", source: "enrichment", updatedAt: "2026-06-08" },

  // The company is written two ways and one row has no mailbox at all.
  { id: "r031", truePersonId: "p015", scenario: "company-spelling-plus-phone", fullName: "Ingrid Larsson", phone: "(555) 019-1015", company: "Acme, Inc.", title: "Plant Manager", source: "purchased-list", updatedAt: "2025-06-21" },
  { id: "r032", truePersonId: "p015", scenario: "company-spelling-plus-phone", fullName: "Ingrid Larsson", email: "i.larsson@acme.example", phone: "555 019 1015", company: "The Acme Company", title: "Plant Manager", source: "crm-export", updatedAt: "2026-03-30" },

  // Same switchboard *and* same extension: one person, written twice.
  { id: "r033", truePersonId: "p016", scenario: "same-extension-same-person", fullName: "Femi Adeyemi", email: "f.adeyemi@meridian.example", phone: "(555) 019-1016 x204", company: "Meridian Health", title: "Procurement Analyst", source: "enrichment", updatedAt: "2026-02-11" },
  { id: "r034", truePersonId: "p016", scenario: "same-extension-same-person", fullName: "Femi Adeyemi", email: "femi.adeyemi@meridian.example", phone: "555-019-1016 ext. 204", company: "Meridian Health", title: "Procurement Analyst", source: "crm-export", updatedAt: "2026-05-02" },

  // No authoritative link — name, company and domain only, so this lands in review.
  { id: "r035", truePersonId: "p017", scenario: "domain-only-review", fullName: "Lena Fischer", email: "l.fischer@nordwind.example", website: "https://www.nordwind.example/team", company: "Nordwind Energie", title: "Head of Grid Analytics", source: "crm-export", updatedAt: "2026-04-14" },
  { id: "r036", truePersonId: "p017", scenario: "domain-only-review", fullName: "Lena Fischer", phone: "(555) 019-1017", website: "nordwind.example", company: "Nordwind Energie", title: "Analytics Lead", source: "event-list", updatedAt: "2026-01-30" },

  // Same mailbox, two titles that disagree. The conflict must be surfaced.
  { id: "r037", truePersonId: "p018", scenario: "conflicting-title", fullName: "Omar Nasser", email: "o.nasser@cobalt.example", phone: "(555) 019-1018", company: "Cobalt Analytics", title: "Director of RevOps", source: "crm-export", updatedAt: "2026-04-01" },
  { id: "r038", truePersonId: "p018", scenario: "conflicting-title", fullName: "Omar Nasser", email: "o.nasser@cobalt.example", company: "Cobalt Analytics Inc", title: "VP REVENUE OPERATIONS", source: "event-list", updatedAt: "2026-05-20" },

  // The newer row is emptier: non-empty must beat empty before recency is asked.
  { id: "r039", truePersonId: "p019", scenario: "survivorship-completeness-beats-recency", fullName: "Elif Kaya", email: "e.kaya@kestrel.example", phone: "(555) 019-1019", company: "Kestrel Freight", title: "Head of Ops", source: "crm-export", updatedAt: "2026-01-05" },
  { id: "r040", truePersonId: "p019", scenario: "survivorship-completeness-beats-recency", fullName: "Elif Kaya", email: "e.kaya@kestrel.example", company: "Kestrel Freight", source: "form-fill", updatedAt: "2026-06-11" },

  // The newer row is *less trusted*: source rank is asked before recency.
  { id: "r041", truePersonId: "p020", scenario: "survivorship-trust-beats-recency", fullName: "Gabriel Costa", email: "g.costa@vega.example", phone: "(555) 019-1020", company: "Vega Logistics", title: "Regional Manager", source: "crm-export", updatedAt: "2026-02-01" },
  { id: "r042", truePersonId: "p020", scenario: "survivorship-trust-beats-recency", fullName: "Gabriel Costa", email: "g.costa@vega.example", phone: "(555) 019-9020", company: "Vega Logistica", title: "Regional Manager", source: "purchased-list", updatedAt: "2026-07-01" },
];

// ---------------------------------------------------------------------------
// B. Hard negatives — rows that look like duplicates and are not
// ---------------------------------------------------------------------------

const HARD_NEGATIVES: Lead[] = [
  // A father and son at one company, sharing the office line — a family firm, and
  // entirely ordinary. Name, employer, domain and phone all agree, which makes
  // this pair *authoritative* on the phone rule. The generational suffix is the
  // only field that disagrees, and it has to be enough to override the merge:
  // this is the dataset's proof that refusals are evaluated before the
  // authoritative tier rather than after it.
  { id: "r043", truePersonId: "p021", scenario: "hard-negative-father-and-son", fullName: "Robert Reyes Sr.", email: "robert.reyes@acme.example", phone: "(555) 019-1021", company: "Acme Robotics", title: "Founder", source: "crm-export", updatedAt: "2026-02-18" },
  { id: "r044", truePersonId: "p022", scenario: "hard-negative-father-and-son", fullName: "Robert Reyes Jr.", email: "rob.reyes@acme.example", phone: "555-019-1021", company: "Acme Robotics", title: "Head of Product", source: "crm-export", updatedAt: "2026-02-18" },

  // Two Wei Chens at one company. Nothing refutes the pair and nothing confirms
  // it — exactly the case a human has to rule on.
  { id: "r045", truePersonId: "p023", scenario: "hard-negative-namesakes-one-company", fullName: "Wei Chen", email: "w.chen@apex.example", phone: "(555) 019-1023", company: "Apex Systems", title: "Firmware Engineer", source: "crm-export", updatedAt: "2026-03-06" },
  { id: "r046", truePersonId: "p024", scenario: "hard-negative-namesakes-one-company", fullName: "Wei Chen", email: "wei.chen2@apex.example", phone: "(555) 019-1024", company: "Apex Systems", title: "Supply Chain Analyst", source: "crm-export", updatedAt: "2026-03-06" },

  // The same name at two employers. A job change and two different people are
  // indistinguishable from the rows alone, so the merge must be refused.
  { id: "r047", truePersonId: "p025", scenario: "hard-negative-same-name-two-employers", fullName: "Daniel Whitfield", email: "d.whitfield@kestrel.example", phone: "(555) 019-1025", company: "Kestrel Freight", title: "Depot Supervisor", source: "crm-export", updatedAt: "2026-01-28" },
  { id: "r048", truePersonId: "p026", scenario: "hard-negative-same-name-two-employers", fullName: "Daniel Whitfield", email: "daniel.whitfield@meridian.example", phone: "(555) 019-1026", company: "Meridian Health", title: "Facilities Manager", source: "enrichment", updatedAt: "2026-05-16" },

  // Two people behind one shared inbox. Identical email address, and it must not
  // merge them — this is the single most common false merge in real CRM data.
  { id: "r049", truePersonId: "p027", scenario: "hard-negative-shared-role-inbox", fullName: "Ana Silva", email: "info@gruposolar.example", phone: "(555) 019-1027", company: "Grupo Solar", title: "Office Manager", source: "form-fill", updatedAt: "2026-02-20" },
  { id: "r050", truePersonId: "p028", scenario: "hard-negative-shared-role-inbox", fullName: "Bruno Alves", email: "info@gruposolar.example", phone: "(555) 019-1028", company: "Grupo Solar", title: "Installation Lead", source: "form-fill", updatedAt: "2026-02-21" },

  // Two people on one switchboard, told apart only by extension. Identical E.164.
  { id: "r051", truePersonId: "p029", scenario: "hard-negative-one-switchboard", fullName: "Katherine Boyle", email: "k.boyle@ironwood.example", phone: "(555) 019-1029 x110", company: "Ironwood Legal", title: "Partner", source: "crm-export", updatedAt: "2026-04-09" },
  { id: "r052", truePersonId: "p030", scenario: "hard-negative-one-switchboard", fullName: "Miles Trenton", email: "m.trenton@ironwood.example", phone: "(555) 019-1029 x442", company: "Ironwood Legal", title: "Associate", source: "crm-export", updatedAt: "2026-04-09" },

  // Alexander and Alexandra Novak: 0.96 similar on Jaro-Winkler, and two people.
  { id: "r053", truePersonId: "p031", scenario: "hard-negative-gendered-pair", fullName: "Alexander Novak", email: "a.novak@cobalt.example", phone: "(555) 019-1031", company: "Cobalt Analytics", title: "Quantitative Analyst", source: "crm-export", updatedAt: "2026-03-02" },
  { id: "r054", truePersonId: "p032", scenario: "hard-negative-gendered-pair", fullName: "Alexandra Novak", email: "alexandra.novak@cobalt.example", phone: "(555) 019-1032", company: "Cobalt Analytics", title: "Marketing Analyst", source: "crm-export", updatedAt: "2026-03-02" },

  // The other Okafor. `r014` is initials-only at this company, and its phone is
  // what decides which of the two it belongs to.
  { id: "r055", truePersonId: "p033", scenario: "hard-negative-initials-ambiguity", fullName: "John Okafor", email: "john.okafor@meridian.example", phone: "(555) 019-1033", company: "Meridian Health", title: "Biomedical Engineer", source: "crm-export", updatedAt: "2026-03-11" },

  // Same surname, same employer, different people — the ordinary case.
  { id: "r056", truePersonId: "p034", scenario: "hard-negative-shared-surname", fullName: "Arjun Raman", email: "arjun.raman@ramantex.example", phone: "(555) 019-1034", company: "Raman Textiles", title: "Export Manager", source: "crm-export", updatedAt: "2026-04-27" },

  // One local part, two corporate domains. Refused on the domains alone.
  { id: "r057", truePersonId: "p035", scenario: "hard-negative-same-local-part", fullName: "Bob Reyes", email: "b.reyes@apex.example", phone: "(555) 019-1035", company: "Apex Systems", title: "Field Technician", source: "purchased-list", updatedAt: "2025-12-15" },
  { id: "r058", truePersonId: "p036", scenario: "hard-negative-same-local-part", fullName: "Bob Reyes", email: "b.reyes@nordwind.example", phone: "(555) 019-1036", company: "Nordwind Energie", title: "Site Engineer", source: "purchased-list", updatedAt: "2025-12-15" },

  // A shared line and identical names, at different employers. Proves refusals
  // are evaluated before the authoritative phone rule, not after it.
  { id: "r059", truePersonId: "p037", scenario: "hard-negative-refusal-beats-phone-rule", fullName: "Ryan Doyle", email: "r.doyle@blueharbor.example", phone: "(555) 019-1037", company: "Blue Harbor Marine", title: "Charter Manager", source: "crm-export", updatedAt: "2026-05-25" },
  { id: "r060", truePersonId: "p038", scenario: "hard-negative-refusal-beats-phone-rule", fullName: "Ryan Doyle", email: "ryan.doyle@hokusai.example", phone: "555.019.1037", company: "Hokusai Trading", title: "Logistics Manager", source: "enrichment", updatedAt: "2026-05-25" },
];

// ---------------------------------------------------------------------------
// C. Quarantine — no usable identity key, and never silently dropped
// ---------------------------------------------------------------------------

const QUARANTINE: Lead[] = [
  { id: "r061", truePersonId: "p039", scenario: "quarantine-company-only", company: "Acme Robotics", source: "purchased-list", updatedAt: "2025-05-04" },
  { id: "r062", truePersonId: "p040", scenario: "quarantine-title-only", title: "VP of Sales", source: "event-list" },
  { id: "r063", truePersonId: "p041", scenario: "quarantine-invalid-email-only", email: "not-an-email", source: "form-fill" },
  { id: "r064", truePersonId: "p042", scenario: "quarantine-name-without-context", fullName: "Dana Whitcombe", source: "purchased-list", updatedAt: "2025-04-17" },
  { id: "r065", truePersonId: "p043", scenario: "quarantine-blank-row", fullName: "   ", email: "  ", phone: " ", company: "   " },
  { id: "r066", truePersonId: "p044", scenario: "quarantine-placeholder-junk", fullName: "n/a", email: "unknown", phone: "-", company: "N/A", source: "purchased-list" },
];

// ---------------------------------------------------------------------------
// D. The population — distinct people, so the dedup rate means something
// ---------------------------------------------------------------------------

const POPULATION: Lead[] = [
  { id: "r067", truePersonId: "p045", scenario: "singleton", fullName: "Aisha Bello", email: "a.bello@northstar.example", phone: "(555) 019-1045", company: "North Star Data Works", title: "Head of Analytics", source: "crm-export", updatedAt: "2026-01-09" },
  { id: "r068", truePersonId: "p046", scenario: "singleton", fullName: "Mateo Ríos", email: "m.rios@gruposolar.example", phone: "(555) 019-1046", company: "Grupo Solar", title: "Project Manager", source: "crm-export", updatedAt: "2026-02-14" },
  { id: "r069", truePersonId: "p047", scenario: "singleton", fullName: "Freya Lindqvist", email: "f.lindqvist@nordwind.example", phone: "(555) 019-1047", company: "Nordwind Energie", title: "Wind Resource Analyst", source: "enrichment", updatedAt: "2026-03-21" },
  { id: "r070", truePersonId: "p048", scenario: "singleton-email-only", fullName: "Kwame Mensah", email: "k.mensah@tundra.example", company: "Tundra Foods", title: "Category Buyer", source: "event-list", updatedAt: "2026-04-05" },
  { id: "r071", truePersonId: "p049", scenario: "singleton-phone-only", fullName: "Hiroshi Tanaka", phone: "(555) 019-1049", company: "Hokusai Trading", title: "Trade Finance Lead", source: "purchased-list", updatedAt: "2025-09-30" },
  { id: "r072", truePersonId: "p050", scenario: "singleton", fullName: "Chiara Bellini", email: "c.bellini@lantern.example", phone: "(555) 019-1050", company: "Lantern Media", title: "Content Director", source: "crm-export", updatedAt: "2026-05-08" },
  { id: "r073", truePersonId: "p051", scenario: "singleton", fullName: "Ade Ogunleye", email: "a.ogunleye@quarry.example", phone: "(555) 019-1051", company: "Quarry Construction", title: "Site Manager", source: "crm-export", updatedAt: "2026-02-02" },
  { id: "r074", truePersonId: "p052", scenario: "singleton", fullName: "Marta Kowalska", email: "m.kowalska@zephyr.example", phone: "(555) 019-1052", company: "Zephyr Air", title: "Route Planner", source: "enrichment", updatedAt: "2026-06-17" },
  { id: "r075", truePersonId: "p053", scenario: "singleton", fullName: "Idris Karim", email: "i.karim@mosaic.example", phone: "(555) 019-1053", company: "Mosaic Education", title: "Head of Curriculum", source: "crm-export", updatedAt: "2026-01-26" },
  { id: "r076", truePersonId: "p054", scenario: "singleton-role-inbox-only", fullName: "Reception Desk", email: "hello@mosaic.example", phone: "(555) 019-1054", company: "Mosaic Education", source: "form-fill", updatedAt: "2026-03-13" },
  { id: "r077", truePersonId: "p055", scenario: "singleton", fullName: "Beatriz Nunes", email: "b.nunes@blueharbor.example", phone: "(555) 019-1055", company: "Blue Harbor Marine", title: "Harbour Operations", source: "crm-export", updatedAt: "2026-04-19" },
  { id: "r078", truePersonId: "p056", scenario: "singleton", firstName: "Anders", lastName: "Holm", email: "a.holm@kestrel.example", phone: "(555) 019-1056", company: "Kestrel Freight", title: "Customs Specialist", source: "crm-export", updatedAt: "2026-05-01" },
  { id: "r079", truePersonId: "p057", scenario: "singleton", firstName: "Nour", lastName: "Khalil", email: "n.khalil@meridian.example", phone: "(555) 019-1057", company: "Meridian Health", title: "Pharmacy Director", source: "enrichment", updatedAt: "2026-02-25" },
  { id: "r080", truePersonId: "p058", scenario: "singleton", fullName: "Ravi Menon", email: "r.menon@ramantex.example", phone: "(555) 019-1058", company: "Raman Textiles", title: "Quality Head", source: "crm-export", updatedAt: "2026-03-29" },
  { id: "r081", truePersonId: "p059", scenario: "singleton-personal-mailbox", fullName: "Grace Aturu", email: "grace.aturu@webmail.example", phone: "(555) 019-1059", company: "Lantern Media", title: "Producer", source: "event-list", updatedAt: "2026-01-15" },
  { id: "r082", truePersonId: "p060", scenario: "singleton", fullName: "Stefan Weber", email: "s.weber@nordwind.example", phone: "(555) 019-1060", company: "Nordwind Energie", title: "Substation Lead", source: "crm-export", updatedAt: "2026-06-02" },
  { id: "r083", truePersonId: "p061", scenario: "singleton", fullName: "Amara Nwosu", email: "a.nwosu@cobalt.example", phone: "(555) 019-1061", company: "Cobalt Analytics", title: "Head of Data Science", source: "crm-export", updatedAt: "2026-04-11" },
  { id: "r084", truePersonId: "p062", scenario: "singleton", fullName: "Liam Gallagher", email: "l.gallagher@vega.example", phone: "(555) 019-1062", company: "Vega Logistics", title: "Warehouse Director", source: "purchased-list", updatedAt: "2025-11-19" },
  { id: "r085", truePersonId: "p063", scenario: "singleton", fullName: "Yuna Park", email: "y.park@hokusai.example", phone: "(555) 019-1063", company: "Hokusai Trading", title: "Commodities Analyst", source: "crm-export", updatedAt: "2026-05-27" },
  { id: "r086", truePersonId: "p064", scenario: "singleton", fullName: "Tobias Brandt", email: "t.brandt@apex.example", phone: "(555) 019-1064", company: "Apex Systems", title: "Hardware Lead", source: "crm-export", updatedAt: "2026-02-06" },
  { id: "r087", truePersonId: "p065", scenario: "singleton", fullName: "Selin Aydın", email: "s.aydin@zephyr.example", phone: "(555) 019-1065", company: "Zephyr Air", title: "Ground Ops Manager", source: "enrichment", updatedAt: "2026-03-17" },
  { id: "r088", truePersonId: "p066", scenario: "singleton", fullName: "Owen Pryce", email: "o.pryce@quarry.example", phone: "(555) 019-1066", company: "Quarry Construction", title: "Estimator", source: "crm-export", updatedAt: "2026-06-21" },
  { id: "r089", truePersonId: "p067", scenario: "singleton", fullName: "Lucía Herrera", email: "l.herrera@solaris.example", phone: "(555) 019-1067", company: "Solaris Renewables", title: "Head of EPC", source: "crm-export", updatedAt: "2026-01-31" },
  { id: "r090", truePersonId: "p068", scenario: "singleton", fullName: "Emeka Obi", email: "e.obi@northstar.example", phone: "(555) 019-1068", company: "North Star Data Works", title: "Platform Engineer", source: "crm-export", updatedAt: "2026-04-23" },
  { id: "r091", truePersonId: "p069", scenario: "singleton-parent-company", fullName: "Helena Voss", email: "h.voss@acmeholdings.example", phone: "(555) 019-1069", company: "Acme Holdings", title: "Group CFO", source: "crm-export", updatedAt: "2026-02-28" },
  { id: "r092", truePersonId: "p070", scenario: "singleton-parent-company", fullName: "Peter Lund", email: "p.lund@acmeholdings.example", phone: "(555) 019-1070", company: "Acme Holdings", title: "Group Controller", source: "crm-export", updatedAt: "2026-03-04" },
  { id: "r093", truePersonId: "p071", scenario: "singleton", fullName: "Zainab Iqbal", email: "z.iqbal@mosaic.example", phone: "(555) 019-1071", company: "Mosaic Education", title: "Regional Director", source: "enrichment", updatedAt: "2026-05-14" },
  { id: "r094", truePersonId: "p072", scenario: "singleton", fullName: "Callum Reid", email: "c.reid@tundra.example", phone: "(555) 019-1072", company: "Tundra Foods", title: "Supply Planner", source: "crm-export", updatedAt: "2026-01-11" },
  { id: "r095", truePersonId: "p073", scenario: "singleton", fullName: "Rina Gupta", email: "r.gupta@cobalt.example", phone: "(555) 019-1073", company: "Cobalt Analytics", title: "Product Manager", source: "crm-export", updatedAt: "2026-06-25" },
  { id: "r096", truePersonId: "p074", scenario: "singleton", fullName: "Pieter Maas", email: "p.maas@blueharbor.example", phone: "(555) 019-1074", company: "Blue Harbor Marine", title: "Yard Supervisor", source: "purchased-list", updatedAt: "2025-10-08" },
  { id: "r097", truePersonId: "p075", scenario: "singleton", fullName: "Naledi Mokoena", email: "n.mokoena@lantern.example", phone: "(555) 019-1075", company: "Lantern Media", title: "Head of Distribution", source: "crm-export", updatedAt: "2026-03-08" },
  { id: "r098", truePersonId: "p076", scenario: "singleton", fullName: "Jonas Iversen", email: "j.iversen@kestrel.example", phone: "(555) 019-1076", company: "Kestrel Freight", title: "Linehaul Manager", source: "crm-export", updatedAt: "2026-04-16" },
  { id: "r099", truePersonId: "p077", scenario: "singleton", fullName: "Meera Pillai", email: "m.pillai@ramantex.example", phone: "(555) 019-1077", company: "Raman Textiles", title: "Design Head", source: "enrichment", updatedAt: "2026-02-12" },
  { id: "r100", truePersonId: "p078", scenario: "singleton", fullName: "Bruno Kessler", email: "b.kessler@nordwind.example", phone: "(555) 019-1078", company: "Nordwind Energie", title: "Head of HSE", source: "crm-export", updatedAt: "2026-05-20" },
  { id: "r101", truePersonId: "p079", scenario: "singleton", fullName: "Talia Ben-Ari", email: "t.benari@northstar.example", phone: "(555) 019-1079", company: "North Star Data Works", title: "Staff Engineer", source: "crm-export", updatedAt: "2026-01-24" },
  { id: "r102", truePersonId: "p080", scenario: "singleton", fullName: "Oscar Lindgren", email: "o.lindgren@zephyr.example", phone: "(555) 019-1080", company: "Zephyr Air", title: "Fleet Engineer", source: "crm-export", updatedAt: "2026-06-13" },
  { id: "r103", truePersonId: "p081", scenario: "singleton", fullName: "Fatima Zahra", email: "f.zahra@meridian.example", phone: "(555) 019-1081", company: "Meridian Health", title: "Head of Nursing", source: "crm-export", updatedAt: "2026-03-26" },
  { id: "r104", truePersonId: "p082", scenario: "singleton", fullName: "Dmitri Volkov", email: "d.volkov@quarry.example", phone: "(555) 019-1082", company: "Quarry Construction", title: "Plant Engineer", source: "purchased-list", updatedAt: "2025-12-09" },
  { id: "r105", truePersonId: "p083", scenario: "singleton", fullName: "Ingrid Solberg", email: "i.solberg@tundra.example", phone: "(555) 019-1083", company: "Tundra Foods", title: "Head of Sourcing", source: "crm-export", updatedAt: "2026-02-21" },
  { id: "r106", truePersonId: "p084", scenario: "singleton", fullName: "Chen Yu", email: "c.yu@apex.example", phone: "(555) 019-1084", company: "Apex Systems", title: "Test Engineer", source: "crm-export", updatedAt: "2026-05-06" },
  { id: "r107", truePersonId: "p085", scenario: "singleton", fullName: "Rosa Delgado", email: "r.delgado@solaris.example", phone: "(555) 019-1085", company: "Solaris Renewables", title: "Grid Interconnect Lead", source: "enrichment", updatedAt: "2026-01-18" },
  { id: "r108", truePersonId: "p086", scenario: "singleton", fullName: "Victor Amankwah", email: "v.amankwah@mosaic.example", phone: "(555) 019-1086", company: "Mosaic Education", title: "Operations Director", source: "crm-export", updatedAt: "2026-04-29" },
  { id: "r109", truePersonId: "p087", scenario: "singleton", fullName: "Sofia Marchetti", email: "s.marchetti@vega.example", phone: "(555) 019-1087", company: "Vega Logistics", title: "Customer Ops Lead", source: "crm-export", updatedAt: "2026-03-15" },
  { id: "r110", truePersonId: "p088", scenario: "singleton", fullName: "Henrik Dahl", email: "h.dahl@blueharbor.example", phone: "(555) 019-1088", company: "Blue Harbor Marine", title: "Chief Engineer", source: "crm-export", updatedAt: "2026-06-05" },
  { id: "r111", truePersonId: "p089", scenario: "singleton", fullName: "Layla Haddadi", email: "l.haddadi@lantern.example", phone: "(555) 019-1089", company: "Lantern Media", title: "Brand Lead", source: "event-list", updatedAt: "2026-02-08" },
  { id: "r112", truePersonId: "p090", scenario: "singleton", fullName: "Nils Berger", email: "n.berger@cobalt.example", phone: "(555) 019-1090", company: "Cobalt Analytics", title: "Head of Engineering", source: "crm-export", updatedAt: "2026-05-11" },
  { id: "r113", truePersonId: "p091", scenario: "singleton", fullName: "Chidi Eze", email: "c.eze@northstar.example", phone: "(555) 019-1091", company: "North Star Data Works", title: "Data Governance Lead", source: "crm-export", updatedAt: "2026-01-06" },
  { id: "r114", truePersonId: "p092", scenario: "singleton", fullName: "Elena Petrova", email: "e.petrova@zephyr.example", phone: "(555) 019-1092", company: "Zephyr Air", title: "Head of Cargo", source: "enrichment", updatedAt: "2026-04-02" },
  { id: "r115", truePersonId: "p093", scenario: "singleton", fullName: "Samuel Adeyinka", email: "s.adeyinka@quarry.example", phone: "(555) 019-1093", company: "Quarry Construction", title: "Commercial Manager", source: "crm-export", updatedAt: "2026-06-28" },
  { id: "r116", truePersonId: "p094", scenario: "singleton", fullName: "Ji-Woo Han", email: "j.han@hokusai.example", phone: "(555) 019-1094", company: "Hokusai Trading", title: "Risk Manager", source: "crm-export", updatedAt: "2026-02-17" },
  { id: "r117", truePersonId: "p095", scenario: "singleton", fullName: "Paulo Rocha", email: "p.rocha@gruposolar.example", phone: "(555) 019-1095", company: "Grupo Solar", title: "Head of Installations", source: "crm-export", updatedAt: "2026-05-23" },
  { id: "r118", truePersonId: "p096", scenario: "singleton", fullName: "Astrid Nilsen", email: "a.nilsen@tundra.example", phone: "(555) 019-1096", company: "Tundra Foods", title: "QA Manager", source: "crm-export", updatedAt: "2026-03-20" },
  { id: "r119", truePersonId: "p097", scenario: "singleton", fullName: "Tariq Hussein", email: "t.hussein@meridian.example", phone: "(555) 019-1097", company: "Meridian Health", title: "Head of Radiology", source: "enrichment", updatedAt: "2026-01-13" },
  { id: "r120", truePersonId: "p098", scenario: "singleton", fullName: "Bianca Ferrari", email: "b.ferrari@lantern.example", phone: "(555) 019-1098", company: "Lantern Media", title: "Head of Studio", source: "crm-export", updatedAt: "2026-04-08" },
  { id: "r121", truePersonId: "p099", scenario: "singleton", fullName: "Otto Kruger", email: "o.kruger@apex.example", phone: "(555) 019-1099", company: "Apex Systems", title: "Manufacturing Lead", source: "crm-export", updatedAt: "2026-06-19" },
  { id: "r122", truePersonId: "p100", scenario: "singleton", fullName: "Nadia Belkacem", email: "n.belkacem@solaris.example", phone: "(555) 019-1100", company: "Solaris Renewables", title: "Head of Finance", source: "crm-export", updatedAt: "2026-02-05" },
  { id: "r123", truePersonId: "p101", scenario: "singleton", fullName: "Marcus Bailey", email: "m.bailey@kestrel.example", phone: "(555) 019-1101", company: "Kestrel Freight", title: "Head of Safety", source: "crm-export", updatedAt: "2026-05-17" },
  { id: "r124", truePersonId: "p102", scenario: "singleton", fullName: "Sunita Rao", email: "s.rao@mosaic.example", phone: "(555) 019-1102", company: "Mosaic Education", title: "Head of Admissions", source: "crm-export", updatedAt: "2026-03-01" },
  { id: "r125", truePersonId: "p103", scenario: "singleton", fullName: "Erik Johansson", email: "e.johansson@nordwind.example", phone: "(555) 019-1103", company: "Nordwind Energie", title: "Turbine Lead", source: "crm-export", updatedAt: "2026-06-09" },
  { id: "r126", truePersonId: "p104", scenario: "singleton", fullName: "Amina Farah", email: "a.farah@northstar.example", phone: "(555) 019-1104", company: "North Star Data Works", title: "Head of Product", source: "crm-export", updatedAt: "2026-01-21" },

  // Second copies of rows above, re-imported from another source. These are what
  // make the dedup rate a real number rather than a rounding artefact — and each
  // one still has to be *found*, by a different kind of evidence.
  { id: "r127", truePersonId: "p045", scenario: "reimport-exact-email", fullName: "Aisha Bello", email: "A.Bello@NorthStar.Example", company: "North Star Data Works", title: "Analytics Director", source: "event-list", updatedAt: "2026-04-26" },
  { id: "r128", truePersonId: "p046", scenario: "reimport-phone-and-company", fullName: "Mateo Rios", phone: "555-019-1046", company: "Grupo Solar S.A.", title: "Project Manager", source: "purchased-list", updatedAt: "2025-08-30" },
  { id: "r129", truePersonId: "p048", scenario: "reimport-plus-tag", fullName: "Kwame Mensah", email: "k.mensah+2026@tundra.example", company: "Tundra Foods", title: "Senior Category Buyer", source: "event-list", updatedAt: "2026-06-14" },
  { id: "r130", truePersonId: "p050", scenario: "reimport-inverted-name", fullName: "Bellini, Chiara", email: "c.bellini@lantern.example", phone: "(555) 019-1050", company: "Lantern Media", source: "crm-export", updatedAt: "2026-05-29" },
  { id: "r131", truePersonId: "p052", scenario: "reimport-nickname", fullName: "Marta Kowalska", email: "marta.kowalska@zephyr.example", phone: "555.019.1052", company: "Zephyr Air", title: "Senior Route Planner", source: "enrichment", updatedAt: "2026-07-01" },
  { id: "r132", truePersonId: "p055", scenario: "reimport-exact-email", fullName: "Beatriz Nunes", email: "b.nunes@blueharbor.example", company: "Blue Harbor Marine", title: "Harbour Operations Manager", source: "form-fill", updatedAt: "2026-06-22" },
  { id: "r133", truePersonId: "p057", scenario: "reimport-split-name-columns", firstName: "Nour", lastName: "Khalil", email: "nour.khalil@meridian.example", phone: "(555) 019-1057", company: "Meridian Health", title: "Pharmacy Director", source: "enrichment", updatedAt: "2026-05-19" },
  { id: "r134", truePersonId: "p060", scenario: "reimport-honorific", fullName: "Dr. Stefan Weber", email: "s.weber@nordwind.example", phone: "(555) 019-1060", company: "Nordwind Energie GmbH", title: "Head of Substations", source: "crm-export", updatedAt: "2026-06-26" },
  { id: "r135", truePersonId: "p062", scenario: "reimport-phone-and-company", fullName: "Liam Gallagher", phone: "555 019 1062", company: "Vega Logistics Ltd", title: "Warehouse Director", source: "purchased-list", updatedAt: "2025-12-22" },
  { id: "r136", truePersonId: "p064", scenario: "reimport-exact-email", fullName: "Tobias Brandt", email: "t.brandt@apex.example", phone: "(555) 019-1064 x18", company: "Apex Systems", title: "Hardware Lead", source: "event-list", updatedAt: "2026-03-09" },
  { id: "r137", truePersonId: "p067", scenario: "reimport-accent-lost", fullName: "Lucia Herrera", email: "lucia.herrera@solaris.example", phone: "(555) 019-1067", company: "Solaris Renewables", title: "Head of EPC", source: "enrichment", updatedAt: "2026-04-13" },
  { id: "r138", truePersonId: "p069", scenario: "reimport-website-column", fullName: "Helena Voss", email: "helena.voss@acmeholdings.example", website: "https://www.acmeholdings.example", phone: "(555) 019-1069", company: "Acme Holdings", title: "Group CFO", source: "enrichment", updatedAt: "2026-05-04" },
  { id: "r139", truePersonId: "p072", scenario: "reimport-exact-email", fullName: "Callum Reid", email: "c.reid@tundra.example", company: "Tundra Foods", title: "Senior Supply Planner", source: "form-fill", updatedAt: "2026-06-30" },
  { id: "r140", truePersonId: "p074", scenario: "reimport-phone-and-company", fullName: "Pieter Maas", phone: "(555) 019-1074", company: "Blue Harbor Marine Ltd", title: "Yard Supervisor", source: "purchased-list", updatedAt: "2025-11-02" },
  { id: "r141", truePersonId: "p077", scenario: "reimport-exact-email", fullName: "Meera Pillai", email: "m.pillai@ramantex.example", phone: "(555) 019-1077", company: "Raman Textiles Pvt Ltd", title: "Head of Design", source: "crm-export", updatedAt: "2026-05-31" },
  { id: "r142", truePersonId: "p080", scenario: "reimport-formatting-only", fullName: "  OSCAR   LINDGREN  ", email: "o.lindgren@zephyr.example  ", phone: "5550191080", company: "ZEPHYR AIR", title: "FLEET ENGINEER", source: "event-list", updatedAt: "2026-06-30" },
  { id: "r143", truePersonId: "p082", scenario: "reimport-phone-and-company", fullName: "Dmitri Volkov", phone: "555-019-1082", company: "Quarry Construction Ltd", title: "Plant Engineer", source: "purchased-list", updatedAt: "2026-01-04" },
  { id: "r144", truePersonId: "p085", scenario: "reimport-exact-email", fullName: "Rosa Delgado", email: "r.delgado@solaris.example", company: "Solaris Renewables", title: "Interconnection Lead", source: "form-fill", updatedAt: "2026-04-24" },
  { id: "r145", truePersonId: "p087", scenario: "reimport-initials", fullName: "S. Marchetti", phone: "(555) 019-1087", company: "Vega Logistics", source: "purchased-list", updatedAt: "2026-02-19" },
  { id: "r146", truePersonId: "p090", scenario: "reimport-exact-email", fullName: "Nils Berger", email: "n.berger@cobalt.example", phone: "(555) 019-1090", company: "Cobalt Analytics", title: "VP Engineering", source: "crm-export", updatedAt: "2026-06-16" },
  { id: "r147", truePersonId: "p092", scenario: "reimport-plus-tag", fullName: "Elena Petrova", email: "e.petrova+news@zephyr.example", company: "Zephyr Air", title: "Head of Cargo", source: "event-list", updatedAt: "2026-05-09" },
  { id: "r148", truePersonId: "p095", scenario: "reimport-accent-and-suffix", fullName: "Paulo Rocha", email: "paulo.rocha@gruposolar.example", phone: "(555) 019-1095", company: "Grupo Solar", title: "Head of Installations", source: "enrichment", updatedAt: "2026-06-11" },
  { id: "r149", truePersonId: "p098", scenario: "reimport-exact-email", fullName: "Bianca Ferrari", email: "b.ferrari@lantern.example", phone: "(555) 019-1098", company: "Lantern Media", title: "Studio Director", source: "crm-export", updatedAt: "2026-06-27" },
  { id: "r150", truePersonId: "p101", scenario: "reimport-phone-and-company", fullName: "Marcus Bailey", phone: "555.019.1101", company: "Kestrel Freight", title: "Head of Safety and Compliance", source: "purchased-list", updatedAt: "2026-01-16" },
];

/** The dataset, in id order. */
export const LEADS: Lead[] = [...MERGES, ...HARD_NEGATIVES, ...QUARANTINE, ...POPULATION];

/**
 * The dataset as the engine takes it.
 *
 * `raw` carries the original column values so an export can hand back what it was
 * given, and `truePersonId` rides along because the sweep and the precision test
 * need it. The engine never reads it — `lib/clean/run.ts` only passes it through.
 */
export function demoRows(): InputRow[] {
  return LEADS.map((lead) => ({
    id: lead.id,
    truePersonId: lead.truePersonId,
    mapped: {
      fullName: lead.fullName,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      website: lead.website,
      title: lead.title,
      source: lead.source,
      updatedAt: lead.updatedAt,
    },
    raw: Object.fromEntries(
      Object.entries(lead)
        .filter(([key, value]) => key !== "truePersonId" && key !== "scenario" && value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    ),
  }));
}
