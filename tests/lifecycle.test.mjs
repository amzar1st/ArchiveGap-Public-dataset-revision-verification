import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditId, evidenceFrom, receiptState } from '../web/lifecycle.mjs';

const config = JSON.parse(readFileSync(new URL('../web/config.json', import.meta.url)));
const input = config.demos.gap.args;

test('audit ID matches contract canonical evidence digest', async () => {
  assert.equal(await auditId(input), '0a720c4b68ca29838cf65e0619f67377bca72c86c1dd0ab152fca43524e93495');
  assert.notEqual(await auditId(input), await auditId(config.demos.disclosed.args));
});

test('browser rejects mutable and cross-publisher evidence', () => {
  const modified = [...input];
  modified[0] = modified[0].replace(/\/[a-f0-9]{40}\//, '/main/');
  assert.throws(() => evidenceFrom(modified), /pinned/);
  modified[0] = input[0].replace('amzar1st', 'other');
  assert.throws(() => evidenceFrom(modified), /same publisher/);
  modified[0] = input[0];
  modified[1] = 'invalid';
  assert.throws(() => evidenceFrom(modified), /SHA-256/);
});

test('receipt lifecycle separates consensus and execution', () => {
  assert.equal(receiptState(null).done, false);
  assert.equal(receiptState({statusName: 'ACCEPTED'}).done, false);
  assert.equal(receiptState({statusName: 'CANCELED'}).done, true);
  assert.equal(receiptState({statusName: 'FINALIZED'}).message, 'Finalized · execution result unavailable');
  for (const [status, success] of [['return', true], ['user_error', false]]) {
    const state = receiptState({statusName: 'FINALIZED', consensus_data: {leader_receipt: [{result: {status}}]}});
    assert.equal(state.success, success);
    assert.match(state.message, success ? /succeeded/ : /failed/);
  }
});
