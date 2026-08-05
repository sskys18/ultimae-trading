# RALPLAN-DR: ADR-001..ADR-022 Rust platform build plan, revision 2

## Principles
1. Preserve the fixed ADR boundaries: canonical events isolate exchanges, strategies emit intents, and real-time data never uses gRPC or PostgreSQL as a bus.
2. Prove one read-only vertical slice before productionizing transport, then prove transport plus a crash-safe paper order path before live capital or exchange and strategy fan-out.
3. Make correctness observable from the first slice: bounded queues, supervised connectors, sequence and schema versions, deterministic replay, durable order state, and fail-closed health gates are product behavior.
4. Reuse the same canonical models and strategy implementation in live, shadow, paper, replay, and backtest modes.
5. Optimize for a single operator: six ADR role families, a thin auxiliary gRPC control adapter, systemd, two PostgreSQL instances, Parquet, Prometheus, Grafana, and no Kafka or Kubernetes.

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
Build the ADR architecture as an in-place Rust Cargo workspace in M0 through M10, with M4 split into paper and sandbox gates and M10 split into capacity-checked batches. Start with canonical events and a Binance public-feed-to-Parquet slice, add Linux SPSC/shared-memory and TCP/SBE transports, then add Bithumb public data and a shadow kimchi-premium strategy. Build the order path paper-first with an append-only WAL and capability-aware reconciliation before connecting a sandbox private API. Add the two PostgreSQL stores, multi-generation Parquet replay/backtest, alerts, gRPC control, and three-node systemd operations before permitting live capital. Minimal scrape, structured-log, and paging paths exist from M1; M7 and M9 formalize them. Only after M9 may supervised connector groups and strategy groups fan out toward 30+ each in batches of no more than five.

[High] The current repository is a Node/TypeScript simulation scaffold: `package.json` drives TypeScript and Vitest, `src/index.ts` wires one process, both exchange connectors delegate to `SimulatedExchangeConnector`, market FX is randomized, and flow tests accept simulated orders. [High] `AGENTS.md` describes the superseded TypeScript/Puppeteer design and models Bithumb margin borrowing and repayment through web automation. The Rust implementation must not treat any existing connector, authentication code, test result, or Bithumb margin capability as production evidence.

# Intent Diff
| Area | Current state | Target state |
|---|---|---|
| Runtime | One TypeScript process with timer polling and simulated connectors | Six ADR role families across three Linux nodes, with grouped instances for connector and strategy fault isolation plus an auxiliary Node 2 gRPC control adapter |
| Domain boundary | Exchange and strategy types are directly coupled to the kimchi flow | Versioned canonical Market, Account, Trading, and System events; exchange SDK types stop at connectors |
| Data path | EventEmitter and promises, with no capacity policy | Direct calls on-thread, bounded SPSC across threads, shared memory same-host, persistent TCP/SBE cross-host |
| State | Small mutable objects in one process | Venue+instrument shards with one writer, snapshots, sequence validity, and no global `RwLock<HashMap>` |
| Trading | Strategy builds an exchange-specific multi-leg plan and calls connectors | `TradeIntent -> Portfolio -> Risk -> Execution -> PrivateConnector`, with reservations, netting, idempotency, capability-aware reconciliation, kill switches, and WAL |
| Storage | Runtime JSON and logs | Core PostgreSQL, Analytics PostgreSQL, full-fidelity versioned Parquet, tiered retention, replay and backtest |
| Operations | PM2 scripts and placeholder docs | M1 scrape/log/page bridge, then production systemd, journald, Prometheus, Grafana, backup/restore, rollout and rollback runbooks |
| Legacy | TypeScript and old `AGENTS.md` appear authoritative | TypeScript is used only as migration reference, then removed at M4b; `AGENTS.md` is replaced with Rust contributor and ADR-boundary guidance |

# Decision Drivers
- All ADR-001 through ADR-022 decisions are fixed. Implementation choices may optimize within them but may not introduce Kafka, Kubernetes, Aeron, WASM strategies, gRPC market data, exchange types outside connectors, or PostgreSQL full-depth storage.
- The order path must prefer a safe halt over uncertain retransmission. A sent-but-unconfirmed command is reconciled only through a connector-declared, conformance-tested stable-key capability. If exact reconciliation is unavailable, the connector is not live-capable and the runtime returns a typed halt instead of retrying.
- The data path must define ownership, capacity, overflow, sequence, heartbeat, recovery, schema compatibility, and fault supervision for every boundary.
- The development workstation is macOS arm64 [High], while `eventfd`, POSIX shared memory details, systemd, and the final deployment are Linux-specific. Linux CI and a Linux integration host are prerequisites, not optional final checks.
- Live credentials exist only in the private-connector process boundary on Node 2. Test, paper, shadow, and replay modes must not load them.
- Fan-out is throughput and conformance work, not architecture work. A new exchange changes connector and mapping code only; a new strategy changes strategy code and its manifest only. Capacity failure pauses fan-out rather than silently changing the three-node ADR.

# Options
## SBE codec implementation gate
Evaluate these bounded choices in M0, while retaining SBE as fixed by ADR-005 and ADR-006:
1. **Adopt a maintained Rust SBE codec/code generator.** Lower implementation cost; risks include incomplete schema evolution, allocation behavior, generated-code quality, and maintainer continuity.
2. **Use a pinned external SBE schema compiler and repository-owned Rust generation adapter.** Keeps XML schema authoritative; risks toolchain complexity and unsupported Rust output details.
3. **Generate a deliberately small repository-owned codec for the platform templates.** Full control and no runtime dependency; highest burden for compatibility, bounds checking, and evolution.

Select the lowest-maintenance option that passes golden-vector interoperability, malformed-frame rejection, unknown-field/version behavior, zero-allocation hot-path benchmarks, and little-endian portability tests. If no existing codec passes, use a repository-owned generated codec, not hand-written per-message parsing. Record the result in an implementation note; do not create a runtime-pluggable codec abstraction.

## Shared-memory ring implementation gate
1. **Mapping/syscall crates plus a small owned ring layout (recommended):** use maintained wrappers for mmap/memfd/POSIX shm/eventfd, but own the `repr(C)` header, cache-line-separated atomics, slot state, sequence, and corruption checks. This gives the project control over the cross-process ABI without reimplementing syscalls.
2. **Adopt an existing cross-process SPSC ring crate:** less code, but only viable if it documents process-shared atomics, crash behavior, ABI stability, wakeups, and Linux support and passes the same stress suite.
3. **Build all mapping and ring machinery directly:** maximum control, excessive unsafe and portability burden. Invalidated unless both preceding options fail a documented correctness requirement.

The selected layout must contain magic, ABI version, schema version, capacity, slot size, producer/consumer generation, sequence, payload length, and checksum. Unsafe code is isolated in `transport-shm`, documented with invariants, and denied elsewhere.

# In scope / out of scope
## In scope
- The complete Rust workspace, schemas, process binaries, connector framework, Binance and Bithumb initial connectors, canonical state and strategy contracts, trading path, storage, replay, alerts, control plane, metrics, dashboards, systemd deployment, and migration documentation.
- Public connectors for 30+ exchanges by M10; private connectors for explicitly approved live-traded venues, with independent operation and reconciliation-key capability declarations.
- 30+ native Rust strategies/manifests by M10, grouped into approximately 5-10 runtime processes and shadow-qualified independently.
- Linux CI, deterministic fixtures, fault injection, soak tests, migrations, multi-generation data readers, retention jobs, backups, restoration drills, kill switches, and binary/config rollback.
- Python only as a separate research consumer of exported data, never in a core runtime or order path.

## Out of scope
- Changing any ADR decision; Kafka, Kubernetes, Aeron, ClickHouse, DuckDB, a TSDB, QUIC, custom UDP recovery, WASM strategy execution, or Python core services.
- Browser automation as a live private connector. The old Bithumb margin flow remains blocked until an API-supported, contractually permitted operation is verified.
- A web trading UI, multi-tenant authorization, automatic strategy generation, exchange SDK types in core crates, or live deployment before all live-risk gates pass.
- Private trading support for all 30+ exchanges unless each venue is approved for capital deployment; public monitoring support does not imply private capability.
- A fourth server without a new ADR. If the three-node capacity plan is exhausted, fan-out stops and architecture escalation is required.

# Repository and workspace design
Use an in-place Cargo workspace. Keep business libraries independent of Tokio where practical; process and I/O edges own async runtimes. Use a single pinned Rust toolchain and a workspace dependency table. Suggested layout:

```text
Cargo.toml
Cargo.lock
rust-toolchain.toml
clippy.toml
deny.toml
schemas/
  registry.toml         # machine-checked cross-representation generation map
  sbe/                  # authoritative data-plane templates and compatibility fixtures
  proto/                # control-plane APIs only
tools/
  feed-rate-probe/      # throwaway/read-only M0 raw WebSocket rate probe
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
  trading-core/         # IDs, order states, transitions, reconciliation outcomes; no I/O
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
  process-common/       # config, lifecycle, bounded metric vocabulary; no domain dumping ground
  test-support/
  conformance-tests/
apps/
  market-data-runtime/  # instantiated as market-data-runtime@venue-group
  strategy-runtime/     # instantiated as strategy-runtime@group
  trading-runtime/      # portfolio, risk, execution, private connectors, WAL
  storage-replay-runtime/
  alert-runtime/
  control-plane/        # auxiliary gRPC coordinator on Node 2
config/
  schema/
  examples/
  node1/
  node2/
  node3/
  capacity-baseline.toml
migrations/
  core/
  analytics/
ops/
  systemd/
  monitoring-bootstrap/ # M1 Prometheus rules and bounded page bridge
  prometheus/
  grafana/
  scripts/
tests/
  fixtures/
  golden/
  e2e/
docs/
  architecture/
    schema-governance.md
  benchmarks/
    m0-binance-btcusdt-feed-baseline.json
    m0-capacity-slo.md
  operations/
  strategies/
  migration/
legacy/typescript/      # temporary only, deleted at the M4b retirement gate
```

Crate rules:
- `canonical-events` owns deterministic, exchange-neutral IDs and value types. Prices, quantities, fees, and balances use checked integer mantissa plus instrument-defined scale, not floating point. Events carry schema version, source, venue, instrument, event time, ingest time, source sequence when available, and event ID.
- SBE wire types are generated from `schemas/sbe`; they are not the domain API. Conversion occurs only at process boundaries. Protobuf types remain inside `control-plane-grpc`.
- `connector-framework` separates `PublicConnector` and `PrivateConnector`, publishes operation, rate-limit, and reconciliation-key capabilities, and supplies conformance harnesses. Private credentials use secret types with redacted debug output.
- `orderbook` implements venue-specific snapshot/delta sequencing through connector-provided adapters, but emits canonical book state. `market-state` shards by venue+instrument and gives each shard one writer.
- `strategy-api` exposes event/timer callbacks, state snapshot/restore, `TradeIntent`, and `AlertIntent` only. It has no connector, SQL, filesystem, HTTP, or secret dependencies. `strategy-runtime` owns panic isolation, limits, routing, shadow comparison, and snapshots.
- `trading-core` owns stable intent/reservation/command/client-order/attempt IDs, valid order-state transitions, and typed reconciliation outcomes. It has no filesystem, network, database, or exchange dependency. `execution` and `wal` both depend on it, preventing either from privately redefining order state.
- `wal` owns framing, checksums, fsync, scan/repair, and versioned records. `execution` owns command orchestration and invokes connector-specific reconciliation only through declared capabilities.
- Storage writers are consumers. A blocked PostgreSQL or Parquet writer cannot silently block the order path; bounded queues expose lag and apply an event-class policy.

## Connector isolation and supervision
- Node 1 runs one or more `market-data-runtime@venue-group` instances, all belonging to the ADR-001 Market Data role. Tier A or high-risk connectors receive a dedicated process instance; lower tiers share bounded groups. A process crash therefore loses a venue group, not all 30+ venues.
- Inside each group, every connector has its own supervisor-owned Tokio task set and fixed-capacity raw, normalized, and book-work queues. Connector code and parser callbacks run with unwind-enabled release profiles and `catch_unwind`/`JoinSet` boundaries. A panic drops connector-owned state, emits a SystemEvent, invalidates its books, and leaves sibling connectors running.
- Each connector declares maximum frame size, scratch-buffer bytes, queue capacities, rate limits, and expected message/byte budget from capture evidence. The supervisor tracks attributable buffers and queue memory; the process group is bounded by systemd `MemoryMax` and CPU assignment. Exceeding a connector budget quarantines that connector before it can exhaust the group.
- A watchdog requires connection, parser, and publication heartbeats. Failure cancels the task tree, invalidates state, and restarts with bounded exponential backoff. Five failures in ten minutes open a circuit and quarantine the venue until an audited operator reset. No stale book survives a generation change.
- Abort, OOM, and native faults cannot be caught; venue-group process separation and systemd restart bound those faults. M10 admission limits group size and requires fault injection for both task panic and whole-group death.

## Private connector reconciliation-key capability
Every `PrivateConnector` returns a versioned declaration containing at least:
- whether submit accepts a caller-provided client order ID and its uniqueness/length rules;
- whether order status can be queried directly by client order ID;
- whether open-order and order-history queries echo that ID;
- whether fills/trade history echo that ID;
- whether cancel requests and cancel responses accept/echo that ID;
- the history window, finality semantics, pagination/rate limits, and any venue-assigned ID needed after acknowledgment.

Conformance classifies the connector as `ExactSentUnknownReconciliation` only when an authoritative post-restart query can resolve the same stable key. Stream echo alone is insufficient because the stream can be lost. If a command reaches `SentUnknown` and exact resolution is unavailable, execution records `HaltReason::SentUnknownUnreconcilable { venue, command_id, capability_version }`, activates the venue/account kill, and never blindly retries. A connector without exact resolution may support read-only, paper, or manually supervised workflows, but is not live-enabled.

## Queue and stream policy established in M0
| Event class | Overflow behavior | Recovery |
|---|---|---|
| Book deltas | Drop only by invalidating that book shard; never apply later deltas to a gap | emit gap/data-quality event, fetch snapshot, replay buffered valid deltas |
| Tickers/top-of-book | Coalesce latest by key where the queue contract permits | mark skipped count and age |
| Trades/raw capture | Bounded loss policy is tier-specific; Tier A capture failure pages and marks a data gap | reconnect/replay where venue permits; otherwise record an explicit missing interval |
| Account and execution events | Never silently drop; fail closed and halt new orders if capacity is exhausted | durable source/reconciliation before resume |
| TradeIntent/order command/WAL result | Never drop or overwrite | reject before acceptance or halt; reconcile all accepted IDs |
| System/heartbeat/alert intent | Reserve capacity for critical health; coalesce repetitive noncritical state | current state snapshot plus counter |

## ADR-001 role and node mapping
The ADR defines six role families, not a promise of exactly six OS processes. Grouped instances preserve those boundaries and their rationale.

| ADR-001 role family | Concrete process/service | ADR-022 node | Fault/communication boundary |
|---|---|---|---|
| Market Data Runtime | `market-data-runtime@venue-group` instances | Node 1 | Per-connector supervised tasks, bounded groups, dedicated Tier A instances |
| Strategy Runtime | Approximately 5-10 `strategy-runtime@group` instances | Node 2 | Per-strategy panic/resource isolation inside risk/latency groups |
| Portfolio/Risk/Execution Runtime | One `trading-runtime` role, with internal direct/SPSC stages and private connectors | Node 2 | Small credential boundary; WAL and reconciliation gate all new sends |
| Storage/Replay Runtime | `storage-replay-runtime` with bounded writer/replay workers | Node 3 | Storage backpressure isolated from trading; replay jobs resource-limited |
| PostgreSQL | Independent Core and Analytics PostgreSQL service instances | Node 3 | Separate credentials, pools, migrations, backup and failure state |
| Alert Runtime | `alert-runtime` plus separate `alert-delivery-worker` instance | Node 3 | Rule evaluation cannot block on external providers |
| ADR-007 auxiliary control adapter | `control-plane` | Node 2 | Not a real-time role; operator gRPC ingress and cross-node control coordination only |

The Node 2 control-plane authenticates the operator and owns request/audit IDs. Node 2 runtimes expose loopback or Unix-domain gRPC control endpoints; Node 1 and Node 3 runtimes expose private-network mTLS gRPC control endpoints. Status is fanned in from each role with explicit freshness. A targeted mutation goes only to its owning role. A multi-role mutation performs validate-all, then applies one versioned commit; partial convergence holds readiness false, emits an audit event, and rolls roles back to the prior compatible version. A global trading kill is durably applied to Node 2 trading locally before remote status/notification fan-out, so a cross-node outage cannot prevent a halt. No canonical real-time stream traverses these endpoints.

## Concrete transport topology
| Producer -> consumer | ADR-022 placement | Production transport | Same-host collapse or internal path |
|---|---|---|---|
| Exchange WS receiver -> parser/normalizer | Within a Node 1 connector group | Direct call or bounded SPSC, no serialization | Same |
| Parser -> order-book worker -> market-state shard | Within Node 1 | Direct call same thread; bounded SPSC across owner threads | Same |
| Market Data -> Strategy | Node 1 -> Node 2 | Persistent TCP/SBE with sequence, heartbeat, gap and replay | Shared memory/SBE+eventfd only in a supported single-host/dev topology |
| Market Data -> Storage/Parquet | Node 1 -> Node 3 | Persistent bounded TCP/SBE | Shared memory/SBE if deliberately co-located |
| Market Data -> Alert | Node 1 -> Node 3 | Persistent TCP/SBE | Shared memory/SBE if deliberately co-located |
| Strategy -> Portfolio/Risk/Execution | Node 2 -> Node 2, separate processes | Shared memory/SBE+eventfd | Direct/SPSC only if composed into one test process; production remains separate roles |
| Trading account events -> Strategy | Node 2 -> Node 2 | Shared memory/SBE+eventfd | Direct/SPSC in test composition |
| Trading events -> Storage | Node 2 -> Node 3 | Persistent TCP/SBE | Shared memory/SBE if deliberately co-located |
| Trading/System events -> Alert | Node 2 -> Node 3 | Persistent TCP/SBE | Shared memory/SBE if deliberately co-located |
| Alert engine -> delivery worker | Node 3 -> Node 3 | Bounded SPSC or shared memory if separate OS process | Direct/bounded SPSC if one test process |
| Storage reader -> replay worker | Within Node 3 storage/replay role | Direct/bounded SPSC | Same |
| PostgreSQL writer -> Core/Analytics | Within Node 3 | PostgreSQL protocol over loopback/Unix socket | Same |
| Control plane -> runtime control endpoints | Node 2 local and Node 1/3 remote | gRPC/Protobuf over UDS/loopback locally and mTLS TCP remotely | gRPC remains control-only in all topologies |

Static topology config chooses shared memory or TCP for a data-plane edge, but both implement the same sequenced stream contract and conformance suite. Under the fixed three-node deployment, the MarketData->Strategy and MarketData->Alert paths named as shared-memory candidates in ADR-005 are cross-host and therefore use ADR-006 TCP/SBE.

## Schema-version governance
- `schemas/registry.toml` is the machine-readable compatibility ledger. Each released generation maps `canonical_event_version`, SBE `schemaId/templateId/version/blockLength`, Parquet schema and metadata version, Protobuf API version, WAL record version, strategy snapshot version, and minimum Core/Analytics migration IDs.
- `docs/architecture/schema-governance.md` explains ownership, additive versus breaking changes, support windows, deploy order, rollback constraints, and migration evidence. Protobuf remains control-only; its registry entry maps APIs that configure/query canonical generations and identifiers rather than duplicating market event payloads.
- CI regenerates SBE/Protobuf code, validates the registry against schemas and migrations, runs old-reader/new-writer and new-reader/old-writer golden matrices, and rejects an unregistered representation change.
- Every Parquet file records canonical and Parquet generations in file metadata and its manifest. `replay-backtest` provides versioned adapters from every generation still present under Tier A/B/C retention into the current canonical model. An adapter can be removed only after a manifest scan proves that generation expired or an atomic rewrite migration plus checksum verification replaced it.
- Breaking canonical changes use expand-first dual-read deployment. A repository tool rewrites old Parquet partitions into a new path, verifies row counts/order/checksums, atomically switches the manifest, and retains the prior files until rollback expiry. PostgreSQL changes use expand/migrate/contract and cannot outrun the oldest supported runtime.

## Existing TypeScript and `AGENTS.md`
1. At M0, run and record the legacy build/tests without interpreting simulation success as exchange validation. Freeze TypeScript feature work.
2. Move the Node source, tests, scripts, package manifests, PM2 config, and TS config under temporary `legacy/typescript/`. Create a migration ledger mapping each useful scenario or rule to a Rust test or document.
3. Salvage only verified domain intent: premium calculation scenarios, Binance/Bithumb symbol examples, risk-limit cases, transfer lifecycle vocabulary, and kimchi/reverse-kimchi workflow descriptions. Revalidate all API endpoints, signing, units, rounding, and venue capabilities against current official specifications and sandbox traces. Do not mechanically port random market data, simulated fills, synchronous flow orchestration, or Puppeteer placeholders.
4. Replace the old `AGENTS.md` in M0 with concise Rust workspace commands, crate-boundary rules, ADR precedence, safety gates, secret handling, and test expectations. Move the useful kimchi strategy narrative to `docs/strategies/kimchi-premium.md`, clearly marking Bithumb margin support as unverified.
5. At the M4b retirement gate, delete `legacy/typescript/`, npm lockfiles, PM2/Jest/Vitest configs, old YAML/runtime JSON, old deployment scripts, and obsolete docs after every salvage-ledger entry has a Rust test, current document, or explicit rejection. The final product ships no Node runtime and no browser automation.

# File-level changes
| Path | Planned change |
|---|---|
| Root Cargo/toolchain/lint files | Create workspace, pin toolchain, centralize dependencies, set runtime panic unwinding for supervised connector boundaries, deny warnings and unreviewed unsafe code, add coverage/license/advisory checks |
| `schemas/registry.toml`, `docs/architecture/schema-governance.md` | Add cross-representation version map, ownership, compatibility, deploy, retention-reader, migration, and rollback policy |
| `schemas/sbe`, `schemas/proto` | Add versioned canonical data-plane and control-plane schemas, compatibility policy, generated-code checks, golden frames |
| `tools/feed-rate-probe`, `docs/benchmarks/*` | Add M0 raw Binance WS rate capture method, immutable raw result, and derived provisional capacity/SLO artifact |
| `crates/canonical-events` | Add canonical event taxonomy, IDs, scaled numeric types, validation, schema conversion tests |
| `crates/transport-*` | Add bounded in-process SPSC, Linux shared-memory/eventfd transport, persistent TCP/SBE sessions, heartbeat/gap/replay/version logic |
| `crates/connector-framework`, `crates/connector-*` | Add separate public/private traits, operation and reconciliation-key capabilities, per-connector resource budgets/supervision, normalization, fixtures, Binance first, Bithumb public next |
| `crates/orderbook`, `crates/market-state` | Add snapshot/delta builders, shard ownership, freshness/data-quality state, immutable read views |
| `crates/strategy-*`, `subscription-planner` | Add constrained strategy API, grouped runtimes, manifests, routing, shadow lifecycle, first kimchi strategy |
| `crates/trading-core`, `portfolio`, `risk`, `execution`, `wal` | Add shared order IDs/transitions/reconciliation outcomes, allocation/reservation/netting, policy decisions, append-before-send log, restart recovery |
| `crates/pg-writers`, `migrations/*` | Add two independent DB pools and schemas, idempotent materializers, aggregate writers, retention metadata |
| `crates/parquet-recorder`, `replay-backtest` | Add generation metadata, partitioning, atomic manifests, Tier A/B/C retention, multi-generation reading/migration, deterministic replay |
| `crates/alert-*` | Add rule engine over canonical events and a separate retrying external delivery worker |
| `crates/control-plane-grpc`, `schemas/proto` | Add registration, config, status, health, risk policy, replay/backtest APIs and cross-node fan-out; no real-time market data |
| `apps/*` | Compose ADR role instances plus Node 2 control adapter; expose health/readiness/metrics and graceful drain/restart behavior |
| `config/*` | Add schema-validated nonsecret configuration, capacity baselines, node overlays, strategy manifests, retention/risk policy; exclude secrets |
| `ops/monitoring-bootstrap` | Add M1 Prometheus scrape/rules and bounded log/page bridge used before the full alert runtime |
| `ops/systemd` | Add units, dependencies, restart limits, connector/strategy groups, CPU/memory settings, credentials, startup order, hardening, and node targets |
| `ops/prometheus`, `ops/grafana` | Formalize production scrape/rule config and dashboards for data quality, transport, strategy, trading, storage, and process health |
| `tests/*`, `crates/conformance-tests` | Add fixtures, golden SBE/Parquet data, connector contracts, reconciliation capabilities, fault injection, multi-process and three-node suites |
| `docs/*` | Replace stale API/deployment/testing guidance; add architecture maps, schema evolution, connector/strategy authoring, runbooks, migration ledger, disaster recovery |
| TypeScript/Node files | Quarantine for reference at M0, then delete at M4b after traceable salvage |
| `AGENTS.md` | Replace immediately with Rust and ADR-aligned contributor guidance |

# Sequencing and dependencies
## M0: Workspace, CI, canonical contracts, raw feed baseline, and risk spikes
**Why first:** every later crate depends on stable event semantics and build policy; transport choices need a named workload baseline before unsafe code spreads.

Work:
- Establish workspace, pinned toolchain, Linux/macOS CI split, formatting, clippy, unit/doc tests, dependency/advisory/license checks, secret scan, and blocking coverage gates. Workspace line coverage starts at 70%; each introduced safety-critical crate (`canonical-events`, `transport-*`, `trading-core`, `portfolio`, `risk`, `execution`, `wal`) must reach 85% line coverage. Generated code and fixtures are excluded. Threshold reductions require architect approval and may not be used to pass a change.
- Define canonical event taxonomy, checked scaled numerics, stable IDs, time semantics, validity flags, schema ownership, and compatibility rules. Add `schemas/registry.toml` plus the schema-governance document and SBE/Protobuf generation checks.
- Implement the read-only `tools/feed-rate-probe` spike. It connects directly, without product normalization, to Binance BTCUSDT `depth@100ms`, aggregate-trade, and book-ticker public WebSocket streams for a continuous 24-hour Linux capture, including two controlled reconnects. Record 100 ms and 1 s bucket frame counts and wire/payload bytes, p50/p95/p99/p99.9/max burst, maximum frame size, disconnect/reconnect, CPU, and RSS. Save the immutable result to `docs/benchmarks/m0-binance-btcusdt-feed-baseline.json` and derivation to `docs/benchmarks/m0-capacity-slo.md`.
- Set the provisional transport workload to twice the greater of the observed p99.9 one-second burst and any higher vendor-documented subscribed-stream limit, with maximum observed frame size doubled for buffer testing. Encode it in `config/capacity-baseline.toml`. Generate deterministic replay frames from the captured size/rate distribution; raw credentials and full payloads do not enter the artifact.
- Define process lifecycle, connector supervisor policy, config layering, secret redaction, queue policy table, metric naming, correlation IDs, and initial latency/data-loss/order-safety SLOs. Latency and RPO/RTO remain explicitly provisional where no measurement exists.
- Complete bounded SBE and shared-memory spikes against the provisional replay workload. Test corruption, wraparound, producer/consumer death, reconnect, and version mismatch. Quarantine TS, create migration ledger, and replace `AGENTS.md`.

Acceptance:
- Fresh checkout builds on macOS for portable crates and on Linux for the entire workspace; generated files are reproducible.
- `m0-binance-btcusdt-feed-baseline.json`, `m0-capacity-slo.md`, and `capacity-baseline.toml` identify command, UTC interval, stream list, host/kernel, code revision, bucket definitions, raw statistics, derivation, and provisional status so the M1 revalidation is reproducible.
- Canonical events round-trip through chosen SBE frames with golden bytes; incompatible or unregistered schema changes fail CI; malformed lengths/scales/versions are rejected.
- Queue capacities and overflow policies are configuration-schema validated, with no unbounded channel dependency in runtime crates.
- Workspace coverage below 70% or a safety-critical crate below 85% blocks CI; the SBE/shared-memory decision note contains benchmark, safety, maintenance, and compatibility evidence.
- Legacy behavior inventory is complete and old `AGENTS.md` no longer directs Node/Puppeteer implementation.

Verification commands:
```bash
cargo metadata --no-deps --format-version 1
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo test -p canonical-events --test schema_compatibility
cargo llvm-cov --workspace --all-features --fail-under-lines 70
cargo llvm-cov -p canonical-events --all-features --fail-under-lines 85
cargo run -p feed-rate-probe --release -- --venue binance --symbol BTCUSDT --duration 24h --output docs/benchmarks/m0-binance-btcusdt-feed-baseline.json
cargo deny check
```

## M1: Read-only vertical slice, Binance public -> book -> state -> Parquet
**Depends on:** M0 canonical model, connector contract, and provisional capacity baseline.

Work:
- Implement Binance public WebSocket ingestion and REST snapshot recovery using captured fixtures before live read-only soak.
- Normalize raw messages once, apply documented snapshot/delta ordering, own a single-writer BTC/USDT book shard, publish top-of-book/quality views, and record raw plus canonical events to atomically published Parquet files carrying schema-registry generations.
- Keep this milestone in one process with direct calls and bounded SPSC where threads cross. Run the Binance connector under the production supervisor contract with per-connector queues, watchdog, panic boundary, restart circuit, and book invalidation.
- Re-run a 24-hour production-connector rate capture, including a representative high-activity window where available. Write `docs/benchmarks/m1-binance-btcusdt-feed-baseline.json`, replace provisional numbers in `docs/benchmarks/m0-capacity-slo.md` with a reviewed `docs/benchmarks/capacity-slo.md`, and update `config/capacity-baseline.toml`. The M2/G0b soak target is 2x the higher M0/M1 measured p99.9 burst or higher documented limit. If M1 exceeds the M0 test target, rerun the G0a codec/ring benchmark before M2 work proceeds.
- Introduce the minimal monitoring bridge: every app exposes a bounded-cardinality Prometheus `/metrics` endpoint and structured JSON logs to stdout/journald. `ops/monitoring-bootstrap` supplies a Prometheus scrape, rules for process/connector down, quarantine, stale/gap book, queue overflow, Parquet failure, and disk watermark, plus a bounded local page bridge that receives Alertmanager webhooks, persists a capped spool, and sends one configured operator channel. It is operationally real but intentionally narrow; M7 replaces it with canonical-event alerting/delivery and M9 productionizes dashboards and HA/retention.

Acceptance:
- Deterministic fixture tests cover duplicate, stale, out-of-order, gap, reconnect, malformed payload, rate-limit, and snapshot race cases.
- A read-only soak produces valid books and queryable Parquet; row counts, ordering, scales, schema generations, metadata, and checksums match the canonical stream.
- A forced connector panic or watchdog expiry restarts only Binance, invalidates its books until resync, keeps sibling test connectors/process health alive, and quarantines after the configured restart threshold. Fixed queues and group RSS limits prevent unbounded memory growth.
- The M1 rate artifact hard-revalidates the capacity target, and any upward revision has rerun evidence attached to G0a.
- Full writer queues trigger the declared market-data policy, scrape metrics, structured logs, and a test page through the bootstrap bridge. Provider outage cannot block the runtime or grow memory without bound.
- No credentials are required and no private endpoint is reachable from the process.

Verification commands:
```bash
cargo test -p conformance-tests --test binance_public
cargo test -p conformance-tests --test connector_supervisor_faults
cargo test -p orderbook --test snapshot_delta_resync
cargo test -p market-state --test shard_consistency
cargo test -p parquet-recorder --test canonical_roundtrip
cargo test -p process-common --test metrics_contract
cargo test -p conformance-tests --test m1_metrics_page_bridge
promtool check rules ops/monitoring-bootstrap/rules.yml
cargo test -p conformance-tests --test public_to_parquet_e2e
cargo run -p market-data-runtime -- --config config/examples/node1-readonly.toml --capture-duration 24h
```

## M2: SPSC, shared-memory, and TCP/SBE process boundaries
**Depends on:** M1 event stream, hard-revalidated capacity baseline, and G0a transport selection.

Work:
- Productionize fixed-capacity SPSC for thread boundaries, Linux shared-memory SPSC plus eventfd for same-host paths, and persistent TCP/SBE for cross-host streams.
- Add per-stream sequence, heartbeat, schema negotiation, gap detection, bounded replay window, replay request/response, reconnect backoff, checksum, peer generation, and explicit unrecoverable-gap snapshot behavior.
- Split the M1 path into market-data producer and storage consumer; exercise same-host and cross-host adapters against the identical conformance suite and the concrete transport table.

Acceptance:
- Wraparound and memory-order tests show no duplicate, torn, reordered, or silently corrupted accepted frame.
- Killing either endpoint, filling a queue, breaking TCP, losing heartbeats, corrupting a frame, and requesting replay produce deterministic recovery or an explicit invalid state.
- Linux 24-hour soak at the final M1-derived 2x target has zero undetected corruption and bounded RSS; observed p99 latency remains within `docs/benchmarks/capacity-slo.md`. This is G0b production transport approval.
- macOS skips Linux-only runtime tests explicitly, while Linux CI always runs them.

Verification commands:
```bash
cargo test -p transport-spsc
cargo test -p transport-shm --all-features
cargo test -p transport-tcp-sbe --test reconnect_gap_replay
cargo test -p conformance-tests --test cross_process_market_path
cargo test -p conformance-tests --test topology_edge_matrix
cargo test -p transport-shm --test fault_matrix
cargo test -p transport-tcp-sbe --test soak -- --ignored
cargo bench -p transport-tcp-sbe
```

## M3: Strategy runtime, subscriptions, Bithumb public data, and first real strategy
**Depends on:** M2 process stream and M1 connector/supervision pattern.

Work:
- Implement strategy manifests, validation, subscription planner merge rules, event routing, timers, resource limits, panic isolation, state snapshot/restore, shadow version comparison, and approximately 5-10 runtime-group configuration.
- Add Bithumb public BTC/KRW and USDT/KRW feeds through the same connector conformance and supervisor path. Place it in a separate connector group from Binance until its fault and rate profile is measured.
- Port the kimchi-premium calculation as the first native strategy. It consumes only canonical events, runs in shadow, emits `TradeIntent` or `AlertIntent` into a non-executing sink, and includes fees, scale/rounding, freshness, depth, and incomplete-leg checks.

Acceptance:
- Manifests cannot request unsupported venue/instrument/channel/depth combinations; planner output is deterministic and minimal.
- Strategy crate dependency checks prevent connector, SQL, filesystem, HTTP, and secret dependencies.
- Identical canonical inputs and restored state produce identical intents and snapshots.
- Kimchi strategy refuses stale, unsynchronized, crossed, or insufficient-depth books and emits no exchange order type.
- A strategy panic or limit breach terminates/isolates that strategy, emits a SystemEvent, and does not kill siblings. A Bithumb connector panic or process-group death does not invalidate Binance state, and vice versa.

Verification commands:
```bash
cargo test -p subscription-planner
cargo test -p strategy-api
cargo test -p strategy-runtime --test isolation_restore_shadow
cargo test -p conformance-tests --test bithumb_public
cargo test -p conformance-tests --test connector_group_isolation
cargo test -p strategy-kimchi-premium --test golden_scenarios
cargo test -p conformance-tests --test public_feeds_to_shadow_intent
```

## M4a: Paper order path and append-before-send recovery
**Depends on:** M3 intents and canonical account/trading events.

Work:
- Implement Portfolio allocation, virtual positions, reservations, cross-strategy netting rules, Risk decisions, and Execution lifecycle using a deterministic paper private connector.
- Implement `trading-core` stable intent, reservation, command, client-order, and attempt IDs plus order-state transition validation. WAL frames contain version, monotonic log sequence, record type, payload length, checksum, and prior-state reference.
- Before any paper send, append TradeIntent, RiskDecision, and OrderCommand and fsync the command. Append ack/fill/cancel/reconciliation results as observed. Detect and truncate only a torn final frame; interior corruption halts trading.
- The paper connector declares full exact reconciliation-key support. Recovery folds WAL into the shared order state machine and queries the paper venue by stable key before any retry. New orders remain halted until reconciliation completes.
- Extend the M1 monitoring bridge with WAL fsync/corruption/disk, risk denial, kill, sent-unknown, and reconciliation-halt rules. M4a does not test PostgreSQL materialization because that boundary is introduced in M5.

Acceptance:
- Fault injection at every WAL write/fsync, paper send, ack/event observation, and restart boundary produces no duplicate paper order and no lost accepted intent.
- Risk reservations are conserved across accept, partial fill, cancel, reject, timeout, crash, and restart; invariants are property-tested.
- WAL disk-full, fsync error, checksum error, unknown record version, or recovery ambiguity fails closed and produces a test page through the M1 bridge.
- Global, venue, strategy, instrument, and account kill switches reject new intents and are themselves durable and audited.

Verification commands:
```bash
cargo test -p trading-core --test transition_matrix
cargo test -p portfolio --test reservation_invariants
cargo test -p risk --test policy_boundaries
cargo test -p execution --test lifecycle_idempotency
cargo test -p wal --test torn_write_and_corruption
cargo test -p wal --test crash_boundary_matrix
cargo test -p conformance-tests --test paper_trade_intent_e2e
cargo test -p conformance-tests --test trading_fault_pages
```

## M4b: Private connector sandbox and capability-aware reconciliation
**Depends on:** M4a; external sandbox credentials and venue approval.

Work:
- Implement Binance private connector first against official current API and testnet/sandbox behavior: submit/cancel/query, balances, positions where applicable, account stream, rate limits, timestamp/nonce rules, and stable reconciliation-key surfaces.
- Populate the full reconciliation-key declaration from official documentation and captured sandbox evidence. Conformance independently tests client-order-ID acceptance, direct lookup, order/open/history echo, fill/trade-history echo, cancel echo, pagination window, and restart behavior. Exact post-restart resolution is a live-capability gate, not an assumption.
- Keep paper mode default. Run shadow command generation, then sandbox only. Add Bithumb spot private capability only after current official documentation, account permissions, and sandbox or tiny non-live test path are verified.
- Unsupported margin/borrow/withdraw or exact-reconciliation operations return typed capability errors before intent acceptance. `SentUnknown` without exact stable-key resolution durably sets `SentUnknownUnreconcilable` and venue/account halt, never blind retry.
- Close the migration ledger and retire TypeScript/Node artifacts at this exact milestone.

Acceptance:
- Credentials are readable only by the trading runtime and never appear in logs, metrics, WAL plaintext fields beyond necessary nonsecret identifiers, fixtures, or crash dumps.
- Each private connector has a versioned, evidence-linked reconciliation-key declaration and passes every capability it claims. Falsely claimed or unavailable lookup/echo behavior fails conformance and keeps live capability false.
- Sandbox create/query/cancel/partial-fill and restart reconciliation pass under rate limits and disconnects. A simulated venue with no exact stable-key query enters typed halt and emits no second send.
- No Bithumb margin or reverse-kimchi live path is enabled without an API-supported borrow/repay capability, exact reconciliation evidence, and written operational approval.
- TS migration ledger is closed and `legacy/typescript/` plus package locks, Node/PM2/Jest/Vitest/browser artifacts and stale config/docs are removed.

Verification commands:
```bash
cargo test -p connector-binance-private
cargo test -p conformance-tests --test private_connector_contract
cargo test -p conformance-tests --test reconciliation_key_capabilities
cargo test -p conformance-tests --test unreconcilable_sent_unknown_halts
cargo test -p conformance-tests --test sandbox_reconciliation -- --ignored
cargo test -p conformance-tests --test credential_redaction
cargo test -p conformance-tests --test unsupported_capability_rejected
```

## M5: Core and Analytics PostgreSQL, retention tiers, and versioned history
**Depends on:** M4 stable trading IDs/states and M2 storage streams.

Work:
- Create independent Core and Analytics migrations, pools, credentials, backup policies, and idempotent writers. Core materializes metadata, config, orders, fills, positions, balances, transfers, execution, and alert history. Analytics stores only aggregates, PnL, backtest summaries, quality, and latency.
- Add out-of-order/idempotent upserts keyed by canonical IDs and WAL sequence. Integrate Core state into startup reconciliation without making PostgreSQL the source for whether an unconfirmed exchange send is safe to retry.
- Extend the crash matrix to PostgreSQL enqueue, commit, acknowledgment, outage, replay, and duplicate materialization boundaries. These tests are intentionally deferred from M4a.
- Finalize Parquet Tier A/B/C policies, partition layout, compaction, atomic manifests, disk-watermark behavior, retention deletion audit, NVMe-to-HDD movement, multi-generation readers, and the atomic rewrite migration tool governed by `schemas/registry.toml`.

Acceptance:
- Replaying the same stream twice produces identical rows; Core and Analytics outage/restart does not duplicate data, including faults at every materialization boundary.
- Full recovery combines WAL, Core rows, and each connector's declared authoritative reconciliation surfaces and resolves all known crash states or remains halted with a specific typed reason.
- Full-depth/raw data is absent from PostgreSQL; Parquet retention preserves declared Tier A/B/C fields and emits auditable gap/deletion manifests.
- Every Parquet generation still present in retention is readable into current canonical events, or has completed a verified atomic rewrite. Reader adapters cannot be removed while manifests reference them.
- Backup restore into clean instances meets the documented recovery point/time objectives established in M0.

Verification commands:
```bash
cargo test -p pg-writers --test core_idempotency -- --ignored
cargo test -p pg-writers --test analytics_idempotency -- --ignored
cargo test -p conformance-tests --test pg_materialization_crash_matrix -- --ignored
cargo test -p conformance-tests --test dual_postgres_failover -- --ignored
cargo test -p conformance-tests --test wal_pg_exchange_recovery -- --ignored
cargo test -p parquet-recorder --test retention_tiers
cargo test -p replay-backtest --test multi_generation_parquet
cargo test -p conformance-tests --test parquet_atomic_migration
cargo test -p conformance-tests --test backup_restore -- --ignored
```

## M6: Deterministic replay and backtest
**Depends on:** M3 strategy API, M4 execution interface, M5 versioned Parquet/Analytics.

Work:
- Implement ordered multi-generation Parquet replay, virtual clock, deterministic timer scheduling, checkpoint/seek, simulated execution with explicit latency/slippage/fee models, and backtest summaries to Analytics.
- Instantiate the exact strategy implementation used by live/shadow runtime. Only Clock and Execution implementations differ.
- Preserve data gaps and quality flags in replay; do not synthesize missing books unless an explicit test model says so.

Acceptance:
- Replaying identical inputs/config/seed yields byte-stable strategy outputs and equivalent summaries across every retained Parquet generation.
- Live-captured shadow intent sequence matches replay intent sequence for a golden interval.
- Real and virtual clocks pass one contract suite; live and simulated execution pass lifecycle invariants.
- Backtests reject unsupported schema/config, report data gaps and model assumptions, and direct the operator to a registered migration path rather than silently dropping fields.

Verification commands:
```bash
cargo test -p replay-backtest --test deterministic_clock
cargo test -p replay-backtest --test parquet_ordering_and_gaps
cargo test -p replay-backtest --test retained_generation_matrix
cargo test -p conformance-tests --test live_replay_strategy_parity
cargo test -p conformance-tests --test simulated_execution_lifecycle
cargo test -p replay-backtest --test analytics_summary -- --ignored
```

## M7: Formal alert engine and delivery worker
**Depends on:** M1 monitoring bridge, canonical streams, M3 strategy alerts, M4 trading events, and M5 history.

Work:
- Implement canonical-event rules for price/spread, connectivity, stale data, connector quarantine, order rejection, insufficient balance, strategy termination, risk proximity, WAL/storage faults, capacity loss, and schema incompatibility.
- Separate rule evaluation from Telegram/Slack/Discord delivery. Delivery has bounded durable retry state, deduplication, rate limiting, escalation, and dead-letter inspection; strategies never call external APIs.
- Migrate every bootstrap rule/page route to the formal engine or retain it explicitly as infrastructure-only coverage. Remove the temporary page bridge only after parity and outage tests pass. Prometheus remains the infrastructure signal path.

Acceptance:
- Every critical fault and kill switch has a tested alert rule, owner/action text, dedup key, and recovery notification; a parity ledger accounts for every M1/M4 bootstrap rule.
- Provider outage cannot block event consumers or grow memory without bound; critical alerts remain inspectable and retry after restart.
- Secrets and sensitive account data are redacted; delivery attempts and acknowledgements materialize in Core.

Verification commands:
```bash
cargo test -p alert-engine --test rule_matrix
cargo test -p alert-delivery --test retry_dedup_restart
cargo test -p conformance-tests --test bootstrap_alert_parity
cargo test -p conformance-tests --test canonical_event_to_alert
cargo test -p conformance-tests --test provider_outage_backpressure
```

## M8: Node 2 gRPC control plane and cross-node fan-out
**Depends on:** stable configuration and lifecycle APIs from M3-M7.

Work:
- Deploy the auxiliary `control-plane` process on Node 2 next to the local emergency kill path. Implement Protobuf APIs for strategy registration/deployment, config changes, subscription changes, risk policy, process status, health, replay/backtest requests, and kill switches.
- Authenticate and authorize the single operator over the private network, audit every mutation as a canonical SystemEvent, apply optimistic config versions, and support dry-run validation.
- Implement status fan-in and versioned mutation fan-out to private runtime control endpoints on Nodes 1-3. Use validate-all/commit for multi-role changes, detect partial convergence, hold readiness false, and roll back to a prior compatible config. Apply a global trading kill locally and durably on Node 2 before remote fan-out.
- Keep market/account/trading data streams off gRPC.

Acceptance:
- Mutations are authenticated, version-checked, validated, durably audited, and either converge on one version or enter explicit not-ready rollback/recovery without hidden partial state.
- Status distinguishes liveness, readiness, data validity, connector group/quarantine state, reconciliation capability/halt, WAL health, storage lag, schema generation, and kill state, with freshness per node.
- A Node 1 or Node 3 partition cannot prevent Node 2 local kill activation. Reconnection converges status/config without replaying a mutation twice.
- Compatibility tests allow additive schema evolution and reject breaking changes; static and integration checks prove no real-time publisher depends on gRPC.

Verification commands:
```bash
cargo test -p control-plane-grpc --test auth_version_audit
cargo test -p control-plane-grpc --test proto_compatibility
cargo test -p conformance-tests --test cross_node_control_fanout
cargo test -p conformance-tests --test partial_config_convergence
cargo test -p conformance-tests --test config_rollout_rollback
cargo test -p conformance-tests --test kill_switch_control_path
```

## M9: Three-node systemd deployment and production observability
**Depends on:** all runtime behavior M1-M8; three Linux servers or equivalent isolated Linux hosts.

Work:
- Package reproducible binaries and node-specific nonsecret config. Add systemd units/targets for Node 1 Market Data groups, Node 2 Strategy groups+Trading+Control, and Node 3 Storage+PostgreSQL+Alert exactly as the role mapping assigns them.
- Configure startup dependencies, readiness gates, restart limits, connector/strategy CPU affinity after measurement, memory/file limits, credentials, journald retention, network hardening, graceful drain, and clock synchronization checks.
- Formalize the M1 monitoring path with production Prometheus, alert rules, Grafana dashboards, PostgreSQL/Parquet/WAL backup jobs, disk capacity forecasts, and restore/runbook automation. M9 packages and operates signals already emitted since M1; it does not first introduce them.
- Exercise rolling deployment, previous-binary rollback, config rollback, node/group loss, network partition, DB loss, disk-full, clock skew, and operator kill switch.

Acceptance:
- A clean three-node install reaches ready state in documented order and never accepts a live intent while market data, account state, WAL, exact reconciliation, schema compatibility, or control version is invalid.
- One connector task, venue group, strategy group, process, or node failure has the documented blast radius; restart/replay restores state or remains safely halted.
- Dashboards and alerts expose every SLO and queue/stream/group health signal; runbooks identify one operator action per critical page.
- Restore drills recover Core, Analytics, Parquet manifests/readers, strategy snapshots, config, and WAL according to documented RPO/RTO.
- Paper and shadow soaks complete before the live-capital gate; live remains disabled by default.

Verification commands:
```bash
systemd-analyze verify ops/systemd/*.service ops/systemd/*.target
promtool check config ops/prometheus/prometheus.yml
promtool check rules ops/prometheus/rules/*.yml
cargo test -p conformance-tests --test three_node_smoke -- --ignored
cargo test -p conformance-tests --test connector_group_failure_matrix -- --ignored
cargo test -p conformance-tests --test node_failure_matrix -- --ignored
cargo test -p conformance-tests --test rolling_rollback -- --ignored
cargo test -p conformance-tests --test disaster_restore -- --ignored
```

## M10: Capacity-checkpointed exchange and strategy fan-out
**Depends on:** M9 operational gate and measured capacity headroom. This work must not begin as broad parallel implementation before M1-M9 contracts are stable.

### Batch plan
- **M10a reference batch:** add no more than three additional public connectors and three strategies. Exercise the complete authoring, review, shadow, supervisor, schema, runbook, and capacity process.
- **M10b onward:** add batches of at most five public connectors and at most five strategies, independently releasable. A connector batch and strategy batch need not coincide. No next batch starts until the prior capacity checkpoint is signed off.
- Add exchanges from an approved priority matrix covering value, tier, market/channel availability, API stability, legal/account access, rate limits, sequence semantics, stable-key reconciliation where private, and operational burden. Public and private capabilities remain independent.
- Require fixture capture, normalization mapping, book algorithm, rate-limit behavior, reconnect/recovery, quality signals, supervisor/panic/group-death tests, and conformance per public connector. Require sandbox, idempotency, credential isolation, exact stable-key reconciliation, and explicit capital approval per private connector.
- Add strategies through manifests and `strategy-api`, shadow-soak each version, assign it to a measured runtime group, and capacity-test merged subscriptions and routing.

### Admission budgets
Initial guardrails are percentages of each systemd group's assigned resources and are tightened from measured evidence, never relaxed merely to admit a batch:
- **Tier A live-traded primary:** dedicated venue-group process by default; at most three connectors only with evidence. Any one connector stays under 25% of group CPU and 20% of `MemoryMax` steady. No raw/book loss is accepted.
- **Tier B monitored:** at most five connectors per group; each stays under 15% CPU and 12% of `MemoryMax` steady. Declared top-of-book/trade policy applies under pressure.
- **Tier C aggregate-only:** at most ten connectors per group; each stays under 8% CPU and 6% of `MemoryMax` steady. Only declared aggregate/coalescing loss is permitted.
- Every Node 1 venue group and Node 2 strategy group stays at or below 60% assigned CPU and 60% `MemoryMax` steady. At 2x observed aggregate peak it stays below 75% CPU, 70% `MemoryMax`, p99 queue depth below 50%, maximum queue high-water below 80%, and the approved latency/data-quality SLO. Disk/network/storage projections retain 40% steady headroom.
- Strategy groups admit at most five new strategies per batch. Latency-critical/high-risk strategies receive dedicated groups; every other group meets the same CPU/RSS/queue thresholds and shadow divergence limits.

### Capacity checkpoint and exceeded contingency
After every connector or strategy batch, remeasure Node 1 per-connector/group CPU, RSS, queues, ingress/egress bandwidth, reconnects, data loss, and storage amplification; remeasure Node 2 per-strategy/group CPU, RSS, queues, evaluation latency, shadow divergence, intent rate, and cross-node transport. Replay a 2x aggregate workload and store the signed result under `docs/benchmarks/m10-batch-<NN>.md` with machine data beside it.

If any limit fails: disable and roll back the newest batch, retain its fixtures, and do not start the next batch. First regroup connectors or strategies within their assigned ADR role and existing three nodes, isolate the heavy member, adjust measured CPU affinity/MemoryMax, deduplicate subscriptions, and optimize the proven bottleneck. Hardware may be vertically upgraded on the same node. If the three assigned nodes still cannot meet the budget, defer fan-out and raise an ADR escalation. A fourth node or role relocation is not an implementation detail and may not be added under this plan.

Acceptance per batch:
- Every new connector and strategy passes its conformance, isolation, deterministic replay, snapshot/restore, resource, shadow, runbook, and schema checks without changing canonical consumers.
- Each private connector separately proves every reconciliation-key capability and exact post-restart sent-unknown resolution. A venue that cannot prove it remains non-live and typed fail-closed.
- Forced connector panic, parser panic, OOM/group death, strategy panic, and queue exhaustion stay within the declared group blast radius and produce M7 alerts.
- The signed capacity checkpoint meets all tier/group budgets at 2x aggregate load before the next batch is admitted.

Final M10 acceptance:
- At least 30 public exchange connectors pass the same conformance and replay suite. Every unsupported channel/capability is explicit, and every connector is assigned to a supervised tier group within budget.
- At least 30 strategy implementations/manifests pass deterministic replay, snapshot/restore, dependency isolation, resource, and shadow qualification tests.
- Approximately 5-10 strategy runtime groups remain within measured SLOs; dedicated runtimes are justified only for high-risk or latency-critical cases.
- A connector or strategy failure cannot corrupt unrelated state, exhaust unbounded memory, or bypass central risk/execution.
- Operator runbooks, dashboards, batch capacity artifacts, and on-call burden review are complete for every enabled venue and strategy.

Verification commands:
```bash
cargo test -p conformance-tests --test fanout_batch_contract
cargo test -p conformance-tests --test all_public_connectors
cargo test -p conformance-tests --test approved_private_connectors -- --ignored
cargo test -p conformance-tests --test reconciliation_key_capabilities
cargo test -p conformance-tests --test all_strategies_replay_restore
cargo test -p conformance-tests --test subscription_capacity
cargo test -p conformance-tests --test connector_strategy_isolation
cargo test -p conformance-tests --test fanout_batch_capacity -- --ignored
cargo test --workspace --all-features
```

# Acceptance criteria
## Overall definition of done
- All ADR-001..ADR-022 constraints are represented by code, configuration schema, tests, operations, or an explicit unsupported capability; architecture checks prevent forbidden dependencies.
- The six ADR role families plus the Node 2 control adapter run according to the role and transport tables. Node 1 connector groups and Node 2 strategy groups provide explicit task/process fault isolation without changing the ADR role boundaries.
- Canonical events are the only inputs to strategies, alerts, storage, and replay; adding an exchange does not change these consumers.
- 30+ public exchanges and 30+ native strategies meet every M10 batch conformance, determinism, isolation, reconciliation, and capacity gate. Private trading is enabled only for approved venues with exact sent-unknown reconciliation.
- Every accepted order intent is traceable by shared `trading-core` IDs through reservation, risk decision, fsynced WAL command, exchange observations, Core materialization, fills/cancel, and reconciliation.
- Crash/restart/network/disk/database fault matrices demonstrate no duplicate exchange order and no unsafe automatic retry; unresolved state creates a typed halt and blocks new trading.
- `schemas/registry.toml` maps every persisted/wire representation, and every retained Parquet generation remains replayable or has a verified migration path.
- Tiered Parquet and dual PostgreSQL retention, backup, restore, replay, and deterministic backtest pass their drills.
- Scrape/log/page coverage exists from M1; formal Prometheus/Grafana/journald and alert delivery cover defined SLOs and critical faults without secret leakage or unbounded cardinality by M9.
- Fresh three-node systemd deployment, drain, rolling upgrade, binary/config rollback, kill-switch exercise, and disaster restore follow tested runbooks.
- TypeScript, npm/PM2/browser automation, obsolete configuration, and stale docs are absent after M4b; the new `AGENTS.md` is accurate.
- Live enablement remains an explicit audited operation after all gates, not a config default or side effect of deployment.

# Verification
## Continuous quality gates
- Every change: format, clippy with warnings denied, unit/doc tests, schema generation/registry diff, dependency policy, secret scan, architecture dependency tests, blocking 70% workspace line coverage, and blocking 85% line coverage for each safety-critical crate after introduction.
- Connector changes: recorded fixture unit tests, supervisor fault tests, resource-budget checks, operation/reconciliation capability tests, plus public/private conformance as applicable. External tests are marked and run in controlled CI with scoped credentials.
- Schema changes: cross-representation registry update, old-reader/new-writer and new-reader/old-writer compatibility matrix, retained Parquet generation test, golden bytes, malformed input fuzzing, and migration note.
- Unsafe/transport changes: focused review, loom-style atomic model tests where applicable, Linux sanitizer/Miri-capable tests where supported, fault tests, benchmark comparison, and soak before merge.
- Trading changes: property invariants, WAL crash matrix, capability-aware paper end-to-end, sandbox reconciliation, and replay parity before shadow deployment.
- Deployment changes: `systemd-analyze`, Prometheus rule/config validation, staged node smoke, role/transport table checks, rollback, and readiness gate checks.

# Escalation/Risk Gate
1. **G0a Transport selection, M0:** architect and safety reviewer approve the SBE codec and shared-memory candidate only after golden vectors, unsafe invariant review, the named M0 raw-feed artifact, provisional 2x workload benchmark, corruption/fault tests, and a documented maintenance decision. Failure keeps M1 in-process and blocks M2 implementation.
2. **G0b Production transport, M2:** after M1 hard-revalidates the feed rate, rerun any undersized G0a benchmark and require the production transport fault suite plus 24-hour Linux soak at the final 2x target. Failure blocks all cross-process strategy/trading work.
3. **G1 Exchange access:** private work starts only with current official documentation, permitted account capability, IP/rate-limit details, sandbox path, scoped credentials, and a reconciliation-key capability declaration. Bithumb margin remains unsupported until borrow/repay/query and exact reconciliation APIs are verified; browser automation is not an alternative.
4. **G2 Order recovery:** critic independently reviews `trading-core` transitions, WAL fsync point, stable key capability per venue, typed unreconcilable halt, and crash matrix. Any blind/ambiguous auto-retry blocks M4b and all live work.
5. **G3 Storage recovery and schema retention:** Core/Analytics backup restore, WAL+Core+exchange recovery, registry compatibility, and retained-generation Parquet replay pass on clean hosts. Failure blocks M6 parity claims and live enablement.
6. **G4 Live-capital gate:** require read-only soak, paper soak, sandbox exact-key reconciliation, shadow strategy comparison, formal alerts, hard and soft kill drills, three-node fault drill, smallest-notional canary plan, venue approval, and operator sign-off. Any missing evidence leaves `live_enabled=false`.
7. **G5 Fan-out:** require M1-M9 acceptance and measured headroom. Every batch is limited and checkpointed; a failed checkpoint rolls back that batch. Exhausting three-node capacity raises an ADR rather than adding a fourth node silently.

Handoff guidance:
- Use an **architect** for M0 boundary/dependency review, G0a/G0b SBE/shm selection, process/transport mapping, schema governance, and M4 recovery review.
- Use a **critic** at G0, G2, G4, after the M10 reference batch, and before accepting this plan as the release baseline.
- Use an **executor** for each bounded crate or connector after its contract and tests are approved.
- Use a **team** only for independent lanes whose shared schemas are frozen, especially M10 batches; never split ownership of `trading-core`/WAL recovery across teams.
- Use **ultragoal** for multi-milestone autonomous execution only with milestone, capacity, and live-capital gates preserved as hard stops.

# Verification Plan
## Unit layer
- Canonical value bounds, scale conversion, IDs, event validation, schema defaults, registry validation, and time semantics.
- Order-book snapshot/delta ordering, duplicate/gap behavior, crossed-book rejection, and data freshness.
- Connector supervisor backoff/circuit/quarantine, capability declaration validation, subscription merge/routing, strategy timers/state/limits, premium math, fees/depth/staleness, portfolio reservation/netting, and every risk boundary.
- `trading-core` transition matrix and reconciliation halt, WAL frame encode/decode/checksum/torn-tail scan/state fold, retention partitioning, schema adapters, alert rule/dedup logic, virtual clock, and execution models.
- Property/fuzz tests for parsers, codecs, scaled arithmetic, ring wraparound, WAL recovery, order transitions, and reservation conservation.

## Integration layer
- Every connector against recorded raw fixtures and a common capability/conformance suite; controlled official sandbox tests are separate and credential-scoped.
- Connector task panic, watchdog, restart circuit, quarantine, queue/RSS budget, and venue-group process death while sibling groups continue.
- SPSC/shm/TCP adapters against the same event-stream contract, including slow consumer, full queue, checksum failure, schema mismatch, gap/replay, reconnect, and endpoint restart.
- Current and retained-generation Parquet write/read, manifest recovery and rewrite; Core/Analytics idempotency, materialization crash, outage, migration, and backup/restore; alert provider retry; gRPC auth/config version/fan-out/audit.
- Strategy live/replay clock and execution contract parity, snapshot compatibility, and shadow-version divergence reports.

## End-to-end layer
- Public feed -> supervised connector -> normalize -> book -> state -> versioned Parquet, first in-process and then across process/server transport.
- Independent connector panic and group-death scenarios prove that unrelated venues remain valid and available.
- Public feeds -> planner -> grouped strategy -> shadow intent with stale/gap suppression.
- TradeIntent -> Portfolio -> Risk -> WAL fsync -> paper/sandbox connector -> capability-aware reconciliation -> Core, with process kills injected at each boundary and no PostgreSQL case claimed before M5.
- Multi-generation Parquet -> virtual clock -> same strategy -> simulated execution -> Analytics, compared with captured shadow output.
- Canonical event -> alert rule -> durable delivery retry -> provider acknowledgment -> Core history; bootstrap metrics/page parity is retained.
- Node 2 control -> local/remote role fan-out, partial convergence/rollback, and local-first global kill under cross-node partition.
- Three-node cold start, rolling upgrade, rollback, network partition, group/node loss, disk-full, DB loss, clock skew, kill switch, and disaster restore.
- Each M10 batch runs 2x aggregate replay and records Node 1/Node 2 resource and SLO evidence before admission.

## Observability layer
Tests assert emitted metrics, structured logs, correlation fields, health state, and alerts rather than merely checking process success. The M1 bridge makes these assertions operational early; M7 adds canonical rules/durable delivery and M9 adds production dashboards and packaging. Required signals include:
- Per-connector/group ingest messages/bytes/errors, source/internal sequence gaps, reconnects, watchdog restart/circuit/quarantine, attributable buffer bytes, group RSS, book resync, stale/crossed state, event age, and per-queue depth/high-water/drop/coalesce counters.
- Shared-memory generation/heartbeat/checksum errors and TCP session/replay/schema/reconnect/round-trip latency.
- Strategy event/evaluation latency, panic/limit termination, snapshot age, intent counts, shadow divergence, and per-group CPU/RSS.
- Reservation/exposure/risk denial by bounded reason, kill state, order state/unknown count, reconciliation capability/version/halt, exchange ack/reject latency, WAL append/fsync/recovery/corruption/disk headroom.
- PostgreSQL writer lag/error/pool/materialization state, Parquet schema generation/publish/manifest/gap/retention/migration/disk state, replay progress/determinism failures, and alert queue/delivery/dead-letter state.
- Control request/version/audit, per-node status freshness, fan-out convergence, and rollback state.
- Metric labels use bounded venue/process-group/event/reason vocabularies. High-cardinality event, intent, client-order, and account IDs appear only in redacted structured logs and durable records for correlation.

Health semantics:
- Liveness means the process loop can answer.
- Readiness is role-specific and fail-closed: valid supervised subscriptions and books for strategy, restored strategy state, reconciled account/order state, exact-key connector capability, writable/fsyncing WAL, healthy private session, supported schema generations, and policy/config version agreement for trading.
- A quarantined Tier A connector makes dependent strategies not ready. An isolated lower-tier failure affects only declared subscriptions, not unrelated venue readiness.
- Degraded storage may allow market ingestion under its declared loss policy but never hides a gap. Trading halts when required Core reconciliation, account freshness, or WAL safety is unavailable.

# Rollback and kill-switch story
- Build immutable, checksummed, versioned binaries and config bundles. systemd points to an `active` release symlink with the previous compatible release retained. Rollback drains producers, halts new intents, snapshots strategy state, flushes WAL/writers, switches binary/config, restarts in dependency order, and reconciles before readiness.
- Schema rollout is expand-first and backward-compatible under `schemas/registry.toml`. Do not roll back a binary that cannot read current WAL, strategy snapshot, SBE, Protobuf, PostgreSQL, or any retained Parquet generation. Forward-fix or use an explicitly tested compatibility reader when rollback is unsafe.
- Soft kill scopes are global, venue, account, strategy, and instrument. Activation is versioned, durably WAL/audit recorded, rejects new intents before reservation, and optionally cancels open orders only under a reviewed policy. Existing orders are reconciled; a cancel request is not treated as canceled until observed.
- A local Node 2 emergency control path must work if remote gRPC is unavailable, authenticate the operator, and write the same durable kill record. The hard runbook stops trading units, blocks private egress or revokes API keys, and then queries exchange state out of band. Restart never clears a kill automatically.
- Roll forward from paper -> shadow -> sandbox -> minimum-notional canary -> bounded live allocation. Any data-quality, supervisor, WAL, exact-reconciliation, schema, clock, or private-session readiness failure returns to halt-new-orders and pages the operator.
- M10 batch rollback disables the newest manifests/subscriptions and restores the prior group layout/capacity bundle. It never deletes captured data or changes the three-node topology.

# Pre-mortem
1. **SBE/shared-memory instability corrupts the order or market path.** Scenario: an ABI mismatch or atomic ordering bug accepts a torn frame after producer restart, leading to a bad book or intent. Mitigations: versioned/checksummed slots, generation fencing, bounds checks before decode, isolated unsafe module, golden vectors, model/stress tests, corrupt-frame injection, book invalidation on any gap, and no order-path shared-memory rollout before G0b approval.
2. **WAL/recovery semantics create duplicate orders.** Scenario: a crash occurs after exchange acceptance but before local ack append, and a venue cannot query the submitted client key. Mitigations: stable IDs, append+fsync before send, per-venue reconciliation-key declarations, authoritative post-restart lookup conformance, typed fail-closed halt when exact resolution is unavailable, no blind retry, exhaustive boundary crash matrix, sandbox restart drills, and independent G2 review.
3. **Scope explodes across 30+ exchanges before one slice works.** Scenario: parallel connectors invent different normalization and sequence rules, while storage and strategy contracts remain unproven and the operator inherits dozens of failing feeds. Mitigations: M10 hard dependency on M1-M9, supervised Binance/Bithumb references, one conformance suite, maximum-five batches, tier budgets, per-batch capacity checkpoints, rollback of the newest batch, and ADR escalation before any fourth node.

# Risks and mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Rust SBE ecosystem choice is immature or incompatible | Wire bugs or abandoned generator | M0 bounded bake-off, golden vectors, malformed input tests, pinned generator, checked-in schema provenance, repository-owned generation fallback |
| Existing shared-memory crate is not truly process-safe | UB, lost/corrupt frames | Own narrow ABI/ring layout over maintained syscall wrappers, isolate unsafe, Linux fault/soak tests, generation fencing and checksum |
| Connector panic or memory leak takes down all feeds | Cross-venue outage and stale strategies | Per-connector supervised tasks, fixed queues/buffers, watchdog/circuit/quarantine, venue-tier process groups, systemd MemoryMax, group-death tests |
| macOS workstation cannot verify Linux primitives/systemd | Late deployment failure | Mandatory Linux CI from M0 and dedicated Linux integration host before M2; three hosts before M9 |
| Bithumb margin has no supported API in the old design [High] and current capability is unverified [Unknown] | Reverse-kimchi cannot execute safely | Keep Bithumb margin capability false, do not port browser automation, verify current official API/account terms and exact reconciliation, use public strategy shadow and other API-supported venue paths |
| Venue cannot reconcile sent-unknown by stable key | Duplicate-order risk | Declare exact query/echo surfaces, conformance test them, classify connector non-live, durable typed halt, never blind retry |
| Exchange sandbox differs from production | False confidence in order lifecycle | Recorded production-read fixtures, smallest-notional canary, conservative capability flags, reconcile before retry, venue-specific runbook |
| WAL disk/fsync behavior is misconfigured | Unsafe send or trading halt | Local Node 2 durable filesystem qualification, preallocation/rotation, disk watermarks, fsync metrics, fault drills, never place WAL on network storage |
| Stored schema outlives its reader | Tiered history becomes unreplayable | Cross-representation registry, generation metadata, retained-generation CI matrix, atomic rewrite tool, block adapter removal while manifests reference it |
| Dual PostgreSQL and tiered files overwhelm one operator | Slow incident response and data loss | Coarse role families, declarative migrations/retention, automated backups, capacity alerts, restore drills, bounded venue rollout, documented action per page |
| High-cardinality telemetry overloads Prometheus | Monitoring outage during incident | Bounded labels, IDs in logs/WAL/Core only, recording rules, cardinality tests and dashboard budgets |
| Strategy snapshot/schema change breaks shadow replacement | Lost state or divergent behavior | Version snapshots, migration functions, restore/replay test, dual-run comparison, rollback compatibility gate |
| Clock skew across three servers | Wrong freshness, sequencing, or latency conclusions | NTP/chrony checks, event and ingest timestamps, monotonic local durations, readiness bound on skew, clock-skew fault test |
| Secrets leak through config/logs/WAL | Account compromise | Node 2-only credentials, least-privilege keys, withdrawal disabled where possible, systemd credentials/root-owned files, redaction tests, rotation runbook |
| 30+ connectors exceed three-node capacity | Feed bans, stale strategies, or hidden fourth-node drift | Maximum-five batches, tier/group budgets, 2x checkpoints, rollback/regroup/vertical upgrade within three nodes, ADR escalation for a fourth node |
| Single-operator page volume becomes unmanageable | Missed critical incident | M1 real paging path, bounded labels/dedup, M7 ownership/escalation, per-batch burden review, fail-closed automation |

# Open assumptions
All assumptions below require confirmation or evidence at the named gate; none silently enables live trading.
1. **First public exchange:** Binance BTC/USDT is selected for M0 rate capture and M1 because the scaffold already names it and it avoids the unverified Bithumb margin dependency.
2. **Feed baseline:** a 24-hour Binance depth/trade/book-ticker probe is representative enough for a provisional M0 target only. M1 production-connector capture is the hard correction, and later exchanges add their own baselines before admission.
3. **Second public exchange and first strategy:** Bithumb BTC/KRW plus USDT/KRW and the kimchi-premium detector from old `AGENTS.md` are selected for M3. It is a shadow strategy first, not authorization to port the old execution sequence.
4. **First private exchange:** Binance testnet/sandbox is selected for M4b. Exact market product, client-key behavior, and endpoint set require current account/API confirmation.
5. **Paper gate:** paper execution is mandatory before sandbox, and live is mandatory-off through M9. Proposed minimum soaks are 7 days read-only, 7 days paper, and 7 days shadow with no unresolved critical alert; final durations derive from event volume and operator risk policy.
6. **Bithumb capabilities:** public market and spot private APIs may be usable, but margin borrow/repay/query and exact sent-unknown recovery are treated as unsupported until current official proof exists. No browser fallback is accepted.
7. **Hardware:** three Linux servers with local NVMe where assigned, HDD capacity on Node 3, reliable private networking, and clock synchronization are not yet confirmed. M9 cannot pass on the macOS workstation alone; isolated Linux VMs may validate behavior but do not satisfy final capacity acceptance.
8. **Performance SLOs:** M0 derives provisional throughput from the named raw probe; M1 hard-revalidates it. Latency, storage volume, retention days within ADR ranges, RPO/RTO, and hardware headroom still require measured numeric approval before M2/M9 gates.
9. **Connector grouping:** Tier A dedicated, Tier B maximum five, and Tier C maximum ten are initial admission guardrails. Measured evidence may lower group sizes; raising them requires architect and capacity review without weakening utilization limits.
10. **Numeric model:** checked scaled integers are assumed for deterministic SBE/live/replay behavior; per-instrument scales and overflow limits come from verified venue metadata.
11. **Rust dependencies:** Tokio is fixed by the ADR stack. SQLx, Arrow/Parquet ecosystem crates, gRPC tooling, mmap/syscall wrappers, and an SBE codec are selected only after M0 maintenance/license/benchmark checks; no runtime plug-in layer is planned.
12. **Network security:** the three nodes use a private network with authenticated encrypted control traffic and protected data-plane links according to the operator threat model. Exact TLS/mTLS termination and certificate rotation require infrastructure confirmation.
13. **Control-plane placement:** the auxiliary coordinator is on Node 2 to keep kill application local to trading. Runtime control endpoints on Nodes 1/3 are assumed acceptable under ADR-007 because they carry control/status only.
14. **Live strategy scope:** kimchi remains shadow or paper unless every transfer, borrow, repay, withdrawal, fee, settlement, and recovery capability is API-supported and approved. A simpler API-supported canary strategy may validate live plumbing without changing the first strategy port.
15. **Fan-out meaning:** 30+ exchanges means public canonical-data support for at least 30 venues; private order support is limited to approved live venues. 30+ strategies means distinct tested native implementations/manifests, not copies with different parameters.
16. **Single operator:** no 24/7 team is assumed. Automated fail-closed behavior, bounded alert volume, capacity forecasts, and restore drills are therefore release requirements.
17. **Legacy preservation:** Git history plus the migration ledger is sufficient provenance after M4b deletion; the deployed repository need not retain a second source tree.
