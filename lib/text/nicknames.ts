/**
 * Given-name variants, and what it means for two first names to be compatible.
 *
 * `Bob` and `Robert` are the same person and share no characters worth speaking
 * of; no string metric will ever connect them. That needs a table, and a table
 * is a claim about the world, so the shape of it matters:
 *
 * A name maps to a *set* of formal names it could stand for, not to one. `Sam`
 * could be `Samuel` or `Samantha`, so it is compatible with both — while
 * `Samuel` and `Samantha` remain incompatible with each other, because their
 * sets are disjoint. Collapsing each variant to a single canonical form would
 * quietly make `Samuel` and `Samantha` near-matches, and the same trap sits
 * under `Alex`, `Chris`, `Pat`, `Jo`, `Terry` and `Ronnie`.
 *
 * The table is English-biased and that is a stated limitation in the README, not
 * a thing the code pretends about. It is also small on purpose: a wrong entry
 * here manufactures duplicates, so an unfamiliar pair is better left to the
 * review queue than guessed at.
 */

import { jaroWinkler } from "./jaro-winkler.ts";

/** Formal name -> the short forms and spellings that can stand for it. */
const VARIANTS: Record<string, string[]> = {
  robert: ["bob", "bobby", "rob", "robbie", "robby", "bert"],
  william: ["will", "bill", "billy", "willie", "willy"],
  richard: ["rick", "ricky", "rich", "richie", "dick"],
  james: ["jim", "jimmy", "jamie"],
  john: ["jack", "johnny", "jon"],
  jonathan: ["jon", "jonny", "jonathon", "johnathan", "johnathon"],
  michael: ["mike", "mikey", "mick", "mickey", "micheal"],
  joseph: ["joe", "joey", "jo"],
  charles: ["charlie", "chuck", "chas"],
  thomas: ["tom", "tommy"],
  christopher: ["chris", "kit", "topher"],
  daniel: ["dan", "danny"],
  matthew: ["matt", "matty"],
  anthony: ["tony"],
  andrew: ["andy", "drew"],
  edward: ["ed", "eddie", "ted", "teddy", "ned"],
  david: ["dave", "davey"],
  stephen: ["steve", "steven", "stevie"],
  kenneth: ["ken", "kenny"],
  nicholas: ["nick", "nicky", "nikolas"],
  benjamin: ["ben", "benny", "benji"],
  samuel: ["sam", "sammy"],
  gregory: ["greg", "gregg"],
  jeffrey: ["jeff", "geoff", "geoffrey"],
  frederick: ["fred", "freddie", "fritz"],
  theodore: ["ted", "teddy", "theo"],
  timothy: ["tim", "timmy"],
  ronald: ["ron", "ronnie"],
  donald: ["don", "donnie"],
  lawrence: ["larry", "laurence", "lars"],
  patrick: ["pat", "paddy", "patty"],
  peter: ["pete", "petey"],
  albert: ["al", "bert", "albie"],
  alexander: ["alex", "alec", "al", "xander", "sasha"],
  zachary: ["zach", "zack", "zak"],
  douglas: ["doug"],
  philip: ["phil", "phillip"],
  raymond: ["ray"],
  vincent: ["vince", "vinny"],
  walter: ["walt", "wally"],
  eugene: ["gene"],
  harold: ["harry", "hal", "harold"],
  arthur: ["art", "artie"],
  francis: ["frank", "fran", "frankie"],
  gerald: ["jerry", "gerry"],
  leonard: ["leo", "len", "lenny"],
  russell: ["russ", "rusty"],
  stanley: ["stan"],
  victor: ["vic"],
  wesley: ["wes"],
  abraham: ["abe"],
  bartholomew: ["bart"],
  calvin: ["cal"],
  clifford: ["cliff"],
  ernest: ["ernie"],
  george: ["georgie"],
  herbert: ["herb", "herbie"],
  howard: ["howie"],
  jacob: ["jake", "jakob"],
  lewis: ["lou", "louis", "louie"],
  martin: ["marty"],
  maxwell: ["max"],
  norman: ["norm"],
  oliver: ["ollie"],
  rodney: ["rod"],
  samson: ["sam"],
  terrence: ["terry", "terrance"],
  wallace: ["wally"],

  katherine: ["kate", "katie", "kathy", "kat", "kit", "catherine", "kathryn", "cathy"],
  elizabeth: ["liz", "lizzie", "beth", "betty", "betsy", "eliza", "libby"],
  margaret: ["maggie", "meg", "peggy", "marge", "margie", "greta"],
  patricia: ["pat", "patty", "trish", "tricia"],
  jennifer: ["jen", "jenny", "jenn"],
  deborah: ["deb", "debbie", "debra"],
  barbara: ["barb", "babs", "barbie"],
  susan: ["sue", "susie", "suzy", "suzanne"],
  rebecca: ["becky", "becca", "reba"],
  kimberly: ["kim", "kimmy"],
  christina: ["chris", "tina", "christy", "christine", "kristina"],
  stephanie: ["steph", "stevie"],
  victoria: ["vicky", "vicki", "tori"],
  alexandra: ["alex", "lexi", "sandra", "sasha"],
  samantha: ["sam", "sammy"],
  jessica: ["jess", "jessie"],
  amanda: ["mandy"],
  cynthia: ["cindy", "cyndi"],
  dorothy: ["dot", "dottie", "dolly"],
  eleanor: ["ellie", "nell", "nora"],
  frances: ["fran", "franny", "frankie"],
  gabriella: ["gabby", "gabriela", "gabi"],
  josephine: ["jo", "josie"],
  nancy: ["nan"],
  pamela: ["pam"],
  sandra: ["sandy", "sandi"],
  theresa: ["terry", "tess", "tessa", "teresa", "terri"],
  virginia: ["ginny", "gina"],
  veronica: ["ronnie", "roni"],
  penelope: ["penny"],
  antonia: ["toni"],
  angela: ["angie"],
  bernadette: ["bernie"],
  charlotte: ["charlie", "lottie"],
  danielle: ["dani", "danni"],
  eileen: ["ilene"],
  geraldine: ["gerry", "jerry"],
  helen: ["helena", "lena"],
  isabella: ["bella", "izzy", "isabel"],
  judith: ["judy"],
  laura: ["laurie"],
  madeline: ["maddie", "madelyn"],
  natalie: ["nat", "nattie"],
  olivia: ["liv", "livvy"],
  rachel: ["rach", "rachael"],
  sarah: ["sara", "sadie"],
  valerie: ["val"],
  yvonne: ["vonnie"],
};

/** variant or formal name -> every formal name it could stand for. */
const GROUPS: Map<string, Set<string>> = (() => {
  const groups = new Map<string, Set<string>>();
  const add = (name: string, canonical: string) => {
    const existing = groups.get(name);
    if (existing) existing.add(canonical);
    else groups.set(name, new Set([canonical]));
  };

  for (const [canonical, variants] of Object.entries(VARIANTS)) {
    add(canonical, canonical);
    for (const variant of variants) add(variant, canonical);
  }
  return groups;
})();

/** Strips the punctuation an initial or a compound name arrives with. */
function tidy(name: string): string {
  return name.trim().toLowerCase().replace(/[.\s]+$/g, "");
}

/**
 * The formal names a given name could stand for. A name absent from the table
 * stands only for itself — the table's silence is not evidence of anything.
 */
export function nameGroups(name: string): Set<string> {
  const cleaned = tidy(name);
  return GROUPS.get(cleaned) ?? new Set([cleaned]);
}

/** Whether the table has an opinion about this name at all. */
export function isKnown(name: string): boolean {
  return GROUPS.has(tidy(name));
}

/** `J`, `J.` and `j` are initials. Two-letter strings are names, not initials. */
export function isInitial(name: string): boolean {
  return /^[\p{L}]\.?$/u.test(name.trim());
}

export type NameCompatibility = {
  /** 0..1. Not a probability — a weight the match rules combine. */
  score: number;
  /** Which rule produced it, verbatim, for the audit trail. */
  rule: string;
};

/**
 * How compatible two given names are.
 *
 * The ladder is ordered by how much each kind of evidence is worth, and the
 * ceilings are deliberate. An initial that agrees is *compatible*, never equal:
 * `J. Smith` could be the `John Smith` in the next row or the `Jane Smith` in
 * the one after, and a scoring function that cannot express that difference is
 * how a deduplicator merges two people.
 */
export function firstNameCompatibility(a: string, b: string): NameCompatibility {
  const left = tidy(a);
  const right = tidy(b);

  if (left.length === 0 || right.length === 0) {
    return { score: 0, rule: "first name missing on one side" };
  }

  const leftInitial = isInitial(left);
  const rightInitial = isInitial(right);

  // Initials are checked before string equality on purpose. Two identical
  // initials are *not* an identical name, and an `a === b` shortcut at the top
  // of this function would score `J.` against `J.` at 1.
  if (leftInitial && rightInitial) {
    // Two initials agreeing is the weakest signal the ladder admits: `J.` and
    // `J.` covers a large share of any name distribution.
    return left[0] === right[0]
      ? { score: 0.6, rule: "both given names are the same initial" }
      : { score: 0, rule: "initials disagree" };
  }

  if (leftInitial || rightInitial) {
    const initial = leftInitial ? left[0] : right[0];
    const full = leftInitial ? right : left;
    return initial === full[0]
      ? { score: 0.85, rule: `initial ${initial.toUpperCase()}. is consistent with ${full}` }
      : { score: 0, rule: "initial contradicts the given name" };
  }

  if (left === right) return { score: 1, rule: "identical given name" };

  const leftGroups = nameGroups(left);
  const rightGroups = nameGroups(right);

  const shared = [...leftGroups].filter((group) => rightGroups.has(group)).sort();
  if (shared.length > 0) {
    return { score: 0.95, rule: `both are forms of ${shared.join("/")}` };
  }

  // Both names are in the table and share no formal name, so they are known
  // *different* names — and string similarity is actively misleading here.
  // `Alexander` and `Alexandra` score 0.96 on Jaro-Winkler, whose prefix boost
  // is worst exactly where the risk is highest: long shared stems across
  // gendered pairs. The same trap holds for Christopher/Christina,
  // Patrick/Patricia and Jonathan/John. Capped below the name gate so such a
  // pair cannot merge, but left non-zero so other evidence still composes.
  if (isKnown(left) && isKnown(right)) {
    return { score: 0.4, rule: `${left} and ${right} are different formal given names` };
  }

  return { score: jaroWinkler(left, right), rule: "given-name string similarity" };
}
