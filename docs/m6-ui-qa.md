# M6 UI QA

Date: 2026-06-30

## Fixture Graph

Generate the dev-server graph artifact with:

```sh
npm run m6:fixture-graph
```

Then open:

```text
http://127.0.0.1:1420/?graph=/m6-bakeoff-graph.json
```

`public/m6-bakeoff-graph.json` is generated output and is intentionally ignored.

## Browser Evidence

In the in-app browser, the M6 fixture graph loaded with inventory counts:

- 4 files
- 2 programs
- 2 copybooks
- 1 JCL step

The right-side Impact panel for `LINEAGE` showed:

- `LINK RATEAPI` via `executes src/LINEAGE.cbl:40`
- `CUSTOMER` and `REPORT` via `COPIES`
- `CUSTOMER-FILE` via `reads src/LINEAGE.cbl:21`
- `CUSTOMER_TABLE` via `queries src/LINEAGE.cbl:37`
- `STEP010` via `RUNS jcl/DAILYLN.jcl:2`

Search-driven checks:

- `CUSTOMER-ID` showed `CUSTOMER` as `DEFINES` and `REPORT-ID` as `moves-to src/LINEAGE.cbl:31`.
- `CUSTOMER_TABLE` showed `LINEAGE` as `queries src/LINEAGE.cbl:37`.
- `RATEAPI` showed `LINK RATEAPI` as `links src/LINEAGE.cbl:40`.
- `BANK.CUSTOMER.MASTER` showed `CUSTIN` as `uses-dd jcl/DAILYLN.jcl:3`.
- `CUSTIN` showed `BANK.CUSTOMER.MASTER` under Depends On and `STEP010` under Used By.

This verifies the current UI can answer "what depends on this?" and "where does this data flow?" from the `GraphDocument` alone.
