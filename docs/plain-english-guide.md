# LeadCleaner, in plain English

No code in this one. If you have ever exported a lead list and wondered how many actual people were
in it, this explains what the tool does and why it makes the choices it makes.

---

## The problem, in one row

You export your CRM and find these three lines:

| | name | email | phone | company |
|---|---|---|---|---|
| 1 | Bob Reyes | b.reyes+webinar@acme.example | | Acme, Inc. |
| 2 | Robert Reyes | breyes@acme.example | (555) 019-2837 | Acme Incorporated |
| 3 | ROBERT REYES JR. | | 555.019.2837 | acme |

How many people is that?

Most people say one. It is at least two — rows 1 and 2 are Bob, and row 3 is his son. Get that wrong
in either direction and something breaks: merge them and you have destroyed a person's record; leave
them apart and three reps email the same man this week.

## The one asymmetry everything follows from

**A missed merge is annoying. A false merge is permanent.**

If the tool fails to spot that rows 1 and 2 are the same person, you have a duplicate. Irritating,
fixable, visible.

If the tool decides row 3 is also Bob, it picks one email, one phone number, one job title, and the
rest are gone. There is no undo, because by the time anyone notices there is nothing left to compare
against. Six months later someone asks why the founder's son stopped getting emails.

So the tool is deliberately lopsided. It will happily leave work on the table. It will not guess.

## Three verdicts, not two

Most deduplication tools give you a slider: above this similarity, merge. That framing is the problem,
because "similar" and "the same person" are different claims. This tool sorts every pair of rows into
one of three buckets.

### Refused — cannot be the same person

Checked first, and it beats everything else. Three things land here:

- **You already said no.** If you looked at a pair and rejected it, nothing overrules you. Not a
  rule, not a score, not a re-run.
- **Two work addresses at two different companies.** `d.whitfield@kestrel.example` and
  `daniel.whitfield@meridian.example`. This might be one person who changed jobs, or two people who
  share a name — and *nothing in those two rows can tell you which*. Merging risks destroying a
  record; refusing risks a duplicate. So it refuses. This is the honest hard case in the whole tool,
  and it is a real cost.
- **`Sr.` and `Jr.` disagree.** Same name, same company, same email domain, often the same office
  line. Every similarity signal says one person. The suffix is the only thing in either row that
  says two, so it has to be enough.

### Merged automatically — no question asked

Only two situations qualify, and notice what they have in common: both are *facts*, not
resemblances.

- **The same personal mailbox.** Two rows with the same email address are the same person. With one
  critical exception: a **shared inbox** like `info@` or `sales@` is not a person. Three people at a
  small company all list `info@`, and merging them into one contact is the single most common way real
  CRM data gets destroyed. So a shared inbox never counts as identity.
- **The same phone line, plus a name that agrees, plus the same employer.** All three. A phone number
  alone is a switchboard. And if two rows share a line but list *different extensions*, that is
  positive evidence of two desks — so it blocks the merge rather than allowing it.

Note what is *not* on this list: nothing about names looking alike. However similar two records are,
similarity alone never merges them.

### Probable — a person decides

Everything else that scores well enough. Names that are close, companies that match, a shared domain.
These go into a queue with both rows side by side and every piece of evidence spelled out:

> surname `dubois` vs `duboise` — 0.97 · agrees
> given name identical — 1.00 · agrees
> company `nordwind energie` vs `nordwind energie` — 1.00 · agrees
> domain `nordwind.example` · agrees

You click *same person* or *different people*. That is it.

Here is the part that matters: **there is no score high enough to move a pair from this bucket into
the automatic one.** A 0.99 resemblance still asks. That is not timidity — it is the asymmetry above,
applied consistently.

## Which value wins when rows disagree

Once two rows are one person, something has to decide what goes in the final record. Say one row says
"Head of Ops" and the other says "Director of Operations". Five questions, in order, and the first one
that gives an answer wins:

1. **Does only one row have a value?** Then it wins. This sounds obvious and it is the rule that
   matters most: a newer, better row that simply left a column blank must not erase that column.
2. **Is one value usable and the other not?** A phone number that parses beats digits that don't. A
   personal address beats a shared inbox.
3. **Which source do you trust more?** You order them — CRM export above enrichment above form fill
   above bought list.
4. **Which is more recent?**
5. **Coin flip?** Never. It takes the lowest row number, so the answer is always the same.

Step 3 sits above step 4 on purpose. "Newest wins" is the default almost everywhere and it is wrong
for lead data, because the newest thing that touched a record is often a purchased list overwriting
what your reps carefully entered.

And whatever loses is **kept and shown**. If two rows disagreed about the company, the final record
says which one it chose and displays the other one right next to it, flagged. Quietly picking a winner
and discarding the loser is the same as deleting data — it just feels tidier.

## The rows it refuses to touch

Some rows have nothing that could identify a person. A company name and nothing else. A job title. An
email address that isn't an email address. The word `n/a` typed into a name field.

These are **quarantined**: set aside, listed with the reason, and — this is the important part —
**still in the export**, marked as held back.

A tool that takes 150 rows and returns 141 without telling you which nine it ate is worse than no tool
at all. You cannot check work you cannot see.

## Why it doesn't compare everything

150 rows means 11,175 possible pairs. 100,000 rows means five billion. So the tool only compares rows
that share something cheap to look up — the same email, the same last seven digits of a phone number,
the same surname sound at the same company, and four more.

That cuts 10,296 comparisons down to 91. The catch is real: if a true duplicate shares *none* of those
keys, it never gets compared, so it can never be found. That is why there are seven keys instead of
one, and why the tool ships with a checkbox that turns blocking off and compares everything — with a
test proving both modes find the same duplicates on the bundled data. The saving is stated next to the
risk, and the risk is measured rather than promised.

## What "same answer every time" buys you

There is no randomness anywhere in this tool, and no AI model. Same rows, same settings, same
decisions in, same answer out — on your machine, on mine, next year.

That is not a technical brag, it is the difference between a tool you can defend and one you can't.
When someone asks "why did you merge those two contacts?", you can hand them a file that contains the
settings, your decisions, and every piece of evidence — and they can re-run it and get exactly what you
got. Without that, the answer is "the tool did it", which is not an answer.

It also means your file never leaves your computer. The whole thing runs inside the browser tab,
because nothing in it needs a server.

## The numbers

Measured against a 150-row test file where the right answer is known in advance:

- **100 people** found from 150 rows
- **zero false merges** — the automatic tier has never merged two different people
- **96% of the real duplicates** found without anyone reviewing anything
- **2 pairs** in the queue; deciding those two reaches **100%**
- **91 comparisons** instead of 10,296

The test file is built to be hard on purpose. It contains a father and son sharing a name, a company
and a phone line. Two Wei Chens at one employer. Two people behind one `info@`. Two colleagues on one
switchboard. An Alexander and an Alexandra Novak. And a `J. Okafor` at a company that employs both a
Jane and a John Okafor, where only the phone number says which.

Any deduplication tool can score well on a file full of obvious duplicates. The ones above are where
they break.
