# Recon Worker

Background worker for payment reconciliation using Postgres-backed job queue.

## Reconciliation Logic

Deterministic rules applied to each payment:
- Negative amounts: Failed
- Zero amounts: Failed
- Amounts ending in .13: Completed with discrepancy
- All other amounts: Successfully reconciled

## Job Processing

- Polls `recon_jobs` table using `SELECT ... FOR UPDATE SKIP LOCKED`
- Processes one job at a time
- Updates payment status and creates ledger entries
- Maintains running account balance

## Development

This worker is automatically started when opening `payments-api` in Ona.
