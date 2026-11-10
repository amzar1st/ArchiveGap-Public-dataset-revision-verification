export const POLICY = 'archivegap-disclosure-v1';
export const HEX = /^[0-9a-f]{64}$/;
const PIN = /^https:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)\/[0-9a-f]{40}\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\.json$/;

export function evidenceFrom(args) {
  const urls = [args[0], args[2], args[4]];
  const sha256 = [args[1], args[3], args[5]];
  const repositories = urls.map(url => {
    const match = PIN.exec(url);
    if (!match || match[0] !== url || url.length > 300 ||
        url.split('/').slice(3).some(part => part === '.' || part === '..')) {
      throw new Error('Use raw GitHub JSON URLs pinned to a full commit SHA.');
    }
    return match[1].toLowerCase();
  });
  if (new Set(repositories).size !== 1 || new Set(urls).size !== 3) {
    throw new Error('Use three distinct files from the same publisher repository.');
  }
  if (sha256.some(hash => !HEX.test(hash) || hash.length !== 64)) {
    throw new Error('Each file needs its lowercase SHA-256 checksum.');
  }
  return {policy: POLICY, publisher_repository: repositories[0], sha256, urls};
}

export async function auditId(args) {
  const canonical = JSON.stringify(evidenceFrom(args));
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function receiptState(tx) {
  const status = tx?.statusName ?? (typeof tx?.status === 'string' ? tx.status : '');
  if (!status) return {done: false, message: 'Waiting for Studio to index the transaction.'};
  const leader = tx.consensus_data?.leader_receipt;
  const receipt = Array.isArray(leader) ? leader[0] : leader;
  const execution = tx.txExecutionResultName ?? receipt?.execution_result ?? receipt?.result?.status;
  if (status === 'FINALIZED') {
    const success = ['FINISHED_WITH_RETURN', 'SUCCESS', 'return'].includes(execution);
    const failed = ['FINISHED_WITH_ERROR', 'ERROR', 'error', 'rollback', 'user_error', 'vm_error', 'contract_error'].includes(execution);
    return {done: true, success, message: 'Finalized · execution ' + (success ? 'succeeded' : failed ? 'failed' : 'result unavailable')};
  }
  if (['CANCELED', 'CANCELLED', 'UNDETERMINED'].includes(status)) return {done: true, message: status};
  return {done: false, message: `Pending finalization · ${status.replaceAll('_', ' ')}`};
}
