/**
 * A CSV reader and writer, written rather than installed.
 *
 * Not because parsing CSV is interesting, but because the alternative is a
 * dependency in the one place the project makes a privacy claim. The default run
 * happens in the browser so an uploaded file never leaves the user's machine, and
 * that claim is only as good as the code the file passes through. 80 lines that can
 * be read in a sitting are worth more here than a library that handles dialects this
 * tool will never see.
 *
 * What it handles, because real exports contain all of it: quoted fields, escaped
 * quotes (`""`), embedded commas and newlines, CRLF, a UTF-8 BOM, ragged rows, and
 * blank lines. What it does not: alternative delimiters, or a header row that is
 * not the first line.
 */

/** Splits CSV text into rows of raw cell strings. */
export function parseCsv(text: string): string[][] {
  // A BOM survives Excel exports and would otherwise become part of the first
  // header name, which quietly breaks column mapping.
  const input = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const character = input[i];

    if (quoted) {
      if (character !== '"') {
        cell += character;
        continue;
      }
      // A doubled quote inside a quoted field is one literal quote.
      if (input[i + 1] === '"') {
        cell += '"';
        i++;
        continue;
      }
      quoted = false;
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (character === "\n" || character === "\r") {
      // Consume the LF of a CRLF pair so it does not open an empty row.
      if (character === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // A trailing newline is not a row, and a blank line in the middle is not a lead.
  return rows.filter((cells) => cells.some((value) => value.trim().length > 0));
}

/** Quotes a value only when it needs it, so the output stays readable. */
export function toCsvCell(value: string | undefined): string {
  const text = value ?? "";
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text, CRLF-terminated as the format specifies. */
export function toCsv(rows: (string | undefined)[][]): string {
  return rows.map((cells) => cells.map(toCsvCell).join(",")).join("\r\n") + "\r\n";
}
