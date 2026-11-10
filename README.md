# ArchiveGap

ArchiveGap verifies whether release notes disclose a material change to the meaning of historical public data. An unchanged column name can hide a changed unit or calculation. ArchiveGap preserves the exact field and row differences alongside a GenLayer decision about the publisher’s disclosure.

[Public dashboard](https://archivegap.tinymule33.chatgpt.site/) · [Studionet contract](https://explorer-studio.genlayer.com/address/0x22F674e0005355AB289307d9A746c3E5b510ACbE) · [Live verification](docs/LIVE_VERIFICATION.md)

## How it works

1. Supply two release snapshots and the updated publisher notes as public raw GitHub JSON URLs pinned to full commits in the same repository. Provide the SHA-256 of each file's exact bytes.
2. Validators fetch the files independently and check their digests. The contract computes field, unit, methodology and keyed-row differences deterministically.
3. Validators apply the fixed disclosure policy to changed field definitions. The model evaluates meaning and disclosure coverage. The contract checks that any claimed disclosure includes a verbatim quote from the pinned notes. Consensus compares normalized classifications and the deterministic diff.
4. The contract stores the audit and decision fingerprints. The dashboard reads finalized state and tracks Studio receipts.

| Outcome | Interpretation |
| --- | --- |
| `DISCLOSED` | The notes cover all material field-definition changes identified by the review. |
| `UNDISCLOSED_MATERIAL_CHANGE` | At least one identified material field-definition change lacks adequate disclosure. |
| `INCONCLUSIVE` | Evidence or the model response could not be validated, the changes are ambiguous, or the review did not establish a material field-definition change. |

## Try it

Open the dashboard and choose **Load air-quality demo** or **Compare disclosed case**. Both cases use the same fictional Harbor City releases. The earlier export averages all 24 hours and the revised one averages 06:00 through 23:59. Three readings changed and one retained its value.

For your own evidence, fill the six inputs and select **Copy Studio arguments**. Open the linked GenLayer Studio contract, choose **Run and Debug → audit**, paste the named arguments, then send from Studio's built-in account in **Normal (Full Consensus)** mode. Return to the dashboard and track the hash. The dashboard needs no wallet for reads. The built-in account remains in the Studio origin and signs there.

## Evidence format

See [the versioned example files](fixtures/harbor-city/). Both releases have a shared `dataset` ID, distinct `version` labels, `fields` keyed by column name, and `rows` keyed by stable record ID. Every field has a `unit` and a `method`. Every row provides one value per field. Supported values are integers, short strings and null. Use a documented fixed-point scale or canonical decimal strings for fractional observations. The notes file has `dataset`, the updated `version`, and a `notes` string.

The MVP accepts normalized JSON snapshots up to 16 KiB per file, 60 rows and eight fields per snapshot. Publishers can expose a versioned audit slice for larger datasets. Stable keys determine row identity. Byte-level string changes are reported as such. The contract does not infer undocumented methodology from changes in values alone. See [security and scope](docs/SECURITY.md).

## Development

Use Node.js 22+ and Python 3.10+.

```sh
npm ci
npm test
npm run build
npm run verify:live
python -m http.server 8080 --directory dist
```

To deploy the contract, import `contracts/archive_gap.py` in [GenLayer Studio](https://studio.genlayer.com/) on Studionet (61999). Choose **Normal (Full Consensus)** and deploy with the built-in account. Once finalized, update `web/config.json` with the new address, source commit and receipts for that deployment before building the static site. The committed defaults point to the verified deployment.

The implementation follows the official [Studio](https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio), [Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle) and [GenLayerJS](https://docs.genlayer.com/api-references/genlayer-js) documentation.
