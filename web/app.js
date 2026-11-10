import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { auditId, evidenceFrom, receiptState } from './lifecycle.mjs';
import config from './config.json';

const ui = id => document.getElementById(id);
const keys = ['before_url', 'before_sha', 'after_url', 'after_sha', 'notes_url', 'notes_sha'];
const client = createClient({chain: studionet});
const explorer = 'https://explorer-studio.genlayer.com';
ui('repo').href = 'https://github.com/' + config.repo + '/blob/' + config.sourceCommit + '/contracts/archive_gap.py';
ui('contract').href = explorer + '/address/' + config.address;
ui('studio').href = 'https://studio.genlayer.com/?import-contract=' + config.address;

let reportRequest = 0;
let trackingRequest = 0;

function args() {
  return keys.map(key => ui(key).value.trim());
}

function add(parent, tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  parent.append(node);
  return node;
}

function table(parent, title, headings, rows) {
  add(parent, 'h3', title);
  if (!rows.length) {
    add(parent, 'p', 'No changes detected in these releases.');
    return;
  }
  const wrapper = add(parent, 'div', '', 'table-wrap');
  const grid = add(wrapper, 'table', '');
  grid.setAttribute('aria-label', title);
  const head = add(add(grid, 'thead', ''), 'tr', '');
  headings.forEach(heading => add(head, 'th', heading).scope = 'col');
  const body = add(grid, 'tbody', '');
  for (const row of rows) {
    const element = add(body, 'tr', '');
    row.forEach(value => add(element, 'td', value));
  }
}

const spec = value => value ? value.unit + ' · ' + value.method : 'Absent';
const cell = value => value.length ? JSON.stringify(value[0]) : 'Absent';
const rowValue = value => value === null ? 'Absent' : JSON.stringify(value);

function showReport(report, input) {
  const output = ui('report');
  add(output, 'h3', report.dataset ?? 'Evidence could not be verified');
  if (report.dataset) add(output, 'p', `${report.before_version} → ${report.after_version}`);
  add(output, 'p', report.outcome.replaceAll('_', ' '),
      report.outcome === 'UNDISCLOSED_MATERIAL_CHANGE' ? 'tag gap' : 'tag');
  add(output, 'p', 'Reason · ' + report.reason.replaceAll('_', ' ').toLowerCase());
  add(output, 'p', 'Audit ID · ' + report.audit_id, 'meta');
  add(output, 'p', 'Decision SHA-256 · ' + report.decision_sha256, 'meta');
  if (report.diff) {
    table(output, 'Field definitions', ['Field', 'Earlier release', 'Updated release', 'Disclosure finding'],
      Object.entries(report.diff.fields).map(([field, value]) => [
        field, spec(value.before), spec(value.after), (report.findings[field] ?? '—').replaceAll('_', ' '),
      ]));
    const rows = Object.entries(report.diff.rows).flatMap(([id, value]) => {
      if (Object.hasOwn(value, 'before') && Object.hasOwn(value, 'after') &&
          (value.before === null || value.after === null)) {
        return [[id, 'Entire row', rowValue(value.before), rowValue(value.after)]];
      }
      return Object.entries(value).map(([field, change]) => [id, field, cell(change.before), cell(change.after)]);
    });
    table(output, `Changed rows (${Object.keys(report.diff.rows).length})`,
      ['Row key', 'Field', 'Before', 'After'], rows);
  }
  const sources = add(output, 'details', '');
  add(sources, 'summary', 'Pinned evidence and checksums');
  const list = add(sources, 'ul', '', 'sources');
  const evidence = evidenceFrom(input);
  evidence.urls.forEach((url, index) => {
    const item = add(list, 'li', '');
    const link = add(item, 'a', ['Earlier release ↗', 'Updated release ↗', 'Publisher notes ↗'][index]);
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    add(item, 'div', evidence.sha256[index], 'meta');
  });
}

async function loadReport(input) {
  const current = ++reportRequest;
  ui('report').replaceChildren();
  ui('report-status').textContent = 'Reading finalized Studionet state…';
  try {
    const id = await auditId(input);
    const raw = await client.readContract({
      address: config.address, functionName: 'get_audit', args: [id],
      transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
    });
    if (current !== reportRequest) return;
    if (!raw) {
      ui('report-status').textContent = 'No finalized audit for these inputs. Submit in Studio or wait for finalization.';
      return;
    }
    const record = JSON.parse(raw);
    if (record.audit_id !== id) throw new Error('The returned audit ID does not match the evidence.');
    showReport(record, input);
    ui('report-status').textContent = 'Read from finalized Studionet state.';
  } catch (error) {
    if (current === reportRequest) ui('report-status').textContent = 'Unable to load audit. ' + (error.shortMessage ?? error.message);
  }
}

async function track(hash, input) {
  const current = ++trackingRequest;
  ui('tx-link').href = explorer + '/tx/' + hash;
  ui('tx-link').hidden = false;
  ui('tx-status').textContent = 'Looking up the transaction…';
  for (let attempt = 0; attempt < 36 && current === trackingRequest; attempt++) {
    try {
      const tx = await client.getTransaction({hash});
      if (current !== trackingRequest) return;
      const recipient = tx?.to_address ?? tx?.recipient;
      if (recipient && recipient.toLowerCase() !== config.address.toLowerCase()) {
        ui('tx-status').textContent = 'This transaction targets a different contract.';
        return;
      }
      const state = receiptState(tx);
      ui('tx-status').textContent = state.message;
      if (state.done) {
        if (state.success && input?.every(Boolean) && keys.every((key, index) => ui(key).value.trim() === input[index])) {
          await loadReport(input);
        }
        return;
      }
    } catch (error) {
      if (current !== trackingRequest) return;
      ui('tx-status').textContent = 'Receipt unavailable. Retrying… ' + (error.shortMessage ?? error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (current === trackingRequest) ui('tx-status').textContent += ' Polling paused. Track again to resume.';
}

function demo(name) {
  const {args: input, transaction} = config.demos[name];
  keys.forEach((key, index) => ui(key).value = input[index]);
  ui('tx-hash').value = transaction ?? '';
  ui('arguments').replaceChildren();
  loadReport(input);
  if (transaction) track(transaction);
}

ui('gap-demo').addEventListener('click', () => demo('gap'));
ui('disclosed-demo').addEventListener('click', () => demo('disclosed'));
ui('evidence').addEventListener('submit', event => {
  event.preventDefault();
  loadReport(args());
});
ui('evidence').addEventListener('input', () => {
  ++reportRequest;
  ui('report').replaceChildren();
  ui('arguments').replaceChildren();
  ui('report-status').textContent = 'Evidence changed. Read the finalized audit for the new inputs.';
});
ui('failed-demo').addEventListener('click', () => {
  ui('tx-hash').value = config.failedTransaction;
  track(config.failedTransaction);
});
ui('tracker').addEventListener('submit', event => {
  event.preventDefault();
  track(ui('tx-hash').value.trim(), args());
});
ui('copy').addEventListener('click', async () => {
  ui('arguments').replaceChildren();
  try {
    const input = args();
    evidenceFrom(input);
    const values = keys.map((key, index) => `${key}\n${input[index]}`).join('\n\n');
    add(ui('arguments'), 'pre', values, 'meta');
    await navigator.clipboard.writeText(values);
    ui('copy-status').textContent = 'Copied. Paste each value into its named Studio field.';
  } catch (error) {
    ui('copy-status').textContent = error.name === 'NotAllowedError'
      ? 'Clipboard access is unavailable. Select and copy the arguments below.'
      : error.message;
  }
});
