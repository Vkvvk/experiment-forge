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
            <label className="paste-zone">
              <span className="paste-icon">
                <FileText size={28} />
              </span>
              <strong>Paste a PRD, Jira ticket, idea doc, or experiment plan</strong>
              <small>Command + V to paste</small>
              <textarea
                aria-label="Paste plan content"
                value={pasteContent}
                onChange={(event) => setPasteContent(event.target.value)}
                placeholder="Paste anything messy here. We will scan for the idea, target user, problem, evidence, and proposed test."
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
          {loading ? "Scanning..." : "Get my X-ray"}
          <ArrowRight size={18} />
        </button>
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
        {loading ? "Scanning..." : "Generate X-Ray"}
      </button>
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
        <SummaryCell icon={<AlertTriangle size={24} />} label="Primary risk" title={`${critique.primaryRiskType} risk`} tone="risk">
          {critique.primaryRiskType === "value" ? "Will users find enough value to change behavior?" : critique.riskExplanation}
        </SummaryCell>
        <SummaryCell icon={<FileText size={24} />} label="Your proposed test" title={summarizeTest(submission?.proposedExperiment)} tone="test">
          {submission?.proposedExperiment || "No proposed experiment captured."}
        </SummaryCell>
        <SummaryCell icon={<Star size={24} />} label="Experiment fit" title={`${critique.experimentFit} fit`} tone={critique.experimentFit}>
          {critique.experimentFitExplanation}
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
            <strong>{critique.weakestAssumption}</strong>
          </div>
          <div>
            <p className="eyebrow">Why this is risky</p>
            <p>{critique.assumptionExplanation}</p>
          </div>
          <div className="next-experiment">
            <p className="eyebrow">Recommended next experiment</p>
            <h3>{primaryExperiment?.name || "No recommendation"}</h3>
            <p>{primaryExperiment?.whyItFits || critique.riskExplanation}</p>
          </div>
          <div className="signal-row">
            <p className="eyebrow">Pass / fail signal</p>
            <div className="signal-grid">
              <div className="signal pass">
                <Check size={18} />
                <span>
                  <strong>Pass</strong>
                  {critique.passCriteria[0]}
                </span>
              </div>
              <div className="signal fail">
                <AlertTriangle size={18} />
                <span>
                  <strong>Fail</strong>
                  {critique.failCriteria[0]}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

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

      <section className="panel">
        <h2>Revised learning plan</h2>
        <pre>{critique.revisedLearningPlan}</pre>
      </section>
    </section>
  );
}

function SummaryCell({
  icon,
  label,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`summary-cell ${tone}`}>
      <div className="summary-icon">{icon}</div>
      <div>
        <p className="eyebrow">{label}</p>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
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
            <span>{row.critique.primaryRiskType}</span>
            <span>{row.critique.experimentFit}</span>
            <span>{row.submission?.proposedExperiment}</span>
            <span>{row.critique.recommendedExperiments[0]?.name}</span>
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
