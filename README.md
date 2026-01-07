# Recon Worker

Background worker for payment reconciliation. This repository is automatically cloned when opening the [payments-api](https://github.com/YOUR_USERNAME/payments-api) repository in Ona/Gitpod.

## Overview

Processes payment reconciliation jobs from a Postgres-backed queue using distributed locking. Creates ledger entries and maintains running account balances.

## Features

✅ **Postgres Job Queue** - Uses `SELECT FOR UPDATE SKIP LOCKED` for distributed processing  
✅ **Deterministic Reconciliation** - Predictable rules for testing and validation  
✅ **Ledger Management** - Creates double-entry ledger with running balances  
✅ **Automatic Retry** - Failed jobs can be retried with backoff  
✅ **Lock Timeout** - Prevents stuck jobs from blocking the queue  

## Reconciliation Logic

Deterministic rules applied to each payment:

| Condition | Result | Status |
|-----------|--------|--------|
| Amount < 0 | Failed | `failed` |
| Amount = 0 | Failed | `failed` |
| Amount ends in .13 | Completed with discrepancy | `completed_with_discrepancy` |
| All other amounts | Successfully reconciled | `completed` |

**Example**:
- `$100.00` → ✅ Completed
- `$250.13` → ⚠️ Completed with $0.13 discrepancy
- `$0.00` → ❌ Failed
- `-$50.00` → ❌ Failed

## Job Processing Flow

```
1. Poll recon_jobs table (every 2 seconds)
   ↓
2. Lock job using SELECT FOR UPDATE SKIP LOCKED
   ↓
3. Fetch payment details
   ↓
4. Apply reconciliation rules
   ↓
5. Create reconciliation_result record
   ↓
6. Update payment status
   ↓
7. Calculate new account balance
   ↓
8. Create ledger_entry
   ↓
9. Mark job as completed
```

## Tech Stack

- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Database**: PostgreSQL 17
- **Connection**: pg (node-postgres)

## Development

### Standalone Development

```bash
npm install
npm run dev
```

Requires Postgres with the payments schema.

### Multi-Repo Development

This repository is designed to work as part of a multi-repo setup:

1. Open [payments-api](https://github.com/YOUR_USERNAME/payments-api) in Ona/Gitpod
2. This repo is automatically cloned to `/workspaces/recon-worker`
3. Dependencies are installed via automations
4. Worker starts automatically with the full system

## Configuration

Environment variables:

- `PGHOST` - Postgres host (default: `localhost`)
- `PGPORT` - Postgres port (default: `5432`)
- `PGDATABASE` - Database name (default: `payments`)
- `PGUSER` - Database user (default: `postgres`)
- `PGPASSWORD` - Database password (default: `postgres`)

## Project Structure

```
src/
├── index.ts        # Main worker loop and job processing
├── db.ts           # Postgres connection and query helper
└── reconcile.ts    # Reconciliation business logic
```

## Key Features

### Distributed Locking

Uses Postgres row-level locking to safely process jobs in parallel:

```sql
SELECT id, payment_id FROM recon_jobs
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED
```

This ensures:
- Multiple workers can run simultaneously
- No job is processed twice
- Failed workers don't block the queue

### Running Balance

Maintains accurate running balance in ledger:

```typescript
const currentBalance = await getCurrentBalance(accountId);
const newBalance = currentBalance + paymentAmount;
await createLedgerEntry(accountId, paymentId, amount, newBalance);
```

### Lock Timeout

Jobs locked for more than 30 seconds are automatically released:

```sql
WHERE status = 'processing' 
  AND locked_at < NOW() - INTERVAL '30 seconds'
```

## Monitoring

The worker logs all activity:

```
✅ Recon worker worker-12345 started
Processing job abc-123 for payment xyz-789
✅ Job abc-123 completed successfully
```

View logs via automations:
```bash
gitpod automations service logs worker
```

## Related Repositories

- **[payments-api](https://github.com/YOUR_USERNAME/payments-api)** - Main orchestrator repository
- **[payments-ui](https://github.com/YOUR_USERNAME/payments-ui)** - Next.js interface

## Getting Started

**Don't clone this repo directly!** Instead:

1. Open [payments-api](https://github.com/YOUR_USERNAME/payments-api) in Ona/Gitpod
2. The devcontainer will automatically clone this repo
3. All services will start together
4. Worker begins processing jobs automatically

## Scripts

- `npm run dev` - Start worker with hot reload
- `npm run build` - Compile TypeScript
- `npm run start` - Start compiled worker

## Database Schema

The worker interacts with these tables:

- `recon_jobs` - Job queue
- `payments` - Payment records
- `reconciliation_results` - Reconciliation outcomes
- `ledger_entries` - Account ledger

See [payments-api](https://github.com/YOUR_USERNAME/payments-api) for schema details.

## License

MIT
