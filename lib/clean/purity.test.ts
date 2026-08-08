import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The purity boundary, enforced by reading the source.
 *
 * Every other test in this repo asserts behaviour. This one asserts the property
 * the behaviour rests on: nothing in the engine reaches for the clock, the
 * network, the environment, or an unseeded random number. Those are the four
 * ways determinism dies, and each is easy to reintroduce by accident while
 * fixing something unrelated.
 *
 * It is also what makes the product claim true. The default run happens in the
 * browser — an uploaded CSV never leaves the user's machine — and that is only
 * possible because no stage of the pipeline needs a server for anything.
 *
 * A grep is a blunt instrument, but it is the only kind of test that fails on
 * the *next* mistake rather than on a symptom of it.
 */

/**
 * Grown as the engine lands, deliberately by hand: an explicit list fails loudly
 * when a directory is renamed, where a glob would just quietly check less.
 */
const ENGINE_DIRECTORIES = ["lib/clean", "lib/match", "lib/normalize", "lib/survive", "lib/text"];

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /Math\.random\s*\(/, why: "unseeded randomness makes a run impossible to reproduce" },
  { pattern: /Date\.now\s*\(/, why: "reading the clock puts wall time into the output" },
  { pattern: /new Date\s*\(\s*\)/, why: "reading the clock puts wall time into the output" },
  { pattern: /process\.env/, why: "configuration must arrive as an argument, not from the environment" },
  { pattern: /\bfrom\s+["']node:/, why: "the engine runs in a browser; there is no node there" },
  { pattern: /\bfrom\s+["']next\//, why: "the engine must not depend on the framework" },
  { pattern: /(?<![.\w])fetch\s*\(/, why: "the pipeline makes no network calls at all" },
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith(".ts")) return [];
    // Tests and fixtures are allowed everything — they are the ones reaching for
    // the filesystem so that the engine never has to.
    if (entry.name.includes(".test.") || entry.name.includes("test-support")) return [];
    return [path];
  });
}

/**
 * Comments are stripped first. Half of these rules are things the engine's own
 * documentation talks *about* — "no `process.env`", "there is no seed" — and a
 * check that fails on its own explanation is a check nobody keeps.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the engine is pure", () => {
  for (const directory of ENGINE_DIRECTORIES) {
    for (const file of sourceFiles(directory)) {
      it(`${file} reaches for nothing outside itself`, () => {
        const source = withoutComments(readFileSync(file, "utf8"));

        for (const { pattern, why } of FORBIDDEN) {
          const match = source.match(pattern);
          expect(match, `${file} contains \`${match?.[0]}\` — ${why}`).toBeNull();
        }
      });
    }
  }

  it("is actually looking at files", () => {
    // Guards against a refactor that moves the engine and silently turns this
    // whole suite into zero assertions.
    for (const directory of ENGINE_DIRECTORIES) {
      expect(existsSync(directory), `${directory} is listed but does not exist`).toBe(true);
      expect(sourceFiles(directory).length, `${directory} contributed no files`).toBeGreaterThan(0);
    }
  });
});
