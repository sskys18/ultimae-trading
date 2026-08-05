# Architect Review - RALPLAN Stage 01 (Planner) - Ultimae Trading Rust Rebuild

## Summary
The plan is a high-quality, ADR-faithful 10-milestone vertical-slice rebuild that correctly gates the two lethal risks (unsafe transport/SBE/shm behind G0, order duplication behind G2) and keeps live capital off until G4. It is architecturally sound and introduces no forbidden dependencies. Recommendation is COMMENT / WATCH: three HIGH-severity gaps (in-process connector fault isolation, an M0 SLO ordering inversion, and a universal client-order-ID reconciliation assumption) plus several MEDIUM sequencing/scope clarifications should be resolved before this is accepted as the release baseline, but none is fatal.

## Claims (under review)
- The plan implements ADR-001..ADR-022 as an in-place Cargo workspace, ~35 crates + 6 apps, across three Linux nodes. [Verified against plan topology + ADR set]
- No fixed ADR is violated: Kafka/K8s/Aeron/QUIC/WASM/gRPC-market-data/exchange-types-in-core/PG-full-depth are all explicitly out of scope. [Verified]
- Two lethal failure domains are correctly gated: transport unsafe code (G0: golden vectors, 2x peak, 24h Linux soak) and order duplication (G2: WAL-before-send + fsync, no blind retry of sent-unknown, client-order-ID reconciliation, fail-closed ambiguity). [Verified, strong]
- Fan-out (30+ exchanges/30+ strategies) is correctly treated as throughput/conformance work behind M1-M9, not up-front architecture. [Verified]

## Analysis
### Strengths
- Milestone ordering is mostly dependency-correct: canonical contracts (M0) -> read-only in-process slice (M1) -> transports (M2) -> strategy/shadow (M3) -> paper WAL then sandbox (M4a/b) -> storage (M5) -> replay (M6) -> alerts (M7) -> control (M8) -> deploy (M9) -> fan-out (M10). Keeping M1 in-process and deferring shm/SBE to M2 behind G0 is the right risk posture.
- WAL-before-send and reconciliation are textbook-correct: append+fsync TradeIntent/RiskDecision/OrderCommand before external send, torn-final-frame truncation only, interior corruption halts, sent-unknown queried before retry, PG explicitly NOT the retry-safety source. Pre-mortem #2 names the exact crash-after-accept-before-ack window.
- Schema evolution: expand-first, old/new reader-writer matrix, golden bytes, snapshot versioning, rollback-compatibility gate. Solid within each representation.
- Live-capital gate (G4) and the local Node-2 emergency kill path independent of gRPC are comprehensive and fail-closed by default (live_enabled=false).
- Crate decomposition is sane: strategy-api dependency-fenced (no connector/SQL/fs/http/secret), process-common guarded against dumping-ground, unsafe isolated to transport-shm.

### Tensions / gaps (see Findings for severity)
1. Fault isolation is only along the ROLE axis. ADR-001's rationale ("30+ exchanges in one process breaks fault isolation") is honored for strategies (ADR-009 process groups) but NOT for connectors: 30+ public connectors share one market-data-runtime process with no described isolation mechanism.
2. M0 requires SLOs/benchmarks "from measured peak" but the feed that produces peak is M1 - an ordering inversion only implicitly patched by assumption #7.
3. Reconciliation universally assumes client-order-ID lookup; not all venues support it, breaking the order-safety invariant at fan-out.
4. M10 concentrates the largest work volume with no internal capacity checkpoints and no escape valve if 3 fixed nodes saturate.
5. Observability (M9) and alerting (M7) land after milestones whose acceptance already depends on "visible metrics" and "pages the operator."
6. The gRPC control-plane process is unplaced in the ADR-022 node mapping; "six coarse roles" quietly reinterprets ADR-001's process set (drops PostgreSQL, adds control-plane).
7. No single cross-representation schema-version map (canonical<->SBE<->Parquet<->Proto<->PG); historical Parquet replay across retention windows needs a versioned multi-generation reader.

## Root Cause
Not a defect review. The recurring theme in the gaps is acceptance-criteria/dependency skew: several milestones assert exit criteria that depend on capabilities introduced by a LATER milestone (metrics/paging, PG materialization, measured peak). The plan's vertical-slice discipline is right; the fix is to make each milestone's acceptance testable with only what exists at that point, and to add the two missing isolation/capability mechanisms (connector isolation, reconciliation-key capability).

## Findings
- HIGH / risk - Connector fault isolation within single market-data-runtime unspecified (apps/, M1, M10). Impact: one connector panic/OOM downs all Node-1 feeds, contradicting ADR-001. Fix: per-connector supervised tasks (catch_unwind, bounded queues/RSS, watchdog) and/or venue-tier process groups mirroring ADR-009.
- HIGH / risk - M0 SLO/benchmark ordering inversion (M0 acceptance, G0). Impact: M0 acceptance and G0 soak target unsatisfiable in stated order. Fix: explicit M0 feed-rate capture spike, or provisional-SLO + mandatory M1 re-validation feeding G0.
- HIGH / risk - Reconciliation assumes client-order-ID lookup at every venue (M4a/b, M10, Pre-mortem #2). Impact: order-safety invariant breaks on venues lacking client-order-id query. Fix: add reconciliation-key capability to PrivateConnector declaration; typed fail-closed halt when absent.
- MEDIUM / risk - M10 fan-out lacks capacity checkpoints and node-saturation contingency. Fix: batch M10 with re-measurement/rebalancing gates, per-tier resource budgets, documented "node exceeded" escalation (4th node = ADR change).
- MEDIUM / risk - Observability/alerting (M7/M9) trails milestones that depend on metrics/paging (M1-M4). Fix: minimal scrape-endpoint + log-paging shim from M1; M7/M9 formalize rather than introduce.
- MEDIUM / risk - Control-plane process unplaced; "six coarse roles" vs ADR-001 enumeration. Fix: assign placement (likely Node 2), define kill/status fan-out to all nodes, reconcile wording.
- MEDIUM-LOW / nit - No single schema-version governance across five representations; historical Parquet replay risk. Fix: version-lineage doc + versioned multi-generation Parquet reader.
- LOW / nit - M4a fault matrix references PG materialization boundary not built until M5. Fix: rescope M4a matrix to WAL/send/ack; defer materialization case to M5.
- LOW / nit - No explicit per-edge transport map for the 3-node topology (ADR-005 shm edges become TCP under ADR-022). Fix: add edge->transport table; consider trading-core shared order-state types crate.

## Recommendations (prioritized)
1. Add a connector isolation design section (mechanism + acceptance test) reconciled with ADR-001 - blocking clarification.
2. Add an M0 feed-rate capture spike and make SLOs provisional-until-M1; wire M1 re-validation into the G0 soak target.
3. Add reconciliation-key capability to connector capability declarations with fail-closed policy; make it a per-connector M4b/M10 acceptance item.
4. Decompose M10 into capacity-checkpointed batches with rebalancing gates, per-tier budgets, and a node-saturation escalation path.
5. Add a minimal metrics/alert bridge from M1 so early soak/kill acceptance is verifiable.
6. Assign control-plane node placement and cross-node kill/status fan-out; reconcile the six-roles wording with ADR-001.
7. Add cross-representation schema-version governance + versioned Parquet reader for replay across retention windows.
8. Cleanup: rescope the M4a materialization-boundary case to M5; publish the 3-node edge->transport table.

## Architectural Status
WATCH

## Code Review Recommendation
COMMENT

## Tradeoffs
- Connector isolation: per-connector task supervision (low overhead, weaker isolation) vs venue-tier process groups (true fault domains, more processes/IPC, more Node-1 memory). Recommend hybrid: task supervision default, tier groups for Tier-A live-traded primaries.
- M0 SLOs: provisional-from-docs (fast start, risk of wrong 2x target) vs full M0 capture spike (accurate, small extra M0 cost). Recommend capture spike - order-safety SLOs must be evidence-based.
- M10 staging: single milestone (simple tracking, hides capacity cliffs) vs batched with gates (more ceremony, catches saturation early). Recommend batched given single-operator + fixed-3-node constraints.
