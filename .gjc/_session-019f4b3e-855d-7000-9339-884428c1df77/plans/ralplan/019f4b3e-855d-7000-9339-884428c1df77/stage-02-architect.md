# Architect Review — stage-02-revision.md (ralplan consensus pass 2)

Plan sha256 0f9dcf2eca1ee4c5b88b5f9410202b1a72351e7d7a7b2d10d6163fdd13a8c6d6; ADR set /tmp/ralplan-ultimae/adr-final.md (ADR-001..ADR-022). Read both in full.

## Summary
The revision genuinely resolves all nine prior architect findings (A1-A9) with concrete structural mechanisms, not name-checks, and I found no new material architecture regression introduced by the edits. Plan fidelity to the fixed ADR set is high, sequencing is gated correctly, and order-safety/fault-isolation are treated as product behavior. Recommendation: CLEAR / APPROVE with three P3 polish comments.

## Claims verified
A1-A9 resolution claims checked against plan text and ADR constraints; each maps to a dedicated section plus milestone acceptance + gate coverage.

## Analysis — prior findings A1-A9
- A1 connector fault isolation: RESOLVED. `Connector isolation and supervision` section: market-data-runtime@venue-group, Tier A dedicated process, per-connector supervised Tokio task set + catch_unwind/JoinSet, watchdog + 5-in-10 circuit + quarantine, systemd MemoryMax, attributable buffer budgets. Enforced by M1 acceptance (panic restarts only Binance), M3 (Bithumb separate group), M10 (task-panic AND whole-group-death fault injection). Consistent with ADR-001.
- A2 M0 SLO capture ordering: RESOLVED. M0 work order is capture (feed-rate-probe 24h) -> provisional 2x workload -> SBE/shm spikes against that workload -> G0a approval; M1 hard-revalidates -> G0b at M2. Ordering is genuine, not cosmetic: unsafe transport decisions cannot precede the named artifact.
- A3 reconciliation-key capability + fail-closed: RESOLVED. `Private connector reconciliation-key capability` section, ExactSentUnknownReconciliation classification, HaltReason::SentUnknownUnreconcilable, stream-echo-insufficient rule, never-blind-retry. Reinforced across M4a/M4b, G2, pre-mortem #2. Consistent with ADR-017.
- A4 M10 capacity-checkpointed batches: RESOLVED. Batch plan (M10a<=3, M10b<=5), tier admission budgets as % of group resources, per-batch 2x aggregate replay checkpoint, exceeded-contingency (rollback/regroup/vertical-upgrade, no silent 4th node), ADR escalation. Consistent with ADR-001/022.
- A5 M1 monitoring bridge: RESOLVED. ops/monitoring-bootstrap at M1 (bounded /metrics, JSON logs, scrape+rules, capped page spool) -> M7 formal canonical-event alerting with parity ledger -> M9 productionization. Consistent with ADR-020/021.
- A6 control-plane placement + role-to-ADR table: RESOLVED. `ADR-001 role and node mapping` 7-row table incl auxiliary control adapter; control-plane on Node 2 for local-first kill; Node 1/3 endpoints mTLS control-only; no real-time stream on gRPC. Open assumption 13 records the interpretation. Consistent with ADR-007/022.
- A7 cross-representation schema governance + versioned Parquet reader: RESOLVED. schemas/registry.toml as compatibility ledger, schema-governance.md, CI old/new reader matrices, per-file generation metadata, replay-backtest versioned adapters, adapter-removal blocked while manifests reference. Consistent with ADR-003/015/016.
- A8 M4a fault-matrix scoping: RESOLVED. M4a explicitly excludes PostgreSQL materialization (boundary introduced M5); M5 explicitly extends the crash matrix to PG enqueue/commit/ack/outage/replay/duplicate. Clean deferral, no gap.
- A9 transport-edge table + trading-core crate: RESOLVED. `Concrete transport topology` table covers every producer->consumer edge with ADR-022 placement + same-host collapse; trading-core crate owns IDs/transitions/reconciliation outcomes with no I/O, execution+wal both depend on it. Correctly reconciles ADR-005 shm candidates that are cross-host under 3-node deployment to ADR-006 TCP/SBE.

## New-regression scan (holistic)
No material regressions introduced. Cross-checked: transport table rows vs ADR-004/005/006 (consistent; Node2->Node2 strategy->risk/exec uses shm/eventfd per ADR-005; cross-host edges use TCP/SBE); role table vs ADR-022 node assignment (consistent); TS retirement at M4b does not strand later work (30+ connectors/strategies are new native Rust, salvage-ledger gates deletion, kimchi narrative moved to docs); gRPC remains control-only in all topologies; coverage/gate loop (M0 provisional -> M1 revalidate -> G0b) is closed.

## Root Cause
N/A (no defect under review; plan-fidelity assessment).

## Findings (all P3/LOW, non-blocking)
1. M0 is foundation-heavy; intra-M0 capture->provisional-workload sub-gate is prose-implicit. Recommend making it a hard sub-gate before unsafe transport code.
2. 70% workspace line-coverage floor is modest; 85% safety-critical + property/fuzz/crash-matrix compensates. Suggest branch/mutation expectation for trading-core/wal transition logic.
3. M1 page bridge = single operator channel, no escalation until M7; acceptable pre-live. Confirm capped-spool overflow is fail-loud during paper soaks.

## Recommendations
Proceed to executor lanes per the plan's handoff guidance. Optionally fold the three P3 comments into M0/M1/M4 executor briefs; none gate acceptance. Preserve G0a/G0b/G2/G4/G5 as hard stops.

## Tradeoffs
M0 density vs early contract stability: revision favors stability (correct for order-safety driver). Coverage floor vs velocity: revision leans on targeted 85% + property tests rather than a high uniform floor (acceptable).

## Architectural Status
CLEAR

## Code Review Recommendation
APPROVE
