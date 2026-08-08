/**
 * Guessing which column is which, and being overridable about it.
 *
 * Every CRM spells these differently — `Email`, `E-mail Address`, `work_email`,
 * `Primary Email` — so a tool that demands exact headers demands the user reshape
 * their file first. The guess covers the spellings that actually occur; the UI shows
 * what it picked and lets it be changed, because a wrong guess here silently changes
 * which rows merge.
 *
 * A column matched by an exact alias always beats one matched by a fuzzy contains
 * rule, so `Email` wins over `Email Opt Out` no matter what order they appear in.
 */

import type { InputRow, MappedFields } from "../clean/types.ts";
import { parseCsv } from "./parse.ts";

export type Column = keyof MappedFields;

export const COLUMNS: Column[] = [
  "fullName", "firstName", "lastName", "email", "phone",
  "company", "website", "title", "source", "updatedAt",
];

/** Exact header spellings, normalized to letters and digits only. */
const ALIASES: Record<Column, string[]> = {
  fullName: ["fullname", "name", "contactname", "personname", "leadname", "displayname"],
  firstName: ["firstname", "first", "givenname", "forename", "fname"],
  lastName: ["lastname", "last", "surname", "familyname", "lname"],
  email: ["email", "emailaddress", "eaddress", "workemail", "primaryemail", "businessemail", "mail"],
  phone: ["phone", "phonenumber", "telephone", "tel", "mobile", "mobilenumber", "cell", "cellphone", "workphone", "directdial", "directphone"],
  company: ["company", "companyname", "account", "accountname", "organisation", "organization", "employer", "org"],
  website: ["website", "url", "domain", "companydomain", "companywebsite", "web", "homepage", "site"],
  title: ["title", "jobtitle", "position", "role", "jobrole", "designation"],
  source: ["source", "leadsource", "origin", "list", "listname", "importsource", "channel"],
  updatedAt: ["updatedat", "updated", "lastmodified", "modifieddate", "lastupdated", "dateupdated", "lastactivity", "createdat", "created", "datecreated"],
};

/** Substring rules, used only when no alias matched. */
const CONTAINS: Record<Column, string[]> = {
  fullName: ["fullname"],
  firstName: ["first"],
  lastName: ["last", "surname"],
  email: ["email", "mail"],
  phone: ["phone", "mobile", "tel"],
  company: ["company", "account", "organi", "employer"],
  website: ["website", "domain", "url"],
  title: ["title", "position", "role"],
  source: ["source", "list"],
  updatedAt: ["updated", "modified", "created"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export type Mapping = Partial<Record<Column, number>>;

/**
 * Guesses a mapping from header names.
 *
 * Two passes so precision beats proximity: every exact alias is claimed first, then
 * the substring rules fill what is left. Each column takes at most one index and each
 * index is claimed by at most one column.
 */
export function guessMapping(headers: string[]): Mapping {
  const normalized = headers.map(normalizeHeader);
  const mapping: Mapping = {};
  const claimed = new Set<number>();

  for (const column of COLUMNS) {
    const index = normalized.findIndex(
      (header, position) => !claimed.has(position) && ALIASES[column].includes(header),
    );
    if (index !== -1) {
      mapping[column] = index;
      claimed.add(index);
    }
  }

  for (const column of COLUMNS) {
    if (mapping[column] !== undefined) continue;
    const index = normalized.findIndex(
      (header, position) =>
        !claimed.has(position) && CONTAINS[column].some((needle) => header.includes(needle)),
    );
    if (index !== -1) {
      mapping[column] = index;
      claimed.add(index);
    }
  }

  return mapping;
}

export type ParsedFile = {
  headers: string[];
  mapping: Mapping;
  rows: InputRow[];
  /** Columns the mapping did not claim, so the UI can offer them. */
  unmapped: string[];
};

/**
 * A CSV file to rows the engine can take.
 *
 * Ids are positional (`r1`, `r2`, …) because an uploaded file has nothing better —
 * and they are assigned once, here, so the rest of the pipeline can treat them as
 * stable. `raw` keeps every original column, including the unmapped ones, so the
 * export can hand back what it was given.
 */
export function parseLeadFile(text: string, override?: Mapping): ParsedFile {
  const table = parseCsv(text);
  if (table.length === 0) return { headers: [], mapping: {}, rows: [], unmapped: [] };

  const headers = table[0].map((header) => header.trim());
  const mapping = { ...guessMapping(headers), ...override };

  const cell = (cells: string[], column: Column): string | undefined => {
    const index = mapping[column];
    if (index === undefined) return undefined;
    const value = cells[index]?.trim();
    return value === undefined || value.length === 0 ? undefined : value;
  };

  const rows: InputRow[] = table.slice(1).map((cells, position) => ({
    id: `r${position + 1}`,
    mapped: Object.fromEntries(
      COLUMNS.map((column) => [column, cell(cells, column)]).filter(([, value]) => value !== undefined),
    ) as MappedFields,
    raw: Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? ""]).filter(([header]) => String(header).length > 0),
    ),
  }));

  const claimed = new Set(Object.values(mapping));
  return {
    headers,
    mapping,
    rows,
    unmapped: headers.filter((_, index) => !claimed.has(index)),
  };
}
