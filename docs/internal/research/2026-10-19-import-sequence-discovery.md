# Import sequence discovery hot path

Date: 2026-10-19
Scope: source inspection and a pure in-memory algorithm benchmark. No product source was changed.

The captured timings use baseline source ref `589d41aaa334c9b04c4623741ea7cdf45c4dafb3` (recorded in the JSON metadata); the benchmark now reads both required TypeScript files from that Git ref by default. Pass `--source-ref=<git-ref>` to compare another committed source snapshot. Existing timing samples were retained without rerunning the benchmark.

## Findings

`detectImageSequences` groups and sorts frames, then grows each consecutive run with `run = [...run, frame]` (`src/shared/image-sequence.ts:193-259`, especially `:246-255`). On one run of length *L*, that expression copies roughly `L × (L - 1) / 2` frame references. Replacing only that append with `run.push(frame)` preserves the same run builder output while reducing that portion to linear work. The benchmark loads the production TypeScript module and makes the substitution in memory, so the comparison exercises the current parser, grouping, padding partitions, sorting, and output code.

The same detector is called at least twice in an ordinary managed import: `completePreparedImport` builds `sequenceBatchPaths` before presenting conflict decisions (`src/worker/library-service.ts:43417-43423`), and `resolveImport` builds it again before applying decisions (`:44811-44817`). Those calls are made for the normal hash-checking path even when image-sequence creation is disabled; they prevent numbered frame runs from being mistaken for duplicate content. A third detector call can occur after import in the renderer when sequence detection is enabled and auto-detection is off (`src/renderer/App.tsx:9629-9643`). The worker's post-commit grouping also detects runs when `createImageSequence` is enabled (`src/worker/library-service.ts:18676-18753`).

Two selected-file helpers repeat more work per selected item. `expandImageSequenceSourcePaths` lists and filters the parent directory, then calls `findImageSequenceContaining` for every selected path (`src/worker/library-service.ts:13107-13133`). The explicit sequence offer probe repeats the same parent-directory listing and full `find` call for each selected path (`:13203-13214`). `findImageSequenceContaining` itself calls `detectImageSequences` over the entire sibling list (`src/shared/image-sequence.ts:263-271`). For *S* selected frames among *L* same-directory files, current source therefore repeats directory enumeration and detection *S* times. The prototype detects once, creates a map from frame value to the first candidate containing it, and looks up all selected paths; it matches the existing `.find(...some(...))` selection behavior on the fixture set.

The renderer has another long-run cost after detection: `postImportSequencePlanFromAssets` looks up each candidate frame number with `candidate.frames.find(...)` inside per-frame mapping (`src/renderer/post-import-image-sequences.ts:71-76, 96-103`). That is quadratic for a long candidate and can use the same first-match map pattern. The worker already uses a path map for this operation (`src/worker/library-service.ts:18747-18753`), which is a local reuse point.

## When these paths run

`prepareImport` calls `expandImageSequenceSourcePaths` only when `expandImageSequences` is true and the source kind is `files` (`src/worker/library-service.ts:13442-13480`). File chooser commands set that flag only for unpackaged E2E; ordinary desktop file chooser imports leave it false (`src/main/commands/asset-ingestion.ts:29-45`). Folder imports use `sourceKind: "folder"` and recursively enumerate files without per-file sequence expansion (`:47-60`; worker traversal is `src/worker/library-service.ts:13367-13440`). Both still pass through the two pre-commit sequence detections described above.

Main also has `maybeProbeImportSequences` (`src/main/index.ts:3542-3552`). It probes only `asset.import.prepare` commands with `sourceKind: "files"`, with expansion off, and excludes the native file chooser, drop, sequence-confirm, and file-paste request types (`src/main/library-request/ingestion.ts:410-467`). That helper's gate is request/command shape; it does not read the sequence preference flags. An explicit drop decision to import a sequence has a separate probe in `:84-120`. Post-import sequence suggestions are preference-gated in `src/renderer/App.tsx:9629-9643`; the default preferences enable detection but keep auto-detection off (`src/renderer/image-sequence-preferences.ts:10-20`).

## Pure algorithm measurements

Command run:

```text
node scripts/bench-import-sequence-discovery.mjs --out=docs/internal/research/2026-10-19-import-sequence-discovery-results.json
```

The script uses generated filenames in memory. One 33-filename mixed fixture passed full detector-output equivalence, and all 11 selected-frame/missing-value lookups matched. Coverage includes independent runs, gaps, padded and unpadded runs, parentheses style, duplicate frame values, directory isolation, unsupported extensions, and a missing selection. The default run is intentionally limited to 1,000 siblings and selected counts 1 and 10. On Node v24.14.0, with three timed samples after a warm-up:

| Case | Existing source | Prototype | Source-derived work |
|---|---:|---:|---|
| Detect one 1,000-frame run | 1.767 ms median | `push`: 1.041 ms | Existing append copies an estimated 499,500 array elements per call |
| Find 1 selected frame in 1,000 siblings | 1.569 ms | detect once + index: 0.904 ms | 1 vs. 1 modeled parent-directory enumeration; 1,000 vs. 1,000 detector inputs |
| Find 10 selected frames in 1,000 siblings | 15.533 ms | detect once + index: 0.781 ms | 10 vs. 1 modeled parent-directory enumerations; 10,000 vs. 1,000 detector inputs; 4,995,000 estimated append copies in the repeated path |

These are algorithm-only timings, not import throughput estimates. They omit filesystem enumeration latency, media metadata reads, worker message scheduling, and disk contention. The parent-directory counts are modeled from the current source call structure; the benchmark made zero filesystem calls and does not measure `readdir`.

The larger requested matrix (1k/5k/20k single-run detection and 1/10/50 selected frames at 1k/5k siblings) is available through `--full`, but was not run in this pass. The script rejects cases above one billion estimated spread-copy assignments. Coordinate before running the larger matrix; in particular, do not increase the selected count to hundreds for a 20k sibling list.

## Candidate changes to validate

1. Replace the run spread append with `push`. It is a small, output-equivalent change and benefits every full detection call, including import conflict planning.
2. Group selected paths by parent directory, enumerate each parent once, call the detector once per directory, and index candidate frames for selected lookups. Preserve first-candidate semantics, duplicate path behavior, sequence order, and error handling. This applies to both expansion and explicit sequence probing.
3. Replace renderer per-frame `candidate.frames.find` lookups with a first-match frame-number map, matching the worker's existing `rowsByPath` mapping style.

The benchmark script and the captured default result are [scripts/bench-import-sequence-discovery.mjs](../../../scripts/bench-import-sequence-discovery.mjs) and [2026-10-19-import-sequence-discovery-results.json](2026-10-19-import-sequence-discovery-results.json). The current unit semantics live in `tests/unit/image-sequence.test.ts:101-342`.
