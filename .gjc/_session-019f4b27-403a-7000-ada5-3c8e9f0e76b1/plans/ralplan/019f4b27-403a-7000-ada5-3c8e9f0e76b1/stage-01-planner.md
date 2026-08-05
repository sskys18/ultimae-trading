# RALPLAN-DR: ADR-001..ADR-022 Rust platform build plan

## Principles
1. Preserve the fixed ADR boundaries: canonical events isolate exchanges, strategies emit intents, and real-time data never uses gRPC or PostgreSQL as a bus.
2. Prove one read-only vertical slice and one crash-safe paper order path before adding transport complexity, live capital, or exchange and strategy fan-out.
3. Make correctness observable: bounded queues, sequence and schema versions, deterministic replay, durable order state, and fail-closed health gates are product behavior.
4. Reuse the same canonical models and strategy implementation in live, shadow, paper, replay, and backtest modes.
5. Optimize for a single operator: six coarse processes, systemd, two PostgreSQL instances, Parquet, Prometheus, Grafana, and no Kafka or Kubernetes.

## Decision Drivers (top 3)
1. **Order safety and recoverability:** no duplicate or ambiguous exchange action after crashes, reconnects, torn WAL writes, or partial database failure.
2. **Data-path determinism and isolation:** 30+ exchanges and 30+ strategies must not create shared-type coupling, unbounded queues, global locks, or a single-process failure domain.
3. **Incremental operability:** each milestone must run, be measured, and be reversible by one operator before the next layer is added.

## Viable Options
### Repository topology
- **A. In-place Cargo workspace with temporary TypeScript quarantine (selected).** Pros: preserves repository history and issue context, permits behavior-by-behavior salvage, and gives one deployment source of truth. Cons: temporary mixed-tooling noise and an explicit cleanup gate are required.
- **B. Greenfield Cargo workspace in a separate repository.** Pros: clean dependency graph and no legacy layout constraints. Cons: duplicates configuration and documentation, makes parity tracking harder, and risks two deployable products. Invalidated because the requested end state is a rebuild of this repository and the scaffold contains useful strategy scenarios, even though its runtime is not reusable.

### Delivery sequencing
- **C. Milestone vertical slices (selected).** Pros: validates contracts at real boundaries, exposes operational failures early, and keeps live trading gated. Cons: a few components begin as in-process adapters and are moved behind transport later.
- **D. Big-bang component completion.** Pros: all theoretical interfaces can be designed up front. Cons: transport, recovery, and deployment only meet late, so unsafe assumptions survive longest. Invalidated by the order-safety driver and single-operator constraint.

# Summary
Build the ADR architecture as an in-place Rust Cargo workspace in ten gated milestones. Start with canonical events and a Binance public-feed-to-Parquet slice, add Linux SPSC/shared-memory and TCP/SBE transports, then add Bithumb public data and a shadow kimchi-premium strategy. Build the order path paper-first with an append-only WAL and reconciliation before connecting a sandbox private API. Add the two PostgreSQL stores, deterministic replay/backtest, alerts, gRPC control, and three-node systemd operations before permitting live capital. Only then fan out to 30+ exchanges and 30+ strategies.

[High] The current repository is a Node/TypeScript simulation scaffold: `package.json` drives TypeScript and Vitest, `src/index.ts` wires one process, both exchange connectors delegate to `SimulatedExchangeConnector`, market FX is randomized, and flow tests accept simulated orders. [High] `AGENTS.md` describes the superseded TypeScript/Puppeteer design and models Bithumb margin borrowing and repayment through web automation. The Rust implementation must not treat any existing connector, authentication code, test result, or Bithumb margin capability as production evidence.

# Intent Diff
| Area | Current state | Target state |
|---|---|---|
| Runtime | One TypeScript process with timer polling and simulated connectors | Six coarse Rust runtime roles across three Linux nodes per ADR-001, ADR-002, ADR-021, ADR-022 |
| Domain boundary | Exchange and strategy types are directly coupled to the kimchi flow | Versioned canonical Market, Account, Trading, and System events; exchange SDK types stop at connectors |
| Data path | EventEmitter and promises, with no capacity policy | Direct calls on-thread, bounded SPSC across threads, shared memory same-host, persistent TCP/SBE cross-host |
| State | Small mutable objects in one process | Venue+instrument shards with one writer, snapshots, sequence validity, and no global `RwLock<HashMap>` |
| Trading | Strategy builds an exchange-specific multi-leg plan and calls connectors | `TradeIntent -> Portfolio -> Risk -> Execution -> PrivateConnector`, with reservations, netting, idempotency, kill switches, WAL, and reconciliation |
| Storage | Runtime JSON and logs | Core PostgreSQL, Analytics PostgreSQL, full-fidelity Parquet, tiered retention, replay and backtest |
| Operations | PM2 scripts and placeholder docs | systemd units, node-specific config, journald, Prometheus, Grafana, backup/restore, rollout and rollback runbooks |
| Legacy | TypeScript and old `AGENTS.md` appear authoritative | TypeScript is used only as migration reference, then removed; `AGENTS.md` is replaced with Rust contributor and ADR-boundary guidance |

# Decision Drivers
- All ADR-001 through ADR-022 decisions are fixed. Implementation choices may optimize within them but may not introduce Kafka, Kubernetes, Aeron, WASM strategies, gRPC market data, exchange types outside connectors, or PostgreSQL full-depth storage.
- The order path must prefer a safe halt over uncertain retransmission. A sent-but-unconfirmed command is reconciled against exchange state before any retry.
- The data path must define ownership, capacity, overflow, sequence, heartbeat, recovery, and schema compatibility for every boundary.
- The development workstation is macOS arm64 [High], while `eventfd`, POSIX shared memory details, systemd, and the final deployment are Linux-specific. Linux CI and a Linux integration host are prerequisites, not optional final checks.
- Live credentials exist only in the private-connector process boundary on Node 2. Test, paper, shadow, and replay modes must not load them.
- Fan-out is throughput and conformance work, not architecture work. A new exchange changes connector and mapping code only; a new strategy changes strategy code and its manifest only.

# Options
## SBE codec implementation gate
Evaluate these bounded choices in M0, while retaining SBE as fixed by ADR-005 and ADR-006:
1. **Adopt a maintained Rust SBE codec/code generator.** Lower implementation cost; risks include incomplete schema evolution, allocation behavior, generated-code quality, and maintainer continuity.
2. **Use a pinned external SBE schema compiler and repository-owned Rust generation adapter.** Keeps XML schema authoritative; risks toolchain complexity and unsupported Rust output details.
3. **Generate a deliberately small repository-owned codec for the platform templates.** Full control and no runtime dependency; highest burden for compatibility, bounds checking, and evolution.

Select the lowest-maintenance option that passes golden-vector interoperability, malformed-frame rejection, unknown-field/version behavior, zero-allocation hot-path benchmarks, and little-endian portability tests. If no existing codec passes, use a repository-owned generated codec, not hand-written per-message parsing. Record the result in an implementation note; do not create runtime-pluggable codec abstraction.

## Shared-memory ring implementation gate
1. **Mapping/syscall crates plus a small owned ring layout (recommended):** use maintained wrappers for mmap/memfd/POSIX shm/eventfd, but own the `repr(C)` header, cache-line-separated atomics, slot state, sequence, and corruption checks. This gives the project control over the cross-process ABI without reimplementing syscalls.
2. **Adopt an existing cross-process SPSC ring crate:** less code, but only viable if it documents process-shared atomics, crash behavior, ABI stability, wakeups, and Linux support and passes the same stress suite.
3. **Build all mapping and ring machinery directly:** maximum control, excessive unsafe and portability burden. Invalidated unless both preceding options fail a documented correctness requirement.

The selected layout must contain magic, ABI version, schema version, capacity, slot size, producer/consumer generation, sequence, payload length, and checksum. Unsafe code is isolated in `transport-shm`, documented with invariants, and denied elsewhere.

# In scope / out of scope
## In scope
- The complete Rust workspace, schemas, process binaries, connector framework, Binance and Bithumb initial connectors, canonical state and strategy contracts, trading path, storage, replay, alerts, control plane, metrics, dashboards, systemd deployment, and migration documentation.
- Public connectors for 30+ exchanges by M10; private connectors for explicitly approved live-traded venues, with independent capability declarations.
- 30+ native Rust strategies/manifests by M10, grouped into approximately 5-10 runtime processes and shadow-qualified independently.
- Linux CI, deterministic fixtures, fault injection, soak tests, migrations, retention jobs, backups, restoration drills, kill switches, and binary/config rollback.
- Python only as a separate research consumer of exported data, never in a core runtime or order path.

## Out of scope
- Changing any ADR decision; Kafka, Kubernetes, Aeron, ClickHouse, DuckDB, a TSDB, QUIC, custom UDP recovery, WASM strategy execution, or Python core services.
- Browser automation as a live private connector. The old Bithumb margin flow remains blocked until an API-supported, contractually permitted operation is verified.
- A web trading UI, multi-tenant authorization, automatic strategy generation, exchange SDK types in core crates, or live deployment before all live-risk gates pass.
- Private trading support for all 30+ exchanges unless each venue is approved for capital deployment; public monitoring support does not imply private capability.

# Repository and workspace design
Use an in-place Cargo workspace. Keep business libraries independent of Tokio where practical; process and I/O edges own async runtimes. Use a single pinned Rust toolchain and a workspace dependency table. Suggested layout:

```text
Cargo.toml
Cargo.lock
rust-toolchain.toml
clippy.toml
deny.toml
schemas/
  sbe/                 # authoritative data-plane templates and compatibility fixtures
  proto/               # control-plane APIs only
crates/
  canonical-events/
  transport-spsc/
  transport-shm/
  transport-tcp-sbe/
  connector-framework/
  connector-binance-public/
  connector-binance-private/
  connector-bithumb-public/
  connector-bithumb-private/   # capability-gated; no browser fallback
  orderbook/
  market-state/
  strategy-api/
  strategy-runtime/
  strategy-kimchi-premium/
  subscription-planner/
  portfolio/
  risk/
  execution/
  wal/
  pg-writers/
  parquet-recorder/
  replay-backtest/
  alert-engine/
  alert-delivery/
  control-plane-grpc/
  process-common/               # config, lifecycle, bounded metric vocabulary; no domain dumping ground
  test-support/
  conformance-tests/
apps/
  market-data-runtime/
  strategy-runtime/
  trading-runtime/              # portfolio, risk, execution, private connectors, WAL
  storage-replay-runtime/
  alert-runtime/
  control-plane/
config/
  schema/
  examples/
  node1/
  node2/
  node3/
migrations/
  core/
  analytics/
ops/
  systemd/
  prometheus/
  grafana/
  scripts/
tests/
  fixtures/
  golden/
  e2e/
docs/
  architecture/
  operations/
  strategies/
  migration/
legacy/typescript/              # temporary only, deleted at the M4 retirement gate
```

Crate rules:
- `canonical-events` owns deterministic, exchange-neutral IDs and value types. Prices, quantities, fees, and balances use checked integer mantissa plus instrument-defined scale, not floating point. Events carry schema version, source, venue, instrument, event time, ingest time, source sequence when available, and event ID.
- SBE wire types are generated from `schemas/sbe`; they are not the domain API. Conversion occurs only at process boundaries. Protobuf types remain inside `control-plane-grpc`.
- `connector-framework` separates `PublicConnector` and `PrivateConnector`, publishes capability and rate-limit metadata, and supplies conformance harnesses. Private credentials use secret types with redacted debug output.
- `orderbook` implements venue-specific snapshot/delta sequencing through connector-provided adapters, but emits canonical book state. `market-state` shards by venue+instrument and gives each shard one writer.
- `strategy-api` exposes event/timer callbacks, state snapshot/restore, `TradeIntent`, and `AlertIntent` only. It has no connector, SQL, filesystem, HTTP, or secret dependencies. `strategy-runtime` owns panic isolation, limits, routing, shadow comparison, and snapshots.
- The trading crates implement an explicit state machine and stable IDs from intent through exchange order. `wal` owns framing, checksums, fsync, scan/repair, and versioned records, while `execution` owns command idempotency and reconciliation policy.
- Storage writers are consumers. A blocked PostgreSQL or Parquet writer cannot silently block the order path; bounded queues expose lag and apply an event-class policy.

## Queue and stream policy established in M0
| Event class | Overflow behavior | Recovery |
|---|---|---|
| Book deltas | Drop only by invalidating that book shard; never apply later deltas to a gap | emit gap/data-quality event, fetch snapshot, replay buffered valid deltas |
| Tickers/top-of-book | Coalesce latest by key where the queue contract permits | mark skipped count and age |
| Trades/raw capture | Bounded loss policy is tier-specific; Tier A capture failure pages and marks a data gap | reconnect/replay where venue permits; otherwise record an explicit missing interval |
| Account and execution events | Never silently drop; fail closed and halt new orders if capacity is exhausted | durable source/reconciliation before resume |
| TradeIntent/order command/WAL result | Never drop or overwrite | reject before acceptance or halt; reconcile all accepted IDs |
| System/heartbeat/alert intent | Reserve capacity for critical health; coalesce repetitive noncritical state | current state snapshot plus counter |

## Existing TypeScript and `AGENTS.md`
1. At M0, run and record the legacy build/tests without interpreting simulation success as exchange validation. Freeze TypeScript feature work.
2. Move the Node source, tests, scripts, package manifests, PM2 config, and TS config under temporary `legacy/typescript/`. Create a migration ledger mapping each useful scenario or rule to a Rust test or document.
3. Salvage only verified domain intent: premium calculation scenarios, Binance/Bithumb symbol examples, risk-limit cases, transfer lifecycle vocabulary, and kimchi/reverse-kimchi workflow descriptions. Revalidate all API endpoints, signing, units, rounding, and venue capabilities against current official specifications and sandbox traces. Do not mechanically port random market data, simulated fills, synchronous flow orchestration, or Puppeteer placeholders.
4. Replace the old `AGENTS.md` in M0 with concise Rust workspace commands, crate-boundary rules, ADR precedence, safety gates, secret handling, and test expectations. Move the useful kimchi strategy narrative to `docs/strategies/kimchi-premium.md`, clearly marking Bithumb margin support as unverified.
5. At the M4 retirement gate, delete `legacy/typescript/`, npm lockfiles, PM2/Jest/Vitest configs, old YAML/runtime JSON, old deployment scripts, and obsolete docs after every salvage-ledger entry has a Rust test, current document, or explicit rejection. The final product ships no Node runtime and no browser automation.

# File-level changes
| Path | Planned change |
|---|---|
| Root Cargo/toolchain/lint files | Create workspace, pin toolchain, centralize dependencies, deny warnings and unreviewed unsafe code, add license/advisory checks |
| `schemas/sbe`, `schemas/proto` | Add versioned canonical data-plane and control-plane schemas, compatibility policy, generated-code checks, golden frames |
| `crates/canonical-events` | Add canonical event taxonomy, IDs, scaled numeric types, validation, schema conversion tests |
| `crates/transport-*` | Add bounded in-process SPSC, Linux shared-memory/eventfd transport, persistent TCP/SBE sessions, heartbeat/gap/replay/version logic |
| `crates/connector-*` | Add separate public/private traits, capabilities, rate limits, normalization, fixtures, Binance first, Bithumb public next, private only after API gate |
| `crates/orderbook`, `crates/market-state` | Add snapshot/delta builders, shard ownership, freshness/data-quality state, immutable read views |
| `crates/strategy-*`, `subscription-planner` | Add constrained strategy API, grouped runtimes, manifests, routing, shadow lifecycle, first kimchi strategy |
| `crates/portfolio`, `risk`, `execution`, `wal` | Add allocation/reservation/netting, policy decisions, idempotent order state machine, append-before-send log, restart reconciliation |
| `crates/pg-writers`, `migrations/*` | Add two independent DB pools and schemas, idempotent materializers, aggregate writers, retention metadata |
| `crates/parquet-recorder` | Add partitioning, atomic file publication, checksums/manifests, Tier A/B/C retention and gap metadata |
| `crates/replay-backtest` | Add Parquet reader, virtual clock, deterministic scheduler, simulated execution, summaries to Analytics |
| `crates/alert-*` | Add rule engine over canonical events and a separate retrying external delivery worker |
| `crates/control-plane-grpc`, `schemas/proto` | Add registration, config, status, health, risk policy, replay/backtest APIs; no real-time market data |
| `apps/*` | Compose the six process roles and expose health/readiness/metrics with graceful drain and restart behavior |
| `config/*` | Add schema-validated nonsecret configuration, examples, node overlays, strategy manifests, retention/risk policy; exclude secrets |
| `ops/systemd` | Add units, dependencies, restart limits, CPU/memory settings, credentials, startup order, hardening, and node targets |
| `ops/prometheus`, `ops/grafana` | Add scrape/rule config and dashboards for data quality, transport, strategy, trading, storage, and process health |
| `tests/*`, `crates/conformance-tests` | Add fixtures, golden SBE/Parquet data, connector contract tests, fault injection, multi-process and three-node suites |
| `docs/*` | Replace stale API/deployment/testing guidance; add architecture maps, schema evolution, connector/strategy authoring, runbooks, migration ledger, disaster recovery |
| TypeScript/Node files | Quarantine for reference at M0, then delete at M4 after traceable salvage |
| `AGENTS.md` | Replace immediately with Rust and ADR-aligned contributor guidance |

# Sequencing and dependencies
## M0: Workspace, CI, canonical contracts, and risk spikes
**Why first:** every later crate depends on stable event semantics and build policy; transport choices require evidence before unsafe code spreads.

Work:
- Establish workspace, pinned toolchain, Linux/macOS CI split, formatting, clippy, unit/doc tests, dependency/advisory/license checks, and code coverage reporting.
- Define canonical event taxonomy, checked scaled numerics, stable IDs, time semantics, validity flags, schema ownership, and compatibility rules. Add SBE and Protobuf generation checks but keep them boundary-specific.
- Define process lifecycle, config layering, secret redaction, queue policy table, metric naming, correlation IDs, and initial latency/data-loss/order-safety SLOs from captured peak-rate evidence.
- Complete bounded SBE and shared-memory spikes. Benchmark at at least 2x measured peak event rate and test corruption, wraparound, producer/consumer death, reconnect, and version mismatch.
- Quarantine TS, create migration ledger, and replace `AGENTS.md`.

Acceptance:
- Fresh checkout builds on macOS for portable crates and on Linux for the entire workspace; generated files are reproducible.
- Canonical events round-trip through chosen SBE frames with golden bytes; incompatible schema changes fail CI; malformed lengths/scales/versions are rejected.
- Queue capacities and overflow policies are configuration-schema validated, with no unbounded channel dependency in runtime crates.
- The SBE and shared-memory decision notes contain benchmark, safety, maintenance, and compatibility evidence.
- Legacy behavior inventory is complete and old `AGENTS.md` no longer directs Node/Puppeteer implementation.

Verification commands:
```bash
cargo metadata --no-deps --format-version 1
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo test -p canonical-events --test schema_compatibility
cargo deny check
```

## M1: Read-only vertical slice, Binance public -> book -> state -> Parquet
**Depends on:** M0 canonical model and connector contract.

Work:
- Implement Binance public WebSocket ingestion and REST snapshot recovery using captured fixtures before live read-only soak.
- Normalize raw messages once, apply documented snapshot/delta ordering, own a single-writer BTC/USDT book shard, publish top-of-book/quality views, and record raw plus canonical events to atomically published Parquet files.
- Keep this milestone in one process with direct calls and bounded SPSC where threads cross. Record every discontinuity rather than fabricating continuity.

Acceptance:
- Deterministic fixture tests cover duplicate, stale, out-of-order, gap, reconnect, malformed payload, rate-limit, and snapshot race cases.
- A read-only soak produces valid books and queryable Parquet; row counts, ordering, scales, schema metadata, and checksums match the canonical stream.
- Full writer queues trigger the declared market-data policy and visible metrics; no unbounded memory growth occurs.
- No credentials are required and no private endpoint is reachable from the process.

Verification commands:
```bash
cargo test -p conformance-tests --test binance_public
cargo test -p orderbook --test snapshot_delta_resync
cargo test -p market-state --test shard_consistency
cargo test -p parquet-recorder --test canonical_roundtrip
cargo test -p conformance-tests --test public_to_parquet_e2e
cargo run -p market-data-runtime -- --config config/examples/node1-readonly.toml --capture-duration 60s
```

## M2: SPSC, shared-memory, and TCP/SBE process boundaries
**Depends on:** M1 event stream and M0 transport selection.

Work:
- Productionize fixed-capacity SPSC for thread boundaries, Linux shared-memory SPSC plus eventfd for same-host paths, and persistent TCP/SBE for cross-host streams.
- Add per-stream sequence, heartbeat, schema negotiation, gap detection, bounded replay window, replay request/response, reconnect backoff, checksum, peer generation, and explicit unrecoverable-gap snapshot behavior.
- Split the M1 path into market-data producer and storage consumer; exercise same-host and cross-host adapters against the identical conformance suite.

Acceptance:
- Wraparound and memory-order tests show no duplicate, torn, reordered, or silently corrupted accepted frame.
- Killing either endpoint, filling a queue, breaking TCP, losing heartbeats, corrupting a frame, and requesting replay produce deterministic recovery or an explicit invalid state.
- Linux 24-hour soak at at least 2x measured peak has zero undetected corruption and bounded RSS; observed p99 latency remains within the M0 budget.
- macOS skips Linux-only runtime tests explicitly, while Linux CI always runs them.

Verification commands:
```bash
cargo test -p transport-spsc
cargo test -p transport-shm --all-features
cargo test -p transport-tcp-sbe --test reconnect_gap_replay
cargo test -p conformance-tests --test cross_process_market_path
cargo test -p transport-shm --test fault_matrix
cargo test -p transport-tcp-sbe --test soak -- --ignored
cargo bench -p transport-tcp-sbe
```

## M3: Strategy runtime, subscriptions, Bithumb public data, and first real strategy
**Depends on:** M2 process stream and M1 connector pattern.

Work:
- Implement strategy manifests, validation, subscription planner merge rules, event routing, timers, resource limits, panic isolation, state snapshot/restore, shadow version comparison, and approximately 5-10 runtime-group configuration.
- Add Bithumb public BTC/KRW and USDT/KRW feeds through the same connector conformance path.
- Port the kimchi-premium calculation as the first native strategy. It consumes only canonical events, runs in shadow, emits `TradeIntent` or `AlertIntent` into a non-executing sink, and includes fees, scale/rounding, freshness, depth, and incomplete-leg checks.

Acceptance:
- Manifests cannot request unsupported venue/instrument/channel/depth combinations; planner output is deterministic and minimal.
- Strategy crate dependency checks prevent connector, SQL, filesystem, HTTP, and secret dependencies.
- Identical canonical inputs and restored state produce identical intents and snapshots.
- Kimchi strategy refuses stale, unsynchronized, crossed, or insufficient-depth books and emits no exchange order type.
- A strategy panic or limit breach terminates/isolate that strategy, emits a SystemEvent, and does not kill sibling strategies.

Verification commands:
```bash
cargo test -p subscription-planner
cargo test -p strategy-api
cargo test -p strategy-runtime --test isolation_restore_shadow
cargo test -p conformance-tests --test bithumb_public
cargo test -p strategy-kimchi-premium --test golden_scenarios
cargo test -p conformance-tests --test public_feeds_to_shadow_intent
```

## M4a: Paper order path and append-before-send recovery
**Depends on:** M3 intents and canonical account/trading events.

Work:
- Implement Portfolio allocation, virtual positions, reservations, cross-strategy netting rules, Risk decisions, and Execution lifecycle using a deterministic paper private connector.
- Define stable intent, reservation, command, client-order, and attempt IDs. WAL frames contain version, monotonic log sequence, record type, payload length, checksum, and prior-state reference.
- Before any external send, append TradeIntent, RiskDecision, and OrderCommand and fsync the command. Append ack/fill/cancel/reconciliation results as observed. Detect and truncate only a torn final frame; interior corruption halts trading.
- Recovery folds WAL into an order state machine and classifies each command. Sent-unknown commands are queried by stable client-order ID before any retry. New orders remain halted until reconciliation completes.

Acceptance:
- Fault injection at every write/fsync/send/ack/materialization boundary produces no duplicate paper order and no lost accepted intent.
- Risk reservations are conserved across accept, partial fill, cancel, reject, timeout, crash, and restart; invariants are property-tested.
- WAL disk-full, fsync error, checksum error, unknown record version, or recovery ambiguity fail closed and page the operator.
- Global, venue, strategy, instrument, and account kill switches reject new intents and are themselves durable and audited.

Verification commands:
```bash
cargo test -p portfolio --test reservation_invariants
cargo test -p risk --test policy_boundaries
cargo test -p execution --test lifecycle_idempotency
cargo test -p wal --test torn_write_and_corruption
cargo test -p wal --test crash_boundary_matrix
cargo test -p conformance-tests --test paper_trade_intent_e2e
```

## M4b: Private connector sandbox and reconciliation
**Depends on:** M4a; external sandbox credentials and venue approval.

Work:
- Implement Binance private connector first against official current API and testnet/sandbox behavior: submit/cancel/query, balances, positions where applicable, account stream, rate limits, timestamp/nonce rules, and client-order ID lookup.
- Keep paper mode default. Run shadow command generation, then sandbox only. Add Bithumb spot private capability only after current official documentation, account permissions, and sandbox or tiny non-live test path are verified.
- Make each connector declare capabilities; unsupported margin/borrow/withdraw operations return a typed unsupported capability before intent acceptance.

Acceptance:
- Credentials are readable only by the trading runtime and never appear in logs, metrics, WAL plaintext fields beyond necessary nonsecret identifiers, fixtures, or crash dumps.
- Sandbox create/query/cancel/partial-fill simulations and restart reconciliation pass under rate limits and disconnects.
- No Bithumb margin or reverse-kimchi live path is enabled without an API-supported borrow/repay capability and written operational approval.
- TS migration ledger is closed and `legacy/typescript/` plus Node/PM2 artifacts are removed.

Verification commands:
```bash
cargo test -p connector-binance-private
cargo test -p conformance-tests --test private_connector_contract
cargo test -p conformance-tests --test sandbox_reconciliation -- --ignored
cargo test -p conformance-tests --test credential_redaction
cargo test -p conformance-tests --test unsupported_capability_rejected
```

## M5: Core and Analytics PostgreSQL plus retention tiers
**Depends on:** M4 stable trading IDs/states and M2 storage streams.

Work:
- Create independent Core and Analytics migrations, pools, credentials, backup policies, and idempotent writers. Core materializes metadata, config, orders, fills, positions, balances, transfers, execution, and alert history. Analytics stores only aggregates, PnL, backtest summaries, quality, and latency.
- Add out-of-order/idempotent upserts keyed by canonical IDs and WAL sequence. Integrate Core state into startup reconciliation without making PostgreSQL the source for whether an unconfirmed exchange send is safe to retry.
- Finalize Parquet Tier A/B/C policies, partition layout, compaction, atomic manifests, disk-watermark behavior, retention deletion audit, and NVMe-to-HDD movement.

Acceptance:
- Replaying the same stream twice produces identical rows; Core and Analytics outage/restart does not duplicate data.
- Full recovery combines WAL, Core rows, and sandbox exchange queries and resolves all known crash states or remains halted with a specific reason.
- Full-depth/raw data is absent from PostgreSQL; Parquet retention preserves declared Tier A/B/C fields and emits auditable gap/deletion manifests.
- Backup restore into clean instances meets the documented recovery point/time objectives established in M0.

Verification commands:
```bash
cargo test -p pg-writers --test core_idempotency -- --ignored
cargo test -p pg-writers --test analytics_idempotency -- --ignored
cargo test -p conformance-tests --test dual_postgres_failover -- --ignored
cargo test -p conformance-tests --test wal_pg_exchange_recovery -- --ignored
cargo test -p parquet-recorder --test retention_tiers
cargo test -p conformance-tests --test backup_restore -- --ignored
```

## M6: Deterministic replay and backtest
**Depends on:** M3 strategy API, M4 execution interface, M5 Parquet/Analytics.

Work:
- Implement ordered Parquet replay, virtual clock, deterministic timer scheduling, checkpoint/seek, simulated execution with explicit latency/slippage/fee models, and backtest summaries to Analytics.
- Instantiate the exact strategy implementation used by live/shadow runtime. Only Clock and Execution implementations differ.
- Preserve data gaps and quality flags in replay; do not synthesize missing books unless an explicit test model says so.

Acceptance:
- Replaying identical inputs/config/seed yields byte-stable strategy outputs and equivalent summaries.
- Live-captured shadow intent sequence matches replay intent sequence for a golden interval.
- Real and virtual clocks pass one contract suite; live and simulated execution pass lifecycle invariants.
- Backtests reject incompatible schema/config and report data gaps and model assumptions.

Verification commands:
```bash
cargo test -p replay-backtest --test deterministic_clock
cargo test -p replay-backtest --test parquet_ordering_and_gaps
cargo test -p conformance-tests --test live_replay_strategy_parity
cargo test -p conformance-tests --test simulated_execution_lifecycle
cargo test -p replay-backtest --test analytics_summary -- --ignored
```

## M7: Alert engine and delivery worker
**Depends on:** canonical streams, M3 strategy alerts, M4 trading events, M5 history.

Work:
- Implement canonical-event rules for price/spread, connectivity, stale data, order rejection, insufficient balance, strategy termination, risk proximity, WAL/storage faults, and capacity loss.
- Separate rule evaluation from Telegram/Slack/Discord delivery. Delivery has bounded durable retry state, deduplication, rate limiting, escalation, and dead-letter inspection; strategies never call external APIs.

Acceptance:
- Every critical fault and kill switch has a tested alert rule, owner/action text, dedup key, and recovery notification.
- Provider outage cannot block event consumers or grow memory without bound; critical alerts remain inspectable and retry after restart.
- Secrets and sensitive account data are redacted; delivery attempts and acknowledgements materialize in Core.

Verification commands:
```bash
cargo test -p alert-engine --test rule_matrix
cargo test -p alert-delivery --test retry_dedup_restart
cargo test -p conformance-tests --test canonical_event_to_alert
cargo test -p conformance-tests --test provider_outage_backpressure
```

## M8: gRPC control plane
**Depends on:** stable configuration and lifecycle APIs from M3-M7.

Work:
- Implement Protobuf APIs for strategy registration/deployment, config changes, subscription changes, risk policy, process status, health, replay/backtest requests, and kill switches.
- Authenticate and authorize the single operator over the private network, audit every mutation as a canonical SystemEvent, apply optimistic config versions, and support dry-run validation.
- Keep market/account/trading data streams off gRPC.

Acceptance:
- Mutations are authenticated, version-checked, validated, durably audited, and either applied atomically or rejected without partial state.
- Status distinguishes liveness, readiness, data validity, reconciliation, WAL health, storage lag, and kill state.
- Compatibility tests allow additive schema evolution and reject breaking changes.
- Static checks and integration tests prove no real-time data publisher depends on gRPC.

Verification commands:
```bash
cargo test -p control-plane-grpc --test auth_version_audit
cargo test -p control-plane-grpc --test proto_compatibility
cargo test -p conformance-tests --test config_rollout_rollback
cargo test -p conformance-tests --test kill_switch_control_path
```

## M9: Three-node systemd deployment and full observability
**Depends on:** all runtime behavior M1-M8; three Linux servers or equivalent isolated Linux hosts.

Work:
- Package reproducible binaries and node-specific nonsecret config. Add systemd units/targets for Node 1 Market Data, Node 2 Strategy+Trading, and Node 3 Storage+Research exactly as ADR-022 assigns them.
- Configure startup dependencies, readiness gates, restart limits, CPU affinity after measurement, memory/file limits, credentials, journald retention, network hardening, graceful drain, and clock synchronization checks.
- Deploy Prometheus, alert rules, Grafana dashboards, PostgreSQL/Parquet/WAL backup jobs, disk capacity forecasts, and restore/runbook automation.
- Exercise rolling deployment, previous-binary rollback, config rollback, node loss, network partition, DB loss, disk-full, clock skew, and operator kill switch.

Acceptance:
- A clean three-node install reaches ready state in documented order and never accepts a live intent while market data, account state, WAL, or reconciliation is invalid.
- One process or node failure has the ADR-defined blast radius; restart/replay restores state or remains safely halted.
- Dashboards and alerts expose every SLO and queue/stream health signal; runbooks identify one operator action per critical page.
- Restore drills recover Core, Analytics, Parquet manifests, strategy snapshots, config, and WAL according to documented RPO/RTO.
- Paper and shadow soaks complete before the live-capital gate; live remains disabled by default.

Verification commands:
```bash
systemd-analyze verify ops/systemd/*.service ops/systemd/*.target
promtool check config ops/prometheus/prometheus.yml
promtool check rules ops/prometheus/rules/*.yml
cargo test -p conformance-tests --test three_node_smoke -- --ignored
cargo test -p conformance-tests --test node_failure_matrix -- --ignored
cargo test -p conformance-tests --test rolling_rollback -- --ignored
cargo test -p conformance-tests --test disaster_restore -- --ignored
```

## M10: Exchange and strategy fan-out
**Depends on:** M9 operational gate and measured capacity headroom. This work must not begin as broad parallel implementation before M1-M9 contracts are stable.

Work:
- Add exchanges one at a time from an approved priority matrix covering value, market/channel availability, API stability, legal/account access, rate limits, sequence semantics, and operational burden. Public and private capabilities remain independent.
- Require fixture capture, normalization mapping, book algorithm, rate-limit behavior, reconnect/recovery, quality signals, and conformance tests per public connector. Require sandbox, idempotency, account reconciliation, credential isolation, and explicit capital approval per private connector.
- Add strategies through manifests and `strategy-api`, shadow-soak each version, assign it to a measured runtime group, and capacity-test merged subscriptions and routing.
- Rebalance shard/runtime placement only from measured CPU, RSS, queue, and latency evidence; do not introduce microservices per exchange or strategy.

Acceptance:
- At least 30 public exchange connectors pass the same conformance and replay suite without changes to canonical consumers. Every unsupported channel/capability is explicit.
- At least 30 strategy implementations/manifests pass deterministic replay, snapshot/restore, dependency isolation, resource, and shadow qualification tests.
- Approximately 5-10 strategy runtime groups remain within measured SLOs at 2x observed aggregate peak; dedicated runtimes are justified only for high-risk or latency-critical cases.
- A connector or strategy failure is isolated and cannot corrupt unrelated state, exhaust unbounded memory, or bypass central risk/execution.
- Operator runbooks, dashboards, capacity plan, and on-call burden review are complete for every enabled venue and strategy.

Verification commands:
```bash
cargo test -p conformance-tests --test all_public_connectors
cargo test -p conformance-tests --test approved_private_connectors -- --ignored
cargo test -p conformance-tests --test all_strategies_replay_restore
cargo test -p conformance-tests --test subscription_capacity
cargo test -p conformance-tests --test connector_strategy_isolation
cargo test --workspace --all-features
```

# Acceptance criteria
## Overall definition of done
- All ADR-001..ADR-022 constraints are represented by code, configuration schema, tests, operations, or an explicit unsupported capability; architecture checks prevent forbidden dependencies.
- Six coarse runtime roles run across the three ADR nodes using direct/SPSC/shared-memory/TCP-SBE data paths and gRPC only for control.
- Canonical events are the only inputs to strategies, alerts, storage, and replay; adding an exchange does not change these consumers.
- 30+ public exchanges and 30+ native strategies meet M10 conformance, determinism, isolation, and capacity gates. Private trading is enabled only for approved venues.
- Every accepted order intent is traceable by IDs through reservation, risk decision, fsynced WAL command, exchange observations, Core materialization, fills/cancel, and reconciliation.
- Crash/restart/network/disk/database fault matrices demonstrate no duplicate exchange order and no unsafe automatic retry; unresolved state halts new trading.
- Tiered Parquet and dual PostgreSQL retention, backup, restore, replay, and deterministic backtest pass their drills.
- Prometheus/Grafana/journald and alert delivery cover defined SLOs and critical faults without secret leakage or unbounded cardinality.
- Fresh three-node systemd deployment, drain, rolling upgrade, binary/config rollback, kill-switch exercise, and disaster restore follow tested runbooks.
- TypeScript, npm/PM2/browser automation, obsolete configuration, and stale docs are absent from the shipped runtime; the new `AGENTS.md` is accurate.
- Live enablement remains an explicit audited operation after all gates, not a config default or side effect of deployment.

# Verification
## Continuous quality gates
- Every change: format, clippy with warnings denied, unit/doc tests, schema generation diff, dependency policy, secret scan, and architecture dependency tests.
- Connector changes: recorded fixture unit tests plus public/private conformance as applicable; external tests are marked and run in controlled CI with scoped credentials.
- Schema changes: old-reader/new-writer and new-reader/old-writer compatibility matrix, golden bytes, malformed input fuzzing, and migration note.
- Unsafe/transport changes: focused review, loom-style atomic model tests where applicable, Linux sanitizer/Miri-capable tests where supported, fault tests, benchmark comparison, and soak before merge.
- Trading changes: property invariants, WAL crash matrix, paper end-to-end, sandbox reconciliation, and replay parity before shadow deployment.
- Deployment changes: `systemd-analyze`, Prometheus rule/config validation, staged node smoke, rollback, and readiness gate checks.

# Escalation/Risk Gate
1. **G0 Transport selection:** architect and safety reviewer approve the SBE codec and shared-memory layout only after golden vectors, unsafe invariant review, 2x peak benchmark, corruption/fault tests, and 24-hour Linux soak. Failure keeps M1 in-process and blocks M2.
2. **G1 Exchange access:** connector work requiring private endpoints starts only with current official documentation, permitted account capability, IP/rate-limit details, sandbox path, and scoped credentials. Bithumb margin remains unsupported until borrow/repay/query APIs are verified; browser automation is not an alternative.
3. **G2 Order recovery:** critic independently reviews WAL state transitions, fsync point, stable client-order IDs, reconciliation decisions, and crash matrix. Any ambiguous auto-retry blocks M4b and all live work.
4. **G3 Storage recovery:** Core/Analytics backup restore and WAL+Core+exchange recovery pass on clean hosts. Failure blocks M6 parity claims and live enablement.
5. **G4 Live-capital gate:** require read-only soak, paper soak, sandbox reconciliation, shadow strategy comparison, alerts, hard and soft kill drills, three-node fault drill, smallest-notional canary plan, venue approval, and operator sign-off. Any missing evidence leaves `live_enabled=false`.
6. **G5 Fan-out:** require M1-M9 acceptance and measured headroom before teams add exchanges or strategies in parallel. Connector and strategy work can then use executor teams behind conformance gates; architecture changes return to architect review.

Handoff guidance:
- Use an **architect** for M0 boundary/dependency review, SBE/shm selection, and M4 recovery review.
- Use a **critic** at G0, G2, G4, and before accepting this plan as the release baseline.
- Use an **executor** for each bounded crate or connector after its contract and tests are approved.
- Use a **team** only from M10 or for independent M1-M9 lanes whose shared schemas are frozen; never split ownership of one order-state machine.
- Use **ultragoal** for multi-milestone autonomous execution only with milestone acceptance and live-capital gates preserved as hard stops.

# Verification Plan
## Unit layer
- Canonical value bounds, scale conversion, IDs, event validation, schema defaults, and time semantics.
- Order-book snapshot/delta ordering, duplicate/gap behavior, crossed-book rejection, and data freshness.
- Subscription merge/routing, strategy timers/state/limits, premium math, fees/depth/staleness, portfolio reservation/netting, and every risk boundary.
- WAL frame encode/decode/checksum/torn-tail scan/state fold; order lifecycle and idempotency; retention partitioning; alert rule/dedup logic; virtual clock and execution models.
- Property/fuzz tests for parsers, codecs, scaled arithmetic, ring wraparound, WAL recovery, and reservation conservation.

## Integration layer
- Every connector against recorded raw fixtures and a common capability/conformance suite; controlled official sandbox tests are separate and credential-scoped.
- SPSC/shm/TCP adapters against the same event-stream contract, including slow consumer, full queue, checksum failure, schema mismatch, gap/replay, reconnect, and endpoint restart.
- Parquet write/read and manifest recovery; Core/Analytics idempotency, outage, migration, and backup/restore; alert provider retry; gRPC auth/config version/audit.
- Strategy live/replay clock and execution contract parity, snapshot compatibility, and shadow-version divergence reports.

## End-to-end layer
- Public feed -> normalize -> book -> state -> Parquet, first in-process and then across process/server transport.
- Public feeds -> planner -> grouped strategy -> shadow intent with stale/gap suppression.
- TradeIntent -> Portfolio -> Risk -> WAL fsync -> paper/sandbox connector -> account events -> reconciliation -> Core, with process kills injected at every boundary.
- Parquet -> virtual clock -> same strategy -> simulated execution -> Analytics, compared with captured shadow output.
- Canonical event -> alert rule -> durable delivery retry -> provider acknowledgment -> Core history.
- Three-node cold start, rolling upgrade, rollback, network partition, node loss, disk-full, DB loss, clock skew, kill switch, and disaster restore.

## Observability layer
Tests assert emitted metrics, structured logs, traces/correlation fields, health state, and alerts rather than merely checking process success. Required signals include:
- Ingest messages/bytes/errors, source and internal sequence gaps, reconnects, book resync, stale/crossed state, event age, and per-queue depth/high-water/drop/coalesce counters.
- Shared-memory generation/heartbeat/checksum errors and TCP session/replay/schema/reconnect/round-trip latency.
- Strategy event/evaluation latency, panic/limit termination, snapshot age, intent counts, shadow divergence, and runtime CPU/RSS.
- Reservation/exposure/risk denial by bounded reason, kill state, order state/unknown count, exchange ack/reject latency, WAL append/fsync/recovery/corruption/disk headroom.
- PostgreSQL writer lag/error/pool state, Parquet publish/manifest/gap/retention/disk state, replay progress/determinism failures, and alert queue/delivery/dead-letter state.
- Metric labels use bounded venue/process/event/reason vocabularies. High-cardinality event, intent, client-order, and account IDs appear only in redacted structured logs and durable records for correlation.

Health semantics:
- Liveness means the process loop can answer.
- Readiness is role-specific and fail-closed: valid subscriptions and books for strategy, restored strategy state, reconciled account/order state, writable/fsyncing WAL, healthy private session, and policy/config version agreement for trading.
- Degraded storage may allow market ingestion under its declared loss policy but never hides a gap. Trading halts when required Core reconciliation, account freshness, or WAL safety is unavailable.

# Rollback and kill-switch story
- Build immutable, checksummed, versioned binaries and config bundles. systemd points to an `active` release symlink with the previous compatible release retained. Rollback drains producers, halts new intents, snapshots strategy state, flushes WAL/writers, switches binary/config, restarts in dependency order, and reconciles before readiness.
- Schema rollout is expand-first and backward-compatible. Do not roll back a binary that cannot read current WAL, strategy snapshot, SBE, Protobuf, or database schema. Forward-fix or use an explicitly tested compatibility reader when the gate says rollback is unsafe.
- Soft kill scopes are global, venue, account, strategy, and instrument. Activation is versioned, durably WAL/audit recorded, rejects new intents before reservation, and optionally cancels open orders only under a reviewed policy. Existing orders are reconciled; a cancel request is not treated as canceled until observed.
- A local Node 2 emergency control path must work if remote gRPC is unavailable, authenticate the operator, and write the same durable kill record. The hard runbook stops trading units, blocks private egress or revokes API keys, and then queries exchange state out of band. Restart never clears a kill automatically.
- Roll forward from paper -> shadow -> sandbox -> minimum-notional canary -> bounded live allocation. Any data-quality, WAL, reconciliation, clock, or private-session readiness failure returns to halt-new-orders and pages the operator.

# Pre-mortem
1. **SBE/shared-memory instability corrupts the order or market path.** Scenario: an ABI mismatch or atomic ordering bug accepts a torn frame after producer restart, leading to a bad book or intent. Mitigations: versioned/checksummed slots, generation fencing, bounds checks before decode, isolated unsafe module, golden vectors, model/stress tests, corrupt-frame injection, book invalidation on any gap, and no order-path shm rollout before G0 approval.
2. **WAL/recovery semantics create duplicate orders.** Scenario: crash occurs after exchange acceptance but before local ack append; restart retransmits an identical economic order under a new ID. Mitigations: stable client-order IDs, append+fsync before send, no blind retry of sent-unknown commands, exchange query and account/trade reconciliation, fail-closed ambiguity, exhaustive boundary crash matrix, sandbox restart drills, and independent G2 review.
3. **Scope explodes across 30+ exchanges before one slice works.** Scenario: parallel connectors invent different normalization and sequence rules, while storage and strategy contracts remain unproven and the operator inherits dozens of failing feeds. Mitigations: M10 hard dependency on M1-M9, Binance/Bithumb reference connectors, one conformance suite, capability declarations, priority matrix, per-connector acceptance, measured runtime headroom, and stop-the-line on any required core change from a new exchange.

# Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Rust SBE ecosystem choice is immature or incompatible | Wire bugs or abandoned generator | M0 bounded bake-off, golden vectors, malformed input tests, pinned generator, checked-in schema provenance, repository-owned generation fallback |
| Existing shared-memory crate is not truly process-safe | UB, lost/corrupt frames | Own narrow ABI/ring layout over maintained syscall wrappers, isolate unsafe, Linux fault/soak tests, generation fencing and checksum |
| macOS workstation cannot verify Linux primitives/systemd | Late deployment failure | Mandatory Linux CI from M0 and dedicated Linux integration host before M2; three hosts before M9 |
| Bithumb margin has no supported API in the old design [High] and current capability is unverified [Unknown] | Reverse-kimchi cannot execute safely | Keep Bithumb margin capability false, do not port browser automation, verify current official API/account terms, use public strategy shadow and other API-supported venue paths |
| Exchange sandbox differs from production | False confidence in order lifecycle | Recorded production-read fixtures, smallest-notional canary, conservative capability flags, reconcile before retry, venue-specific runbook |
| WAL disk/fsync behavior is misconfigured | Unsafe send or trading halt | Local Node 2 durable filesystem qualification, preallocation/rotation, disk watermarks, fsync metrics, fault drills, never place WAL on network storage |
| Dual PostgreSQL and tiered files overwhelm one operator | Slow incident response and data loss | Coarse processes, declarative migrations/retention, automated backups, capacity alerts, restore drills, bounded venue rollout, documented ownership/action per page |
| High-cardinality telemetry overloads Prometheus | Monitoring outage during incident | Bounded labels, IDs in logs/WAL/Core only, recording rules, cardinality tests and dashboard budgets |
| Strategy snapshot/schema change breaks shadow replacement | Lost state or divergent behavior | Version snapshots, migration functions, restore/replay test, dual-run comparison, rollback compatibility gate |
| Clock skew across three servers | Wrong freshness, sequencing, or latency conclusions | NTP/chrony checks, event and ingest timestamps, monotonic local durations, readiness bound on skew, clock-skew fault test |
| Secrets leak through config/logs/WAL | Account compromise | Node 2-only credentials, least-privilege keys, withdrawal disabled where possible, systemd credentials/root-owned files, redaction tests, rotation runbook |
| 30+ connectors violate rate limits or saturate links | Feed bans and stale strategies | Subscription merge, per-venue token buckets, jitter/backoff, quality state, capacity test at 2x peak, staged enablement |

# Open assumptions
All assumptions below require confirmation or evidence at the named gate; none silently enables live trading.
1. **First public exchange:** Binance BTC/USDT is selected for M1 because the scaffold already names it and it avoids the unverified Bithumb margin dependency.
2. **Second public exchange and first strategy:** Bithumb BTC/KRW plus USDT/KRW and the kimchi-premium detector from old `AGENTS.md` are selected for M3. It is a shadow strategy first, not authorization to port the old execution sequence.
3. **First private exchange:** Binance testnet/sandbox is selected for M4b. Exact market product (spot versus margin) and endpoint set require current account/API confirmation.
4. **Paper gate:** paper execution is mandatory before sandbox, and live is mandatory-off through M9. Proposed minimum soaks are 7 days read-only, 7 days paper, and 7 days shadow with no unresolved critical alert; final durations derive from event volume and operator risk policy.
5. **Bithumb capabilities:** public market and spot private APIs may be usable, but margin borrow/repay/query are treated as unsupported until current official proof exists. No browser fallback is accepted.
6. **Hardware:** three Linux servers with local NVMe where assigned, HDD capacity on Node 3, reliable private networking, and clock synchronization are not yet confirmed. M9 cannot pass on the macOS workstation alone; isolated Linux VMs may validate behavior but do not satisfy final capacity acceptance.
7. **Performance SLOs:** feed rates, latency budgets, storage volume, retention days within the ADR ranges, RPO/RTO, and hardware headroom are not supplied. M0 measures representative traffic and records numeric budgets before M2 acceptance.
8. **Numeric model:** checked scaled integers are assumed for deterministic SBE/live/replay behavior; per-instrument scales and overflow limits come from verified venue metadata.
9. **Rust dependencies:** Tokio is fixed by the ADR stack. SQLx, Arrow/Parquet ecosystem crates, gRPC tooling, mmap/syscall wrappers, and an SBE codec are selected only after M0 maintenance/license/benchmark checks; no runtime plug-in layer is planned.
10. **Network security:** the three nodes use a private network with authenticated encrypted control traffic and protected data-plane links according to the operator threat model. Exact TLS/mTLS termination and certificate rotation require infrastructure confirmation.
11. **Live strategy scope:** kimchi remains shadow or paper unless every transfer, borrow, repay, withdrawal, fee, settlement, and recovery capability is API-supported and approved. A simpler API-supported canary strategy may be used to validate live plumbing without changing the first strategy port.
12. **Fan-out meaning:** 30+ exchanges means public canonical-data support for at least 30 venues; private order support is limited to approved live venues. 30+ strategies means distinct tested native implementations/manifests, not copies with different parameters.
13. **Single operator:** no 24/7 team is assumed. Automated fail-closed behavior, bounded alert volume, capacity forecasts, and restore drills are therefore release requirements.
14. **Legacy preservation:** Git history plus the migration ledger is sufficient provenance after M4 deletion; the deployed repository need not retain a second source tree.
