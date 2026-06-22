# Forge — Architecture (one page)

> **Guarded agentic production pipeline** layered on lumen-hub. Turns a brief into
> consistent AI video/imagery: *agentic where reasoning helps, deterministic where
> consistency matters.* Branch: `agentic_ai_v1`.
>
> **Core idea:** the agent is a *compiler frontend* — it reasons freely, then
> **compiles a frozen Production Spec** that the **existing Studio runner** executes
> deterministically. The agent never gets its own runtime.

---

## End-to-end flow

```
 Brief + chosen vertical
        │
        ▼   ░░░ AGENTIC (divergent — reasoning) ░░░░░░░░░░░░░░░░░░░░░░░░
 ┌──────────────┐   ┌────────────────────┐   ┌─────────────────────────┐
 │  Planner     │──▶│  Prompt Engineer    │──▶│  Spec assemble + valid. │
 │ brief→shots  │   │ per-shot 2nd pass   │   │ (policy + budget)       │
 │ (Seedance-   │   │ Seedance-grounded;  │   └─────────────────────────┘
 │  grounded)   │   │ I2V for chained     │
 └──────────────┘   └────────────────────┘
        │
        ▼   ════════ FREEZE GATE ════════  Production Spec (hashed)
        │            · cost estimate  · policy validation  · human approve
        │
        ▼   ░░░ DETERMINISTIC (convergent — execution) ░░░░░░░░░░░░░░░░░
 ┌──────────────┐   ┌────────────────────────────────────────────────┐
 │  Compiler    │──▶│  Studio Runner (existing topological executor)  │
 │ Spec → nodes │   │  textPrompt → videoGen/imageGen → preview       │
 │ +edges       │   │  frame-chained · QA-guarded · videoStitch       │
 └──────────────┘   └────────────────────────────────────────────────┘
        │
        ▼   ░░░ INNER LOOP (per clip, bounded) ░░░░░░░░░░░░░░░░░░░░░░░░░
        generate ─▶ Seed 2.0 Pro critic scores vs. rubric
            ▲                         │
            │ revise+lever+seed       ▼  pass?  ── yes ─▶ keep (best-of-N)
            └──────── no, attempts<regenCap ──┘   no & cap → flag for human
```

---

## Layered architecture

```
 L7  Experience   Forge console (vertical picker · brief · freeze gate) ·
                  Studio canvas (plan-as-canvas) · QA badges per node
 L6  Agent plane  Planner · Prompt Engineer · Reviser   → emit Production Spec
 L5  Guard plane  freeze gate · policy validation · budget estimate · tool scope
 L4  Execution    Compiler (Spec→graph) + existing Studio Runner (topo DAG)
 L3  Consistency  frame-chaining (I2V) · seed lock · Production Bible (event store)
 L2  Evaluation   Seed 2.0 Pro VLM critic · deterministic checks · critic→regen loop
 L1  Capability   Studio node registry · model adapters (BytePlus/Seedance/Seedream)
 L0  Foundation   Postgres (productions · bibles · qa_traces) · object store · Clerk
```

The defining seam is **L6 (reason) → L4 (execute)**: the **Production Spec**. Above it
is probabilistic; below it is deterministic.

---

## The inner loop (critic → regen ≤ N)

Lives **inside the generator node's `execute()`** (`app/studio/nodes/qa-guard.ts`), so
the topological runner needs no changes. Enabled when a generator carries a QA rubric.

1. **Generate** one attempt (`generate(prompt, seed, overrides)`).
2. **Critic** — Seed 2.0 Pro scores the asset vs. the shot rubric. Video tries native
   `video_url`, falls back to 3 sampled frames. *(Calibration: high-stakes verticals
   sample N× and take the median + a confidence.)*
3. **Deterministic pre-checks** — aspect/duration/fps auto-pass in code (spec-enforced),
   never burning a VLM judgement.
4. **Pass?** (`score ≥ min` AND no must-check failed) → keep. Else:
   - **Reflexion** — re-optimize the prompt from the critic's per-check feedback
     (`/api/forge/revise`), not a string append.
   - **Lever table** — failure signature → parameter override (e.g. `cameraFixed`) and
     targeted Seedance doctrine hint (e.g. lighting/logo/identity).
   - **Bump seed**, regenerate. Stop at `regenCap`, or **early** if the score plateaus.
5. **Best-of-N** — return the highest-scoring attempt (not the last). On exhaustion
   without a pass, flag `qaPass:false` for human review.
6. **Trace** — every attempt logged (`qaTrace` output + console + `/api/forge/trace`).

---

## Verticals (templates as data — `lib/forge/templates/`)

| Vertical | Output | Locks | Gates |
|---|---|---|---|
| **Advertisement** | 9:16 video, hook→body→CTA | brand avatar/colors/logo | auto-publish |
| **Filming & Gaming** | 21:9 cinematic / game trailer | character/world/LUT | human, 2× critic |
| **Ecommerce** | 1:1 product image | product geometry/colors | auto-publish |

Adding a vertical = one object. The agent can only emit nodes in the template's `toolScope`.

---

## File map

```
lib/forge/
  spec.ts                IR: types · hash · validate · freeze
  budget.ts              pre-commit cost estimate + gate
  capabilities.ts        node cost metadata + tool-scope
  compiler.ts            Spec → Studio {nodes, edges} (frame-chain, QA stamp)
  bible.ts               Production Bible (event-sourced continuity)
  seedance-directive.ts  shared Seedance optimizer doctrine (single source)
  templates/             pipeline templates (the 3 verticals)
  agents/
    planner.ts           brief → shots (Seedance-grounded)
    prompt-engineer.ts   per-shot optimize + runPromptReviser (reflexion)
    critic.ts            (Claude critic — optional alt; route uses Seed)
lib/byteplus.ts          scoreAsset()  ← Seed 2.0 Pro VLM critic
lib/studio/video-frame.ts captureFrame / sampleFrames (for the critic)
app/studio/nodes/
  qa-guard.ts            the inner loop (all 7 improvements + lever table)
  qa-result.tsx          QA badge UI (score · confidence · per-check reasons)
  video-gen-node.tsx     guarded generator (loop + frame-chain input)
  image-gen-node.tsx     guarded generator
app/forge/               console: vertical → brief → freeze gate → canvas
app/api/forge/           plan · critic · revise · trace
supabase/pg-schema.sql   productions · production_bibles · forge_qa_traces
```

---

## API routes

| Route | Does | Key |
|---|---|---|
| `POST /api/forge/plan` | brief+template → validated Spec + cost (runs Planner + Prompt Engineer) | Claude |
| `POST /api/forge/critic` | score an asset vs. rubric (Seed 2.0 Pro; video→frames fallback) | BytePlus |
| `POST /api/forge/revise` | reflexion: revise a failing prompt from critic feedback | Claude |
| `POST /api/forge/trace` | persist QA trace for trace-mining (best-effort) | — |

**Keys:** BytePlus key (Settings) drives generation + critic. Forge Claude key
(localStorage, never persisted into the graph) drives planner/prompt-engineer/reviser,
with `ANTHROPIC_API_KEY` server fallback. Missing Claude key → revise degrades to a
simple retry; missing BytePlus key → critic skipped (clip still renders).

---

## Invariants

- **Compile, don't improvise** — execution runs the frozen Spec; it never re-reasons.
- **Reproducible** — spec hash + locked seed + pinned model = regenerable output.
- **Critic scores the original intent** — revisions change generation, not the QA target.
- **Tool-scoped** — the compiler refuses out-of-scope node types.
- **Cost-bounded** — `regenCap` + budget gate; the critic gate sits before promotion.

---

## Status

**Done:** Spec IR · 3 verticals · Planner + Prompt Engineer (Seedance-grounded) ·
freeze gate + budget · compiler · frame-chaining I2V · seed lock · Seed 2.0 Pro critic ·
inner loop with all 7 improvements (reflexion · best-of-N · lever table · early-stop ·
calibration · deterministic pre-checks · observability). `tsc` clean · 20 tests · build green.

**Deferred:**
- **Proxy → final tiering** — *cost lever.* Loop on cheap low-res proxies; promote only a
  passing look to a full-res final (+ upscale). Forge is currently **single-tier** (loops
  at target resolution).
- **Durable runs** — loop is in-browser; a reload loses progress (no Postgres run
  store / Temporal).
- **Real upscale node + 4K/8K finish** — "gate before upscale" currently = flag
  `qaPass:false`, don't auto-promote.
- **Bible write-back + typed-ref injection** on gate approval.
- **Multi-tenancy · metering · RBAC · dollar-budget gating** beyond `regenCap`.
```
