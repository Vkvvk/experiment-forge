import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Check,
  Clipboard,
  ClipboardPaste,
  Download,
  FileText,
  FlaskConical,
  HelpCircle,
  ListChecks,
  RefreshCcw,
  Save,
  Send,
  Sparkles,
  Star,
  Target,
  ThumbsUp,
  TrendingUp,
  Wand2,
  X,
} from "lucide-react";
import "./styles.css";

type SubmissionInput = {
  featureIdea: string;
  targetUser: string;
  problemStatement: string;
  existingEvidence: string;
  proposedExperiment: string;
  businessGoal: string;
  constraints: string;
  userConfidence: "" | "low" | "medium" | "high";
};

type RecommendedExperiment = {
  name: string;
  purpose: string;
  whyItFits: string;
  howToRun: string[];
  signalToLookFor: string;
};

type Critique = {
  id: string;
  submissionId: string;
  createdAt: string;
  proposedExperimentSummary?: string;
  proposedExperimentType?: string;
  productRiskType?: "value" | "usability" | "feasibility" | "viability" | "mixed";
  experimentDesignIssue?:
    | "wrong_method"
    | "vague_criteria"
    | "missing_decision"
    | "weak_evidence"
    | "premature_behavior_test"
    | "needs_calibration"
    | "none";
  primaryRiskType: "value" | "usability" | "feasibility" | "viability" | "mixed";
  riskExplanation: string;
  weakestAssumption: string;
  assumptionExplanation: string;
  experimentFit: "good" | "partial" | "poor";
  experimentFitExplanation: string;
  recommendedExperiments: RecommendedExperiment[];
  passCriteria: string[];
  failCriteria: string[];
  revisedLearningPlan: string;
  confidence: "low" | "medium" | "high";
  confidenceExplanation: string;
};

type Submission = SubmissionInput & {
  id: string;
  createdAt: string;
};

type DetailModalState = {
  eyebrow?: string;
  title: string;
  body: string;
};

type AdminRow = {
  submission?: Submission;
  critique: Critique;
  feedback?: {
    rating: number;
    didChangePlan: boolean;
    changedExperimentType: boolean;
    xrayLooksRight?: boolean;
    correctionCategory?: string;
    comments?: string;
  };
  evaluation?: {
    pmName?: string;
    initiativeName?: string;
    selfReportedChangedPlan?: boolean;
    selfReportedValue?: number;
    revisedExperiment?: string;
  };
};

type FeedbackState = {
  rating: number;
  didChangePlan: boolean;
  changedExperimentType: boolean;
  comments: string;
  xrayLooksRight?: boolean;
  correctionCategory?: string;
};

type InputMode = "paste" | "questions";

const emptySubmission: SubmissionInput = {
  featureIdea: "",
  targetUser: "",
  problemStatement: "",
  existingEvidence: "",
  proposedExperiment: "",
  businessGoal: "",
  constraints: "",
  userConfidence: "",
};

const emptyEvaluation = {
  pmName: "",
  initiativeName: "",
  baselineLearningGoal: "",
  baselineExperiment: "",
  baselineRationale: "",
  baselineSuccessCriteria: "",
  baselineStopCriteria: "",
  revisedLearningGoal: "",
  revisedExperiment: "",
  revisedRationale: "",
  revisedSuccessCriteria: "",
  revisedStopCriteria: "",
  selfReportedChangedPlan: false,
  selfReportedValue: 3,
};

const scanSteps = [
  {
    label: "Preparing your plan",
    detail: "Packaging the idea, user, problem, evidence, and proposed experiment for review.",
  },
  {
    label: "Finding the proposed test",
    detail: "Reading the actual experiment you proposed before judging whether it fits.",
  },
  {
    label: "Diagnosing risk",
    detail: "Separating value, usability, feasibility, viability, and experiment-design issues.",
  },
  {
    label: "Checking experiment fit",
    detail: "Looking for mismatches, vague criteria, missing decisions, or weak evidence.",
  },
  {
    label: "Choosing the next test",
    detail: "Selecting the smallest stronger experiment that should answer the riskiest question.",
  },
  {
    label: "Tightening signals",
    detail: "Turning pass/fail criteria into observable evidence with thresholds and consequences.",
  },
  {
    label: "Formatting the X-Ray",
    detail: "Compressing the critique into readable sections instead of one giant AI note.",
  },
];

function App() {
  const [mode, setMode] = useState<"critique" | "study" | "admin">("critique");
  const [inputMode, setInputMode] = useState<InputMode>("paste");
  const [pasteContent, setPasteContent] = useState("");
  const [form, setForm] = useState<SubmissionInput>(emptySubmission);
  const [evaluation, setEvaluation] = useState(emptyEvaluation);
  const [critique, setCritique] = useState<Critique | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>({ rating: 4, didChangePlan: false, changedExperimentType: false, comments: "" });
  const [correctionMode, setCorrectionMode] = useState(false);
  const [adminRows, setAdminRows] = useState<AdminRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});

  const canSubmit = useMemo(
    () => requiredFields.every((field) => form[field].trim().length > 0),
    [form],
  );

  useEffect(() => {
    if (mode === "admin") void loadAdmin();
  }, [mode]);

  useEffect(() => {
    const saved = localStorage.getItem("xrayDraft");
    if (!saved) return;
    try {
      const draft = JSON.parse(saved) as {
        form?: SubmissionInput;
        pasteContent?: string;
        inputMode?: InputMode;
      };
      if (draft.form) setForm({ ...emptySubmission, ...draft.form });
      if (draft.pasteContent) setPasteContent(draft.pasteContent);
      if (draft.inputMode) setInputMode(draft.inputMode);
    } catch {
      localStorage.removeItem("xrayDraft");
    }
  }, []);

  async function requestCritique(nextForm = form) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/critique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextForm),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Critique failed.");
      setSubmission(payload.submission);
      setCritique(payload.critique);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Critique failed.");
    } finally {
      setLoading(false);
    }
  }

  async function requestEvaluationCritique() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...evaluation, submission: form }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Evaluation failed.");
      setSubmission(payload.submission);
      setCritique(payload.critique);
      setEvaluation((previous) => ({
        ...previous,
        revisedLearningGoal: previous.revisedLearningGoal || previous.baselineLearningGoal,
        revisedExperiment: previous.revisedExperiment || payload.critique.recommendedExperiments?.[0]?.name || "",
        revisedRationale: previous.revisedRationale || payload.critique.experimentFitExplanation,
        revisedSuccessCriteria: previous.revisedSuccessCriteria || payload.critique.passCriteria.join("\n"),
        revisedStopCriteria: previous.revisedStopCriteria || payload.critique.failCriteria.join("\n"),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Evaluation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function saveFeedback(nextFeedback = feedback) {
    if (!critique) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ critiqueId: critique.id, ...nextFeedback }),
    });
    await loadAdmin();
  }

  async function loadAdmin() {
    const response = await fetch("/api/admin");
    const payload = await response.json();
    setAdminRows(payload.rows ?? []);
    setMetrics(payload.metrics ?? {});
  }

  function reset() {
    setForm(emptySubmission);
    setPasteContent("");
    setInputMode("paste");
    setCritique(null);
    setSubmission(null);
    setError("");
    setCorrectionMode(false);
  }

  function saveDraft() {
    localStorage.setItem("xrayDraft", JSON.stringify({ form, pasteContent, inputMode }));
  }

  function submitQuickCritique() {
    if (inputMode === "paste") {
      const nextForm = submissionFromPaste(pasteContent);
      setForm(nextForm);
      void requestCritique(nextForm);
      return;
    }
    void requestCritique();
  }

  const isIntake = mode === "critique" && !critique;

  return (
    <main className={isIntake ? "critic-shell intake-shell" : "critic-shell"}>
      <aside className="critic-rail">
        <div className="brand">
          <div className="mark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>Experiment X-Ray</strong>
            <span>Internal V0</span>
          </div>
        </div>
        <nav className="mode-nav">
          <button className={mode === "critique" ? "active" : ""} onClick={() => setMode("critique")}>
            New critique
          </button>
          <button className={mode === "study" ? "active" : ""} onClick={() => setMode("study")}>
            Before / after study
          </button>
          <button className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>
            Admin review
          </button>
        </nav>
        <p className="rail-note">Paste messy PM thinking. Get an X-Ray before the wrong test becomes momentum.</p>
      </aside>

      <section className="critic-main">
        {mode !== "admin" && !(mode === "critique" && !critique) && (
          <header className="critic-header">
            <p className="eyebrow">{mode === "study" ? "Evaluation mode" : "Experiment X-Ray"}</p>
            <h1>{mode === "study" ? "Measure before and after improvement." : "X-Ray your experiment plan."}</h1>
            <p>
              We diagnose the primary risk, weakest assumption, experiment fit, better next test, and pass/fail signal.
            </p>
          </header>
        )}

        {error && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            {error}
          </div>
        )}

        {mode === "critique" && !critique && (
          <IntakePage
            form={form}
            setForm={setForm}
            inputMode={inputMode}
            setInputMode={setInputMode}
            pasteContent={pasteContent}
            setPasteContent={setPasteContent}
            canSubmit={inputMode === "paste" ? pasteContent.trim().length >= 20 : canSubmit}
            loading={loading}
            onSubmit={submitQuickCritique}
            onSaveDraft={saveDraft}
          />
        )}

        {mode === "critique" && critique && (
          <div className="report-actions">
            <button className="secondary" onClick={reset}>
              <RefreshCcw size={16} />
              Start another X-Ray
            </button>
          </div>
        )}

        {mode === "study" && (
          <div className="study-layout">
            <section className="panel">
              <h2>Baseline plan</h2>
              <Input label="PM name" value={evaluation.pmName} onChange={(value) => setEvaluation({ ...evaluation, pmName: value })} />
              <Input label="Initiative name" value={evaluation.initiativeName} onChange={(value) => setEvaluation({ ...evaluation, initiativeName: value })} />
              <Textarea label="What are you trying to learn?" value={evaluation.baselineLearningGoal} onChange={(value) => setEvaluation({ ...evaluation, baselineLearningGoal: value })} />
              <Textarea label="What experiment would you normally run?" value={evaluation.baselineExperiment} onChange={(value) => setEvaluation({ ...evaluation, baselineExperiment: value })} />
              <Textarea label="Why that experiment?" value={evaluation.baselineRationale} onChange={(value) => setEvaluation({ ...evaluation, baselineRationale: value })} />
              <Textarea label="What would count as success?" value={evaluation.baselineSuccessCriteria} onChange={(value) => setEvaluation({ ...evaluation, baselineSuccessCriteria: value })} />
              <Textarea label="What would make you stop or change direction?" value={evaluation.baselineStopCriteria} onChange={(value) => setEvaluation({ ...evaluation, baselineStopCriteria: value })} />
            </section>
            <section className="panel">
              <h2>Critic inputs</h2>
              <CritiqueForm form={form} setForm={setForm} compact />
              <button className="primary wide" disabled={!canSubmit || loading} onClick={requestEvaluationCritique}>
                <Send size={16} />
                {loading ? "Critiquing..." : "Run critique"}
              </button>
              {loading && <ScanProgress />}
            </section>
            <section className="panel">
              <h2>Revised plan</h2>
              <Textarea label="Revised learning goal" value={evaluation.revisedLearningGoal} onChange={(value) => setEvaluation({ ...evaluation, revisedLearningGoal: value })} />
              <Textarea label="Revised experiment" value={evaluation.revisedExperiment} onChange={(value) => setEvaluation({ ...evaluation, revisedExperiment: value })} />
              <Textarea label="Revised rationale" value={evaluation.revisedRationale} onChange={(value) => setEvaluation({ ...evaluation, revisedRationale: value })} />
              <Textarea label="Revised success criteria" value={evaluation.revisedSuccessCriteria} onChange={(value) => setEvaluation({ ...evaluation, revisedSuccessCriteria: value })} />
              <Textarea label="Revised stop criteria" value={evaluation.revisedStopCriteria} onChange={(value) => setEvaluation({ ...evaluation, revisedStopCriteria: value })} />
            </section>
          </div>
        )}

        {critique && mode !== "admin" && (
          <XrayReport
            critique={critique}
            submission={submission}
            feedback={feedback}
            setFeedback={setFeedback}
            correctionMode={correctionMode}
            setCorrectionMode={setCorrectionMode}
            saveFeedback={saveFeedback}
          />
        )}

        {mode === "admin" && <Admin rows={adminRows} metrics={metrics} refresh={loadAdmin} />}
      </section>
    </main>
  );
}

const requiredFields: Array<keyof SubmissionInput> = [
  "featureIdea",
  "targetUser",
  "problemStatement",
  "existingEvidence",
  "proposedExperiment",
];

function submissionFromPaste(content: string): SubmissionInput {
  const trimmed = content.trim();
  return {
    ...emptySubmission,
    featureIdea: trimmed,
    targetUser: "Not specified in pasted plan",
    problemStatement: trimmed,
    existingEvidence: "Not specified in pasted plan",
    proposedExperiment: trimmed,
  };
}

function IntakePage({
  form,
  setForm,
  inputMode,
  setInputMode,
  pasteContent,
  setPasteContent,
  canSubmit,
  loading,
  onSubmit,
  onSaveDraft,
}: {
  form: SubmissionInput;
  setForm: (form: SubmissionInput) => void;
  inputMode: InputMode;
  setInputMode: (mode: InputMode) => void;
  pasteContent: string;
  setPasteContent: (value: string) => void;
  canSubmit: boolean;
  loading: boolean;
  onSubmit: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <section className="xray-input-page">
      <div className="xray-topbar">
        <div className="xray-logo">
          <div className="xray-logo-mark">
            <Sparkles size={20} />
          </div>
          <strong>Experiment X-Ray</strong>
        </div>
        <button className="secondary save-draft" onClick={onSaveDraft}>
          <Bookmark size={16} />
          Save draft
        </button>
      </div>

      <header className="input-hero">
        <h1>Run your plan through an X-ray</h1>
        <p>Paste what you have or answer 5 quick questions to see whether your experiment de-risks the right thing.</p>
      </header>

      <section className="input-card">
        <div className="input-card-head">
          <span className="step-dot">1</span>
          <div>
            <h2>Start here</h2>
            <p>Describe your plan to get your X-ray.</p>
          </div>
        </div>

        <div className="segmented-control" role="tablist" aria-label="Input mode">
          <button className={inputMode === "paste" ? "active" : ""} onClick={() => setInputMode("paste")}>
            <ClipboardPaste size={16} />
            Paste content
          </button>
          <button className={inputMode === "questions" ? "active" : ""} onClick={() => setInputMode("questions")}>
            <ListChecks size={16} />
            Answer 5 questions
          </button>
        </div>

        {inputMode === "paste" ? (
          <>
            <label className={pasteContent.trim() ? "paste-zone has-content" : "paste-zone"}>
              <span className="paste-icon">
                <FileText size={28} />
              </span>
              <strong>Paste a PRD, Jira ticket, idea doc, or experiment plan</strong>
              <small>Command + V to paste</small>
              <textarea
                aria-label="Paste plan content"
                value={pasteContent}
                onChange={(event) => setPasteContent(event.target.value)}
                placeholder=""
              />
            </label>
            <p className="examples">Examples: PRD, Jira ticket, Notion doc, experiment brief, idea doc</p>
            <button className="switch-link" onClick={() => setInputMode("questions")}>
              Not sure where to start? Switch to 5 questions <ArrowRight size={15} />
            </button>
          </>
        ) : (
          <div className="question-stack">
            <CritiqueForm form={form} setForm={setForm} compact />
          </div>
        )}

        <button className="primary wide xray-submit" disabled={!canSubmit || loading} onClick={onSubmit}>
          {loading ? "Building your X-Ray" : "Get my X-ray"}
          <ArrowRight size={18} />
        </button>
        {loading && <ScanProgress />}
      </section>

      <div className="feature-strip">
        <FeatureTile
          icon={<Target size={20} />}
          title="Identify the risk"
          text="See if you're solving the right problem for the right users."
        />
        <FeatureTile
          icon={<HelpCircle size={20} />}
          title="Spot the weakest assumption"
          text="Understand what could fail and why it matters most."
        />
        <FeatureTile
          icon={<TrendingUp size={20} />}
          title="Get a better next test"
          text="Receive a clear next experiment to de-risk with confidence."
        />
      </div>
    </section>
  );
}

function FeatureTile({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="feature-tile">
      <span>{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

function ScanProgress({ compact = false }: { compact?: boolean }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 600);
    return () => window.clearInterval(interval);
  }, []);

  const stepIndex = Math.min(scanSteps.length - 1, Math.floor(elapsedSeconds / 3));
  const step = scanSteps[stepIndex];
  const progress = Math.min(94, 10 + stepIndex * 13 + Math.min(10, (elapsedSeconds % 3) * 3));
  const visibleSteps = scanSteps.slice(Math.max(0, stepIndex - 1), Math.min(scanSteps.length, stepIndex + 2));

  return (
    <div className={compact ? "scan-progress compact" : "scan-progress"} aria-live="polite">
      <div className="scan-progress-head">
        <span>{step.label}</span>
        <em>{elapsedSeconds < 3 ? "Starting" : `${elapsedSeconds}s`}</em>
      </div>
      <div className="scan-track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <p>{step.detail}</p>
      {!compact && (
        <div className="scan-step-list">
          {visibleSteps.map((item) => (
            <span className={item.label === step.label ? "active" : ""} key={item.label}>
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CritiqueForm({
  form,
  setForm,
  compact = false,
}: {
  form: SubmissionInput;
  setForm: (form: SubmissionInput) => void;
  compact?: boolean;
}) {
  const update = (key: keyof SubmissionInput, value: string) => setForm({ ...form, [key]: value });
  return (
    <section className="panel">
      <h2>{compact ? "Plan to critique" : "New critique"}</h2>
      <Textarea label="Feature / solution idea" required value={form.featureIdea} onChange={(value) => update("featureIdea", value)} />
      <Input label="Target user" required value={form.targetUser} onChange={(value) => update("targetUser", value)} />
      <Textarea label="Problem statement" required value={form.problemStatement} onChange={(value) => update("problemStatement", value)} />
      <Textarea label="Existing evidence" required value={form.existingEvidence} onChange={(value) => update("existingEvidence", value)} />
      <Textarea label="Proposed experiment" required value={form.proposedExperiment} onChange={(value) => update("proposedExperiment", value)} />
      {!compact && (
        <>
          <Textarea label="Business goal / desired outcome" value={form.businessGoal} onChange={(value) => update("businessGoal", value)} />
          <Textarea label="Known constraints" value={form.constraints} onChange={(value) => update("constraints", value)} />
          <label className="field">
            <span>Confidence level</span>
            <select value={form.userConfidence} onChange={(event) => update("userConfidence", event.target.value)}>
              <option value="">Not sure</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </>
      )}
    </section>
  );
}

function ActionPanel({
  canSubmit,
  loading,
  onSubmit,
  onReset,
  critique,
  feedback,
  setFeedback,
  saveFeedback,
  correctionMode,
  setCorrectionMode,
}: {
  canSubmit: boolean;
  loading: boolean;
  onSubmit: () => void;
  onReset: () => void;
  critique: Critique | null;
  feedback: FeedbackState;
  setFeedback: (feedback: FeedbackState) => void;
  saveFeedback: (feedback?: FeedbackState) => void;
  correctionMode: boolean;
  setCorrectionMode: (value: boolean) => void;
}) {
  return (
    <aside className="panel sticky-panel">
      <h2>X-Ray</h2>
      <p className="muted">Required fields are the first five. Optional context improves confidence but should not slow you down.</p>
      <button className="primary wide" disabled={!canSubmit || loading} onClick={onSubmit}>
        <Send size={16} />
        {loading ? "Building your X-Ray" : "Generate X-Ray"}
      </button>
      {loading && <ScanProgress compact />}
      <button className="secondary wide" onClick={onReset}>
        <RefreshCcw size={16} />
        Start another critique
      </button>

      {critique && (
        <div className="feedback-box">
          <h3>Does this X-Ray look right?</h3>
          <button
            className="secondary wide"
            onClick={() => {
              const nextFeedback = {
                ...feedback,
                xrayLooksRight: true,
                didChangePlan: true,
                comments: feedback.comments || "X-Ray looked right.",
              };
              setFeedback(nextFeedback);
              void saveFeedback(nextFeedback);
            }}
          >
            <ThumbsUp size={16} />
            Yes, create learning plan
          </button>
          <button className={correctionMode ? "primary wide" : "secondary wide"} onClick={() => setCorrectionMode(!correctionMode)}>
            <Wand2 size={16} />
            Needs correction
          </button>
        </div>
      )}
    </aside>
  );
}

function XrayReport({
  critique,
  submission,
  feedback,
  setFeedback,
  correctionMode,
  setCorrectionMode,
  saveFeedback,
}: {
  critique: Critique;
  submission: Submission | null;
  feedback: FeedbackState;
  setFeedback: (feedback: FeedbackState) => void;
  correctionMode: boolean;
  setCorrectionMode: (value: boolean) => void;
  saveFeedback: (feedback?: FeedbackState) => void;
}) {
  const primaryExperiment = critique.recommendedExperiments[0];
  const planLines = compactPlanLines(critique.revisedLearningPlan);
  const riskType = critique.productRiskType ?? critique.primaryRiskType;
  const designIssue = formatDesignIssue(critique.experimentDesignIssue);
  const [detailModal, setDetailModal] = useState<DetailModalState | null>(null);
  const openDetail = (detail: DetailModalState) => setDetailModal(detail);

  return (
    <section className="xray-report">
      <div className="xray-hero">
        <div>
          <p className="eyebrow">X-Ray Report <span className="beta">Beta</span></p>
          <h2>Here’s your X-Ray</h2>
          <p>We analyzed your plan. Does this look right?</p>
        </div>
        <button className="secondary" onClick={() => navigator.clipboard?.writeText(critique.revisedLearningPlan)}>
          <Clipboard size={16} />
          Copy learning plan
        </button>
      </div>

      <div className="xray-summary">
        <SummaryCell
          icon={<AlertTriangle size={24} />}
          label="Product risk"
          title={`${riskType} risk`}
          tone="risk"
          fullText={critique.riskExplanation}
          max={150}
          onOpen={() => openDetail({ eyebrow: "Product risk", title: `${riskType} risk`, body: critique.riskExplanation })}
        >
          {riskType === "value" ? "Will users find enough value to change behavior?" : plainPreview(critique.riskExplanation, 150)}
        </SummaryCell>
        <SummaryCell
          icon={<FileText size={24} />}
          label="Parsed proposed test"
          title={critique.proposedExperimentType || summarizeTest(submission?.proposedExperiment)}
          tone="test"
          fullText={critique.proposedExperimentSummary || submission?.proposedExperiment || "No proposed experiment captured."}
          max={140}
          onOpen={() =>
            openDetail({
              eyebrow: "Parsed proposed test",
              title: critique.proposedExperimentType || summarizeTest(submission?.proposedExperiment),
              body: critique.proposedExperimentSummary || submission?.proposedExperiment || "No proposed experiment captured.",
            })
          }
        >
          {plainPreview(critique.proposedExperimentSummary || submission?.proposedExperiment || "No proposed experiment captured.", 140)}
        </SummaryCell>
        <SummaryCell
          icon={<Star size={24} />}
          label={designIssue ? "Design issue" : "Experiment fit"}
          title={designIssue || `${critique.experimentFit} fit`}
          tone={critique.experimentFit}
          fullText={critique.experimentFitExplanation}
          max={150}
          onOpen={() =>
            openDetail({
              eyebrow: designIssue ? "Design issue" : "Experiment fit",
              title: designIssue || `${critique.experimentFit} fit`,
              body: critique.experimentFitExplanation,
            })
          }
        >
          {plainPreview(critique.experimentFitExplanation, 150)}
        </SummaryCell>
      </div>

      <section className="diagnosis-panel">
        <div className="diagnosis-head">
          <h2>Our diagnosis</h2>
          <span>Confidence: {critique.confidence}</span>
        </div>
        <div className="diagnosis-grid">
          <div>
            <p className="eyebrow">Weakest assumption</p>
            <strong>{plainPreview(critique.weakestAssumption, 180)}</strong>
            <DetailButton text={critique.weakestAssumption} max={180} onClick={() => openDetail({ eyebrow: "Weakest assumption", title: "Weakest assumption", body: critique.weakestAssumption })} />
          </div>
          <div>
            <p className="eyebrow">Why this is risky</p>
            <p>{plainPreview(critique.assumptionExplanation, 220)}</p>
            <DetailButton text={critique.assumptionExplanation} max={220} onClick={() => openDetail({ eyebrow: "Why this is risky", title: "Assumption rationale", body: critique.assumptionExplanation })} />
          </div>
          <div className="next-experiment">
            <p className="eyebrow">Recommended next experiment</p>
            <h3>{primaryExperiment?.name || "No recommendation"}</h3>
            <p>{plainPreview(primaryExperiment?.whyItFits || critique.riskExplanation, 180)}</p>
            <DetailButton
              text={primaryExperiment?.whyItFits || critique.riskExplanation}
              max={180}
              onClick={() =>
                openDetail({
                  eyebrow: "Recommended next experiment",
                  title: primaryExperiment?.name || "No recommendation",
                  body: primaryExperiment?.whyItFits || critique.riskExplanation,
                })
              }
            />
          </div>
          <div className="signal-row">
            <p className="eyebrow">Pass / fail signal</p>
            <div className="signal-grid">
              <div className="signal pass">
                <Check size={18} />
                <span>
                  <strong>Pass</strong>
                  {plainPreview(critique.passCriteria[0], 180)}
                  <DetailButton
                    text={critique.passCriteria.join("\n")}
                    previewText={critique.passCriteria[0]}
                    max={180}
                    onClick={() =>
                      openDetail({
                        eyebrow: "Pass criteria",
                        title: "What would mean continue",
                        body: critique.passCriteria.length ? critique.passCriteria.join("\n") : "No pass criteria generated.",
                      })
                    }
                  />
                </span>
              </div>
              <div className="signal fail">
                <AlertTriangle size={18} />
                <span>
                  <strong>Fail</strong>
                  {plainPreview(critique.failCriteria[0], 180)}
                  <DetailButton
                    text={critique.failCriteria.join("\n")}
                    previewText={critique.failCriteria[0]}
                    max={180}
                    onClick={() =>
                      openDetail({
                        eyebrow: "Fail criteria",
                        title: "What would mean stop or change",
                        body: critique.failCriteria.length ? critique.failCriteria.join("\n") : "No fail criteria generated.",
                      })
                    }
                  />
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {primaryExperiment && (
        <section className="action-plan-panel">
          <div>
            <p className="eyebrow">What to run next</p>
            <h2>{primaryExperiment.name}</h2>
            <p>{plainPreview(primaryExperiment.purpose, 180)}</p>
            <DetailButton text={primaryExperiment.purpose} max={180} onClick={() => openDetail({ eyebrow: "What to run next", title: primaryExperiment.name, body: primaryExperiment.purpose })} />
          </div>
          <div className="compact-steps">
            {primaryExperiment.howToRun.slice(0, 3).map((step, index) => (
              <div className="compact-step" key={`${step}-${index}`}>
                <span>{index + 1}</span>
                <p>{plainPreview(step, 140)}</p>
                <DetailButton text={step} max={140} onClick={() => openDetail({ eyebrow: `Step ${index + 1}`, title: "How to run it", body: step })} />
              </div>
            ))}
          </div>
          <div className="signal-note">
            <strong>Signal to watch</strong>
            <p>{plainPreview(primaryExperiment.signalToLookFor, 180)}</p>
            <DetailButton text={primaryExperiment.signalToLookFor} max={180} onClick={() => openDetail({ eyebrow: "Signal to watch", title: "Evidence to watch", body: primaryExperiment.signalToLookFor })} />
          </div>
        </section>
      )}

      {detailModal && <DetailModal detail={detailModal} onClose={() => setDetailModal(null)} />}

      <section className="xray-confirm">
        <h2>Does this X-Ray look right?</h2>
        <div className="confirm-actions">
          <button
            className="secondary"
            onClick={() => {
              const nextFeedback = {
                ...feedback,
                xrayLooksRight: true,
                didChangePlan: true,
                comments: feedback.comments || "X-Ray looked right.",
              };
              setFeedback(nextFeedback);
              void saveFeedback(nextFeedback);
            }}
          >
            <ThumbsUp size={18} />
            Yes, this looks right
          </button>
          <button className={correctionMode ? "primary" : "secondary"} onClick={() => setCorrectionMode(!correctionMode)}>
            <Wand2 size={18} />
            Needs correction
          </button>
        </div>
      </section>

      {correctionMode && (
        <section className="correction-panel">
          <h2>What would you like to update?</h2>
          <p className="muted">Choose the main thing that’s off.</p>
          <div className="correction-grid">
            {correctionOptions.map((option) => (
              <button
                key={option.value}
                className={feedback.correctionCategory === option.value ? "correction-card active" : "correction-card"}
                onClick={() => setFeedback({ ...feedback, xrayLooksRight: false, correctionCategory: option.value })}
              >
                <strong>{option.label}</strong>
                <span>{option.help}</span>
              </button>
            ))}
          </div>
          <Textarea
            label="Tell us what we got wrong or what we should consider."
            value={feedback.comments}
            onChange={(value) => setFeedback({ ...feedback, comments: value, xrayLooksRight: false })}
          />
          <button
            className="primary wide"
            onClick={() => {
              const nextFeedback = { ...feedback, xrayLooksRight: false };
              setFeedback(nextFeedback);
              void saveFeedback(nextFeedback);
            }}
          >
            <Wand2 size={16} />
            Save correction
          </button>
        </section>
      )}

      <section className="learning-plan-card">
        <div className="learning-plan-head">
          <div>
            <p className="eyebrow">Copyable plan</p>
            <h2>Revised learning plan</h2>
          </div>
          <button className="secondary" onClick={() => navigator.clipboard?.writeText(critique.revisedLearningPlan)}>
            <Clipboard size={16} />
            Copy full plan
          </button>
        </div>
        <div className="plan-preview">
          {planLines.map((line, index) => (
            <div className="plan-preview-item" key={`${line}-${index}`}>
              <p>{line}</p>
              <DetailButton
                text={critique.revisedLearningPlan}
                previewText={line}
                max={170}
                onClick={() =>
                  openDetail({
                    eyebrow: "Revised learning plan",
                    title: "Full learning plan",
                    body: critique.revisedLearningPlan,
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function SummaryCell({
  icon,
  label,
  title,
  tone,
  fullText,
  max = 160,
  onOpen,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  tone: string;
  fullText?: string;
  max?: number;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`summary-cell ${tone}`}>
      <div className="summary-icon">{icon}</div>
      <div>
        <p className="eyebrow">{label}</p>
        <h3>{title}</h3>
        <p>{children}</p>
        {onOpen && <DetailButton text={fullText} previewText={String(children ?? "")} max={max} onClick={onOpen} />}
      </div>
    </div>
  );
}

function DetailButton({ text, previewText, max = 160, onClick }: { text?: string; previewText?: string; max?: number; onClick: () => void }) {
  if (!shouldShowDetail(text, max, previewText)) return null;
  return (
    <button className="read-full-link" onClick={onClick} type="button">
      Read full
    </button>
  );
}

function DetailModal({ detail, onClose }: { detail: DetailModalState; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <article className="detail-modal" role="dialog" aria-modal="true" aria-label={detail.title} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} type="button" aria-label="Close detail view">
          <X size={18} />
        </button>
        {detail.eyebrow && <p className="eyebrow">{detail.eyebrow}</p>}
        <h2>{detail.title}</h2>
        <div className="modal-copy">
          {detail.body
            .split("\n")
            .map((line) => stripMarkdown(line))
            .filter(Boolean)
            .map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
        </div>
      </article>
    </div>
  );
}

const correctionOptions = [
  { value: "risk_type", label: "Risk type", help: "The main risk is wrong" },
  { value: "weakest_assumption", label: "Weakest assumption", help: "The key assumption is wrong" },
  { value: "proposed_test", label: "My proposed test", help: "You misunderstood my test" },
  { value: "missing_context", label: "Missing context", help: "Important context is missing" },
  { value: "constraints", label: "Constraints", help: "Constraints were not considered" },
  { value: "other_options", label: "Other options", help: "Show me a different approach" },
];

function summarizeTest(text?: string) {
  if (!text) return "No test captured";
  if (/usability|prototype/i.test(text)) return "Usability test";
  if (/interview/i.test(text)) return "Interview test";
  if (/fake door|opt/i.test(text)) return "Fake-door test";
  if (/survey/i.test(text)) return "Survey";
  return text.split(/[.:\n]/)[0].slice(0, 42);
}

function formatDesignIssue(issue?: Critique["experimentDesignIssue"]) {
  const labels: Record<NonNullable<Critique["experimentDesignIssue"]>, string> = {
    wrong_method: "Wrong method",
    vague_criteria: "Vague criteria",
    missing_decision: "Missing decision",
    weak_evidence: "Weak evidence",
    premature_behavior_test: "Premature behavior test",
    needs_calibration: "Needs calibration",
    none: "",
  };
  return issue ? labels[issue] : "";
}

function stripMarkdown(text = "") {
  return text
    .replace(/\|[-:\s|]+\|/g, " ")
    .replace(/[`*_>#]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function plainPreview(text = "", max = 160) {
  const stripped = stripMarkdown(text);
  if (stripped.length <= max) return stripped;
  return `${stripped.slice(0, max - 1).trim()}…`;
}

function shouldShowDetail(text = "", max = 160, previewText?: string) {
  const stripped = stripMarkdown(text);
  const preview = stripMarkdown(previewText ?? plainPreview(text, max));
  if (!stripped) return false;
  return stripped.length > max || stripped !== preview;
}

function compactPlanLines(markdown = "") {
  const lines = markdown
    .split("\n")
    .map((line) => stripMarkdown(line.replace(/^[-\d.]+\s*/, "")))
    .filter((line) => line && !line.includes("|"))
    .slice(0, 6)
    .map((line) => plainPreview(line, 170));
  return lines.length ? lines : ["No revised plan generated yet."];
}

function Admin({ rows, metrics, refresh }: { rows: AdminRow[]; metrics: Record<string, number>; refresh: () => void }) {
  return (
    <section className="admin-view">
      <header className="critic-header">
        <p className="eyebrow">Reviewer view</p>
        <h1>Admin review</h1>
        <p>Review saved critiques, feedback, before/after sessions, and export anonymized data.</p>
      </header>
      <div className="metrics-row">
        {Object.entries(metrics).map(([key, value]) => (
          <div className="metric" key={key}>
            <span>{key}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="admin-actions">
        <button className="secondary" onClick={refresh}>
          <RefreshCcw size={16} />
          Refresh
        </button>
        <a className="secondary link-button" href="/api/export">
          <Download size={16} />
          Export JSON
        </a>
      </div>
      <div className="admin-table">
        <div className="admin-row admin-head">
          <span>Date</span>
          <span>PM / initiative</span>
          <span>Primary risk</span>
          <span>Fit</span>
          <span>Proposed</span>
          <span>Recommended</span>
          <span>Changed?</span>
          <span>Rating</span>
        </div>
        {rows.map((row) => (
          <div className="admin-row" key={row.critique.id}>
            <span>{new Date(row.critique.createdAt).toLocaleDateString()}</span>
            <span>{row.evaluation?.initiativeName || row.submission?.targetUser || "Quick critique"}</span>
            <span>{row.critique.productRiskType ?? row.critique.primaryRiskType}</span>
            <span>{row.critique.experimentFit}</span>
            <span>{plainPreview(row.submission?.proposedExperiment, 120)}</span>
            <span>{plainPreview(row.critique.recommendedExperiments[0]?.name, 70)}</span>
            <span>{row.feedback?.didChangePlan || row.evaluation?.selfReportedChangedPlan ? "Yes" : "No"}</span>
            <span>{row.feedback?.rating || row.evaluation?.selfReportedValue || "-"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Card({ title, label, children }: { title: string; label?: string; children: React.ReactNode }) {
  return (
    <article className="card">
      <div className="card-title">
        <h3>{title}</h3>
        {label && <span>{label}</span>}
      </div>
      {children}
    </article>
  );
}

function Input({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <em>required</em>}
      </span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Textarea({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <em>required</em>}
      </span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
