# VocalIQ — Kubernetes Scale-Out (Day 62)

Manifests for running VocalIQ on K8s (EKS/GKE) with autoscaling and multi-region voice.

## Components
- `api-deployment.yaml` — stateless API, HPA on CPU (2→20).
- `voice-deployment.yaml` — real-time voice, HPA on **concurrent calls** (custom metric, 2→50); deploy one per media region (`region` label + `DATA_REGION` env) for multi-region low latency.
- `workers-deployment.yaml` — BullMQ workers, HPA on **queue depth** (2→30).
- `../scale-stores.docker-compose.yml` — ClickHouse + Qdrant for local/self-host scale-out.

## Scale-out backends (config, not code)
The app selects backends from env via the `@vocaliq/shared` `resolveScaleBackends()`:
- `CLICKHOUSE_URL` → event analytics move to ClickHouse (Timescale stays for operational metrics).
- `QDRANT_URL` → large vector workloads move to Qdrant (pgvector remains the default).
- `VOICE_REGIONS=us-east,eu-west,…` → multi-region voice; calls route to the nearest region (`nearestVoiceRegion`).

Each is behind a provider-style seam (`AnalyticsSink` conceptually; `VectorStore` in `apps/api/src/scale/vector-store.ts`) so switching is a config change with a parity contract — no caller rewrite.

## Custom metrics
Install the Prometheus Adapter and expose `vocaliq_active_calls` (voice) + `vocaliq_queue_depth` (workers) so the HPAs scale on real load, not just CPU.

## Validation
- `kubectl apply -f infra/k8s/` then load-test: confirm api scales on CPU, voice on concurrent calls, workers on queue depth.
- Regional latency: place calls from multiple geographies; confirm each connects to its nearest `mediaHost` and measure the RTT improvement vs single-region.
- Parity: run the vector-store parity test (`scale.service.test.ts`) — any backend must reproduce the in-memory cosine ranking.
