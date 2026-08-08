# LeadCleaner

Record linkage for messy lead and CRM data: normalize, match in tiers, cluster
under constraints, and justify every surviving value.

**Day 003 of a 100-day building challenge. In progress — this README is a stub
and will be replaced with the real thing when the build lands.**

The agreed scope, architecture, data model and invariants are in
[PLAN.md](PLAN.md). The short version:

- A false merge is unrecoverable; a missed merge is a review item. Everything
  else follows from that asymmetry.
- Authoritative matches auto-merge and must hold **precision 1.0** on a labelled
  dataset. Probable matches go to a human, never to the output.
- No model, no network, no API key, no random source. The default run happens in
  your browser, so an uploaded CSV never leaves your machine.
- Every merge carries its edges, its reasons, and field-level provenance.

## Getting Started

```bash
npm install
npm run dev
```

Gate: `npm run typecheck && npm run lint && npm test`.

## License

MIT — see [LICENSE](LICENSE).
