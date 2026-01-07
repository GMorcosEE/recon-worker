import { query, pool } from './db';
import { reconcilePayment } from './reconcile';

const WORKER_ID = `worker-${process.pid}`;
const POLL_INTERVAL_MS = 2000;
const LOCK_TIMEOUT_MS = 30000;

async function processJob(jobId: string, paymentId: string) {
  console.log(`Processing job ${jobId} for payment ${paymentId}`);

  const paymentResult = await query('SELECT * FROM payments WHERE id = $1', [paymentId]);

  if (paymentResult.rows.length === 0) {
    console.error(`Payment ${paymentId} not found`);
    await query(
      `UPDATE recon_jobs SET status = 'failed', updated_at = NOW() WHERE id = $1`,
      [jobId]
    );
    return;
  }

  const payment = paymentResult.rows[0];
  const reconResult = reconcilePayment(payment);

  await query('BEGIN');

  try {
    await query(
      `INSERT INTO reconciliation_results (payment_id, recon_job_id, status, matched, discrepancy_amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        paymentId,
        jobId,
        reconResult.status,
        reconResult.matched,
        reconResult.discrepancyAmount,
        reconResult.notes,
      ]
    );

    await query(
      `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
      [reconResult.matched ? 'completed' : 'failed', paymentId]
    );

    const currentBalanceResult = await query(
      `SELECT balance_after FROM ledger_entries
       WHERE account_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [payment.account_id]
    );

    const currentBalance = currentBalanceResult.rows.length > 0
      ? parseFloat(currentBalanceResult.rows[0].balance_after)
      : 0;

    const newBalance = currentBalance + parseFloat(payment.amount);

    await query(
      `INSERT INTO ledger_entries (account_id, payment_id, entry_type, amount, balance_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [payment.account_id, paymentId, 'payment', payment.amount, newBalance.toFixed(2)]
    );

    await query(
      `UPDATE recon_jobs SET status = 'completed', updated_at = NOW() WHERE id = $1`,
      [jobId]
    );

    await query('COMMIT');

    console.log(`✅ Job ${jobId} completed successfully`);
  } catch (error) {
    await query('ROLLBACK');
    console.error(`❌ Job ${jobId} failed:`, error);

    await query(
      `UPDATE recon_jobs SET status = 'failed', attempts = attempts + 1, updated_at = NOW() WHERE id = $1`,
      [jobId]
    );
  }
}

async function pollJobs() {
  try {
    const result = await query(
      `UPDATE recon_jobs
       SET status = 'processing',
           locked_at = NOW(),
           locked_by = $1,
           attempts = attempts + 1,
           updated_at = NOW()
       WHERE id IN (
         SELECT id FROM recon_jobs
         WHERE status = 'pending'
            OR (status = 'processing' AND locked_at < NOW() - INTERVAL '${LOCK_TIMEOUT_MS} milliseconds')
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, payment_id`,
      [WORKER_ID]
    );

    if (result.rows.length > 0) {
      const job = result.rows[0];
      await processJob(job.id, job.payment_id);
    }
  } catch (error) {
    console.error('Error polling jobs:', error);
  }
}

async function start() {
  console.log(`✅ Recon worker ${WORKER_ID} started`);

  setInterval(pollJobs, POLL_INTERVAL_MS);

  process.on('SIGTERM', async () => {
    console.log('Shutting down worker...');
    await pool.end();
    process.exit(0);
  });
}

start();
