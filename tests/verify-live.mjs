import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { auditId, receiptState } from '../web/lifecycle.mjs';

const config = JSON.parse(await readFile(new URL('../web/config.json', import.meta.url)));
const source = await readFile(new URL('../contracts/archive_gap.py', import.meta.url), 'utf8');
const client = createClient({chain: studionet});
assert.equal(studionet.id, 61999);

async function receipt(hash, success) {
  const tx = await client.getTransaction({hash});
  assert.equal(tx.statusName, 'FINALIZED');
  assert.equal(tx.to_address.toLowerCase(), config.address.toLowerCase());
  assert.equal(receiptState(tx).success, success);
  return tx;
}

await Promise.all([
  (async () => {
    assert.equal(await client.getContractCode(config.address), source);
    console.log('Deployed source matches local source.');
  })(),
  ...Object.entries(config.demos).map(async ([name, demo]) => {
    const id = await auditId(demo.args);
    const [tx, raw] = await Promise.all([
      receipt(demo.transaction, true),
      client.readContract({address: config.address, functionName: 'get_audit', args: [id],
                           transactionHashVariant: TransactionHashVariant.LATEST_FINAL}),
    ]);
    const result = JSON.parse(raw);
    assert.equal(result.audit_id, id);
    assert.equal(result.outcome, name === 'gap' ? 'UNDISCLOSED_MATERIAL_CHANGE' : 'DISCLOSED');
    assert.deepEqual(Object.keys(result.diff.rows), ['H01/2025-01-01', 'H01/2025-01-02', 'H02/2025-01-01']);
    const leader = tx.consensus_data.leader_receipt[0];
    assert.equal(JSON.parse(leader.result.payload.readable), id);
    assert.ok(Object.values(tx.consensus_data.votes).filter(vote => vote === 'agree').length >= 3);
    console.log(result.outcome, id, result.decision_sha256);
  }),
  (async () => {
    const input = [...config.demos.disclosed.args];
    input[5] = '0'.repeat(64);
    const id = await auditId(input);
    const [tx, raw] = await Promise.all([
      receipt('0x20819a1e7327c4de5d23ba32517019a96b43ad315ec00f3787c8730565ade462', true),
      client.readContract({address: config.address, functionName: 'get_audit', args: [id],
                           transactionHashVariant: TransactionHashVariant.LATEST_FINAL}),
    ]);
    const record = JSON.parse(raw);
    assert.equal(record.audit_id, id);
    assert.equal(record.outcome, 'INCONCLUSIVE');
    assert.equal(record.reason, 'EVIDENCE_INVALID');
    assert.equal(record.diff, null);
    assert.equal(JSON.parse(tx.consensus_data.leader_receipt[0].result.payload.readable), id);
    console.log(record.outcome, id, record.decision_sha256);
  })(),
  (async () => {
    await receipt(config.failedTransaction, false);
    console.log('Invalid digest receipt finalized with failed execution.');
  })(),
]);
