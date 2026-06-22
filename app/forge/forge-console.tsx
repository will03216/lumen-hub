"use client";

/**
 * Forge Console — the operator/creator surface for the guarded agentic
 * pipeline. Three steps mapping to the architecture:
 *
 *   1. Vertical    — pick a Pipeline Template (the production line / vertical).
 *   2. Brief       — describe the work; the Planner agent compiles a Spec.
 *   3. Freeze gate — review the Production Spec + pre-commit cost estimate +
 *                    policy validation, then FREEZE and compile it into a
 *                    Studio canvas that the deterministic runner executes.
 *
 * The freeze is the seam: everything above it is agentic/divergent, everything
 * below it is deterministic/convergent. "Open as Canvas" reuses the existing
 * Studio runner — the agent never gets its own runtime.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Megaphone,
  Gamepad2,
  ShoppingBag,
  Sparkles,
  Loader2,
  Lock,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { listTemplates, getTemplate } from "@/lib/forge/templates";
import type { PipelineTemplate } from "@/lib/forge/templates/types";
import { freezeSpec, type ProductionSpec, type SpecValidation } from "@/lib/forge/spec";
import type { SpecCostEstimate } from "@/lib/forge/budget";
import { compileSpecToCanvas } from "@/lib/forge/compiler";
import { createProject } from "@/lib/studio/projects";
import { userKey } from "@/lib/storage-user";

const ICONS: Record<string, LucideIcon> = {
  Megaphone,
  Gamepad2,
  ShoppingBag,
  Sparkles,
};

const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced" },
  { id: "claude-opus-4-7", label: "Opus 4.7 — deepest planning" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 — fastest" },
];

type Step = "vertical" | "brief" | "review";

type PlanResponse = {
  spec?: ProductionSpec;
  validation?: SpecValidation;
  cost?: SpecCostEstimate;
  groundedDocs?: string[];
  promptEngineered?: number;
  secondPass?: boolean;
  error?: string;
};

const KEY_STORAGE = () => userKey("lumen.forge.claudeKey.v1");

export function ForgeConsole() {
  const router = useRouter();
  const templates = useMemo(() => listTemplates(), []);

  const [step, setStep] = useState<Step>("vertical");
  const [templateId, setTemplateId] = useState<string>("");
  const [brief, setBrief] = useState("");
  const [shotCount, setShotCount] = useState<number | "">("");
  const [claudeModel, setClaudeModel] = useState(CLAUDE_MODELS[0].id);
  const [claudeKey, setClaudeKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(KEY_STORAGE()) ?? "";
    } catch {
      return "";
    }
  });

  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<ProductionSpec | null>(null);
  const [validation, setValidation] = useState<SpecValidation | null>(null);
  const [cost, setCost] = useState<SpecCostEstimate | null>(null);
  const [groundedDocs, setGroundedDocs] = useState<string[]>([]);
  const [promptEngineered, setPromptEngineered] = useState(0);
  const [highFidelity, setHighFidelity] = useState(true);

  const template = getTemplate(templateId);

  const persistKey = useCallback((v: string) => {
    setClaudeKey(v);
    try {
      localStorage.setItem(KEY_STORAGE(), v);
    } catch {
      /* best-effort */
    }
  }, []);

  const onPick = useCallback((t: PipelineTemplate) => {
    setTemplateId(t.id);
    setShotCount(t.defaultShotCount);
    setStep("brief");
  }, []);

  const onPlan = useCallback(async () => {
    if (!template) return;
    setError(null);
    setPlanning(true);
    setSpec(null);
    try {
      const res = await fetch("/api/forge/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          templateId: template.id,
          shotCount: shotCount === "" ? undefined : Number(shotCount),
          claudeApiKey: claudeKey.trim() || undefined,
          claudeModel,
          highFidelityPrompts: highFidelity,
        }),
      });
      const json = (await res.json()) as PlanResponse;
      if (!res.ok || !json.spec) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSpec(json.spec);
      setValidation(json.validation ?? null);
      setCost(json.cost ?? null);
      setGroundedDocs(json.groundedDocs ?? []);
      setPromptEngineered(json.promptEngineered ?? 0);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanning(false);
    }
  }, [brief, template, shotCount, claudeKey, claudeModel, highFidelity]);

  const onFreezeAndOpen = useCallback(() => {
    if (!spec || !template) return;
    const frozen = freezeSpec(spec);
    const { canvas } = compileSpecToCanvas(frozen, template);
    const project = createProject({
      name: `${template.label} — ${spec.brief.slice(0, 32) || "Production"}`,
      templateId: template.id,
      canvas,
    });
    router.push(`/studio/${project.id}`);
  }, [spec, template, router]);

  return (
    <div className="flex flex-col gap-8">
      <Header step={step} template={template} onBack={() => setStep(step === "review" ? "brief" : "vertical")} />

      {step === "vertical" && <VerticalPicker templates={templates} onPick={onPick} />}

      {step === "brief" && template && (
        <BriefForm
          template={template}
          brief={brief}
          setBrief={setBrief}
          shotCount={shotCount}
          setShotCount={setShotCount}
          claudeModel={claudeModel}
          setClaudeModel={setClaudeModel}
          claudeKey={claudeKey}
          setClaudeKey={persistKey}
          highFidelity={highFidelity}
          setHighFidelity={setHighFidelity}
          planning={planning}
          error={error}
          onPlan={onPlan}
        />
      )}

      {step === "review" && spec && template && (
        <SpecReview
          spec={spec}
          template={template}
          validation={validation}
          cost={cost}
          groundedDocs={groundedDocs}
          promptEngineered={promptEngineered}
          onFreeze={onFreezeAndOpen}
          onReplan={() => setStep("brief")}
        />
      )}
    </div>
  );
}

// ─────────────────────────────── Header ────────────────────────────────

function Header({
  step,
  template,
  onBack,
}: {
  step: Step;
  template?: PipelineTemplate;
  onBack: () => void;
}) {
  const steps: { id: Step; label: string }[] = [
    { id: "vertical", label: "Vertical" },
    { id: "brief", label: "Brief" },
    { id: "review", label: "Freeze gate" },
  ];
  const activeIdx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {step !== "vertical" && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
          >
            <ArrowLeft className="size-3" /> Back
          </button>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Forge{template ? <span className="text-ink-dim"> · {template.label}</span> : ""}
        </h1>
      </div>
      <p className="max-w-[68ch] text-[13px] leading-relaxed text-ink-dim">
        Agentic where reasoning helps, deterministic where consistency matters. The agent plans a{" "}
        <span className="text-ink">Production Spec</span>; you approve it at the{" "}
        <span className="text-ink">freeze gate</span>; the canvas runs it exactly.
      </p>
      <ol className="flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
                i === activeIdx
                  ? "border-accent text-accent"
                  : i < activeIdx
                    ? "border-ok/50 text-ok"
                    : "border-border text-ink-mute",
              ].join(" ")}
            >
              {i + 1}. {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-ink-mute">→</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─────────────────────────── Vertical picker ───────────────────────────

function VerticalPicker({
  templates,
  onPick,
}: {
  templates: PipelineTemplate[];
  onPick: (t: PipelineTemplate) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => {
        const Icon = ICONS[t.icon] ?? Sparkles;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="group flex flex-col gap-3 rounded-[14px] border border-border bg-panel/40 p-5 text-left transition-colors hover:border-ink-dim"
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-flex size-9 items-center justify-center rounded-[10px]"
                style={{ background: `${t.accent}1f`, color: t.accent }}
              >
                <Icon className="size-4" />
              </span>
              <div>
                <div className="text-[14px] font-semibold text-ink">{t.label}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
                  {t.output.kind} · {t.output.aspect}
                </div>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-ink-dim">{t.tagline}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {t.references.mustLock.slice(0, 3).map((r) => (
                <span
                  key={r}
                  className="rounded-full border border-border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-mute"
                >
                  🔒 {r}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────── Brief ─────────────────────────────────

function BriefForm({
  template,
  brief,
  setBrief,
  shotCount,
  setShotCount,
  claudeModel,
  setClaudeModel,
  claudeKey,
  setClaudeKey,
  highFidelity,
  setHighFidelity,
  planning,
  error,
  onPlan,
}: {
  template: PipelineTemplate;
  brief: string;
  setBrief: (v: string) => void;
  shotCount: number | "";
  setShotCount: (v: number | "") => void;
  claudeModel: string;
  setClaudeModel: (v: string) => void;
  claudeKey: string;
  setClaudeKey: (v: string) => void;
  highFidelity: boolean;
  setHighFidelity: (v: boolean) => void;
  planning: boolean;
  error: string | null;
  onPlan: () => void;
}) {
  const isVideo = template.output.kind === "video";
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-4">
        <Field label="Brief">
          <textarea
            rows={8}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={`Describe the production. e.g. "${exampleBrief(template)}"`}
            className="w-full resize-none rounded-[10px] border border-border bg-panel px-3 py-2.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Shots">
            <input
              type="number"
              min={1}
              max={8}
              value={shotCount}
              onChange={(e) => setShotCount(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Planner model">
            <select
              value={claudeModel}
              onChange={(e) => setClaudeModel(e.target.value)}
              className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Claude API key (BYOK — stored only in this browser)">
          <input
            type="password"
            value={claudeKey}
            onChange={(e) => setClaudeKey(e.target.value)}
            placeholder="sk-ant-…"
            className="w-full rounded-[10px] border border-border bg-panel px-3 py-2 font-mono text-[12px] text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
        </Field>

        <label
          className={[
            "flex cursor-pointer items-start gap-3 rounded-[10px] border px-3 py-3 transition-colors",
            isVideo ? "border-border bg-panel/40 hover:border-ink-dim" : "border-border bg-panel/20 opacity-50",
          ].join(" ")}
          title={isVideo ? "" : "Per-shot Seedance optimization applies to video verticals."}
        >
          <input
            type="checkbox"
            checked={highFidelity && isVideo}
            disabled={!isVideo}
            onChange={(e) => setHighFidelity(e.target.checked)}
            className="mt-0.5 size-3.5 cursor-pointer accent-[var(--accent)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[12px] font-medium text-ink">
              High-fidelity per-shot prompts <span className="text-ink-mute">(Seedance second pass)</span>
            </span>
            <span className="text-[11px] leading-relaxed text-ink-dim">
              Run every shot through the full Seedance optimizer (6-component, anti-slop, prose-craft, duration-calculus) instead of the single planning pass. Higher quality; one extra model call per shot.
            </span>
          </span>
        </label>

        {error && (
          <div className="flex items-start gap-2 rounded-[10px] border border-red-900 bg-red-950/30 px-3 py-2.5 text-[12px] text-red-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={onPlan}
            disabled={planning || !brief.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {planning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {planning ? "Agent is planning…" : "Compile Production Spec"}
          </button>
        </div>
      </div>

      <TemplateSidebar template={template} />
    </div>
  );
}

function TemplateSidebar({ template: t }: { template: PipelineTemplate }) {
  return (
    <aside className="flex h-fit flex-col gap-4 rounded-[14px] border border-border bg-panel/40 p-5">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
        Locked policy
      </div>
      <Row label="Output" value={`${t.output.kind} · ${t.output.aspect}${t.output.durationS ? ` · ~${t.output.durationS}s` : ""}`} />
      <Row label="Structure" value={(t.output.structure ?? t.shotRoles).join(" → ")} />
      <Row label="Models" value={[t.models.video, t.models.image].filter(Boolean).join(", ") || "—"} />
      <Row label="Locked refs" value={t.references.mustLock.join(", ")} />
      <Row label="QA must-pass" value={t.qa.must.join(", ")} />
      <Row label="Gates" value={`freeze: required · publish: ${t.gates.publish}`} />
      <Row label="Budget" value={`$${t.budget.projectCapUsd} project · $${t.budget.perShotCapUsd}/shot · ${t.budget.regenCap} regens`} />
      <div className="rounded-[8px] border border-border bg-panel px-3 py-2 text-[11px] leading-relaxed text-ink-dim">
        {t.consistency.bible ? "Production Bible on · " : ""}
        {t.consistency.frameChaining ? "frame-chaining · " : ""}
        {t.consistency.seedLock ? "seed-lock" : ""}
      </div>
    </aside>
  );
}

// ───────────────────────────── Spec review ─────────────────────────────

function SpecReview({
  spec,
  template,
  validation,
  cost,
  groundedDocs,
  promptEngineered,
  onFreeze,
  onReplan,
}: {
  spec: ProductionSpec;
  template: PipelineTemplate;
  validation: SpecValidation | null;
  cost: SpecCostEstimate | null;
  groundedDocs: string[];
  promptEngineered: number;
  onFreeze: () => void;
  onReplan: () => void;
}) {
  const errors = validation?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = validation?.issues.filter((i) => i.level === "warning") ?? [];
  const blocked = errors.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Cost + gate banner */}
      <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-panel/40 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
            Pre-commit estimate
          </div>
          {cost ? (
            <div className="flex items-baseline gap-4">
              <span className="text-2xl font-semibold text-ink">~${cost.expectedUsd}</span>
              <span className="text-[12px] text-ink-dim">
                worst-case <span className={cost.breach ? "text-red-400" : "text-ink"}>${cost.worstCaseUsd}</span> / cap ${cost.projectCapUsd}
              </span>
            </div>
          ) : (
            <span className="text-ink-dim">—</span>
          )}
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-mute">
            spec {spec.specHash}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReplan}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12px] text-ink-dim transition-colors hover:border-ink-dim hover:text-ink"
          >
            Re-plan
          </button>
          <button
            type="button"
            onClick={onFreeze}
            disabled={blocked}
            title={blocked ? "Resolve policy errors before freezing." : "Freeze the spec and open it as a runnable canvas"}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-[13px] font-medium text-[var(--bg)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Lock className="size-4" />
            Freeze & open as canvas
          </button>
        </div>
      </div>

      {groundedDocs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-ok/30 bg-ok/5 px-3 py-2.5 text-[11px] text-ink-dim">
          <CheckCircle2 className="size-3.5 text-ok" />
          <span className="text-ink">
            {promptEngineered > 0
              ? `${promptEngineered}/${spec.shots.length} shots optimized via the per-shot Prompt Engineer`
              : "Prompts grounded in the Seedance 2.0 skill"}
          </span>
          <span className="text-ink-mute">·</span>
          {groundedDocs.map((d) => (
            <Tag key={d}>{d}</Tag>
          ))}
        </div>
      ) : template.output.kind === "video" ? null : (
        <Banner
          kind="warn"
          text="This is an image vertical (Seedream); the Seedance skill doctrine does not apply. Prompts use the generic image-prompt guidance."
        />
      )}

      {cost?.breach && (
        <Banner kind="warn" text={`Worst-case spend exceeds the project cap. The executor will halt at the cap and escalate rather than overspend.`} />
      )}
      {errors.map((i, k) => (
        <Banner key={`e${k}`} kind="error" text={i.message} />
      ))}
      {warnings.map((i, k) => (
        <Banner key={`w${k}`} kind="warn" text={i.message} />
      ))}

      {/* Shot cards (plan-as-canvas preview) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {spec.shots.map((shot, i) => {
          const shotCost = cost?.perShot.find((p) => p.shotId === shot.id);
          return (
            <div key={shot.id} className="flex flex-col gap-3 rounded-[14px] border border-border bg-panel/40 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-ink/10 font-mono text-[10px] text-ink-dim">
                    {i + 1}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]"
                    style={{ background: `${template.accent}1f`, color: template.accent }}
                  >
                    {shot.role}
                  </span>
                  <span className="text-[13px] font-medium text-ink">{shot.title}</span>
                </div>
                {shotCost && (
                  <span className="font-mono text-[10px] text-ink-mute">~${shotCost.baseUsd}</span>
                )}
              </div>
              <p className="text-[12px] leading-relaxed text-ink-dim">{shot.prompt}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {shot.durationS && (
                  <Tag>{shot.durationS}s</Tag>
                )}
                {template.output.kind === "video" && template.consistency.frameChaining && (
                  <Tag>{i === 0 ? "T2V · anchor" : "I2V · frame-chained"}</Tag>
                )}
                {shot.batchGroup && <Tag>batch: {shot.batchGroup}</Tag>}
                {shot.refs.slice(0, 3).map((r) => (
                  <Tag key={r}>🔒 {r}</Tag>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-[11px] text-ink-mute">
        <CheckCircle2 className="size-3.5 text-ok" />
        Freezing pins the spec hash, locks seeds, and compiles this plan into the existing Studio runner — editable, reproducible, and budget-gated.
      </div>
    </div>
  );
}

// ─────────────────────────────── Bits ──────────────────────────────────

function Banner({ kind, text }: { kind: "error" | "warn"; text: string }) {
  const isErr = kind === "error";
  return (
    <div
      className={[
        "flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-[12px]",
        isErr ? "border-red-900 bg-red-950/30 text-red-400" : "border-amber-400/30 bg-amber-400/5 text-amber-300/90",
      ].join(" ")}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-mute">
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-ink-mute">{label}</span>
      <span className="text-[12px] leading-snug text-ink-dim">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
        {label}
      </span>
      {children}
    </label>
  );
}

function exampleBrief(t: PipelineTemplate): string {
  switch (t.vertical) {
    case "advertisement":
      return "30s ad for a matcha energy drink, Gen-Z spokesperson, punchy hook about the 3pm crash, brand teal + cream.";
    case "filming":
      return "Game cinematic: a lone hunter crests a snow ridge at dawn, draws a glowing bow, a dragon rises from the valley.";
    case "ecommerce":
      return "Minimalist ceramic pour-over coffee dripper, matte white, for a premium DTC coffee brand.";
    default:
      return "Describe your production…";
  }
}
