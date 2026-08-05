Critic lane executed by architect runner fallback (critic model backend unavailable).

# Critic Review — stage-01-planner (ADR-001..ADR-022 Rust platform build plan)

## Verdict: ITERATE

OKAY is withheld only because two concrete, nameable gaps would force an executor to guess at M0 start. The plan is otherwise excellent: deliberate-mode sections are all present and substantive, ADR fidelity is high, and per-milestone acceptance + verification commands are concrete. Requested expansions are small and targeted, not structural defects.

## Deliberate-mode section check
- RALPLAN-DR present: Principles (5), Decision Drivers (top 3), Viable Options with >=2 alternatives and pros/cons/invalidation for BOTH decisions (repo topology A/B; delivery sequencing C/D) plus two additional bounded option gates (SBE codec 3 options, shared-memory ring 3 options). PASS — alternatives are genuinely weighed and invalidations are tied to drivers, not strawmen.
- Pre-mortem: exactly 3 scenarios (SBE/shm corruption; WAL duplicate order; scope explosion) each with concrete mitigations. Meets the >=3 bar. PASS (not hollow).
- Test plan: unit/integration/e2e/observability layers all expanded with specific signals and health semantics. PASS.
- Risk table (12 rows) + rollback/kill-switch story + 14 open assumptions. PASS.

## ADR fidelity check (spot-verified)
- ADR-004/005/006 data paths: SPSC (M2), shm+eventfd same-host (M2), TCP+SBE cross-host (M2). Match.
- ADR-007 gRPC control-only, no market data: M8 asserts this with a static-check acceptance criterion. Match.
- ADR-011 TradeIntent->Portfolio->Risk->Execution->PrivateConnector: crates + M4a. Match.
- ADR-013 sharded single-writer, no global RwLock<HashMap>: market-state crate rule + intent diff. Match.
- ADR-014 two PostgreSQL (Core/Analytics), no TSDB: M5. Match.
- ADR-015/016 Parquet full-fidelity + tiered retention: M5. Match.
- ADR-017 append-only WAL before send: M4a. Match.
- ADR-022 three-node placement: M9 mirrors Node1/2/3 assignment. Match.
- Forbidden tech (Kafka/K8s/Aeron/QUIC/WASM/ClickHouse/DuckDB) explicitly in out-of-scope. Match.

## Findings

1. [MEDIUM — P2] M0 peak-rate / SLO capture is underspecified (no-guessing executability gap). M0 acceptance requires "initial latency/data-loss/order-safety SLOs from captured peak-rate evidence" and the SBE/shm spikes must "benchmark at at least 2x measured peak event rate," but the Binance ingestion capability is an M1 deliverable and no M0 capture harness or data source is named. Open Assumption #7 says "M0 measures representative traffic" without saying how. An executor starting M0 tomorrow must guess the source of "measured peak." REQUESTED EXPANSION: add an explicit M0 sub-task naming the peak-rate capture method (e.g., a throwaway Binance public-WS rate-sampling spike, or cited public exchange volume stats), state whether M0 SLOs are provisional and refined at end of M1, and name the SLO artifact path (e.g., docs/architecture/slo-budgets.md) so M2's "within the M0 budget" acceptance references a concrete file.

2. [MEDIUM — P2] Principle 2 conflicts with the delivery sequencing. Principle 2 states: prove one read-only vertical slice AND one crash-safe paper order path "before adding transport complexity, live capital, or fan-out." But sequencing is M1 (read-only, in-process) -> M2 (transport) -> M3 (strategy) -> M4a (paper order path), so transport is added BEFORE the paper order path. The dependency is legitimate (intent->trading crosses process boundaries via ADR-005/022, so transport must precede the cross-process paper path), but the stated principle contradicts it. REQUESTED EXPANSION: reword Principle 2 to reflect the real gate structure (read-only slice before transport; paper order path before live capital) OR add a one-line reconciliation in Delivery Sequencing explaining why transport necessarily precedes the paper path.

3. [LOW — P3] "Six coarse processes" vs seven runtime concerns is left implicit. apps/ lists six binaries (market-data, strategy, trading, storage-replay, alert, control-plane); ADR-001 enumerates six roles that include PostgreSQL (external) and do not list a separate control-plane. The mapping of the plan's six app binaries + gRPC control-plane onto ADR-001's six roles is never made explicit, so the process count reads ambiguously. REQUESTED EXPANSION: add a one-line role-to-ADR mapping table.

4. [LOW — P3] M0 lists "code coverage reporting" with no threshold or gate semantics. REQUESTED EXPANSION: state whether coverage is informational or gated, and the threshold if gated.

5. [LOW — P3] M4 retirement-gate timing is stated twice with slightly different anchors (crate rules: "deleted at the M4 retirement gate"; deletion actually lands in M4b acceptance). Harmless but worth pinning to "M4b" consistently to avoid an executor deleting legacy during M4a.

## What is strong (no change requested)
- Order-safety semantics (stable client-order IDs, append+fsync before send, no blind retry of sent-unknown, reconcile-before-retry, fail-closed ambiguity) are internally consistent across Principles, M4a/M4b, WAL crate rules, pre-mortem #2, and gate G2. This is the highest-risk area and it is coherent.
- Verification commands are concrete and per-milestone; external/sandbox tests are correctly marked --ignored and credential-scoped.
- macOS-vs-Linux hazard is treated as a first-class driver with Linux CI from M0, not a late check.
- Open assumptions (14) are complete across exchanges, hardware, SLOs, numeric model, deps, network security, and legacy provenance; none silently enables live trading.

## Architectural Status: WATCH
## Verdict: ITERATE (address findings 1 and 2 to reach OKAY; findings 3-5 are cleanups)
