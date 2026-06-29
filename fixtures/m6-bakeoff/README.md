# M6 Bake-Off Fixture

This fixture is intentionally small but semantically dense. It exists to test whether a candidate analyzer can emit source-grounded lineage and impact edges while preserving the Cobolens `GraphDocument` contract.

Expected M6 semantic signals:

- `LINEAGE` reads `CUSTOMER-FILE` and writes `REPORT-FILE`.
- `CUSTOMER-ID`, `CUSTOMER-NAME`, and `CUSTOMER-BALANCE` flow into output/report fields.
- `EXEC SQL SELECT` reads `CUSTOMER_TABLE`.
- `EXEC CICS LINK PROGRAM('RATEAPI')` links to `RATEAPI`.
- `DAILYLINE` runs `LINEAGE` and declares input/output datasets through DD statements.

