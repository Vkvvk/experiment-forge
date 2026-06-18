import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const app = express();
const port = Number(process.env.PORT ?? 5173);
const host = process.env.HOST ?? "0.0.0.0";
const model = process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash";
const dataDir = path.resolve("data");
const dbPath = path.join(dataDir, "db.json");
const distDir = path.resolve("dist");

app.use(express.json({ limit: "1mb" }));

const submissionSchema = z.object({
  featureIdea: z.string().min(1),
  targetUser: z.string().min(1),
  problemStatement: z.string().min(1),
  existingEvidence: z.string().min(1),
  proposedExperiment: z.string().min(1),
  businessGoal: z.string().optional().default(""),
  constraints: z.string().optional().default(""),
  userConfidence: z.enum(["low", "medium", "high", ""]).optional().default(""),
});

const feedbackSchema = z.object({
  critiqueId: z.string(),
  rating: z.number().min(1).max(5),
  didChangePlan: z.boolean(),
  changedExperimentType: z.boolean().optional().default(false),
  xrayLooksRight: z.boolean().optional(),
  correctionCategory: z.string().optional().default(""),
  comments: z.string().optional().default(""),
});

const evaluationSchema = z.object({
  pmName: z.string().optional().default(""),
  initiativeName: z.string().optional().default(""),
  baselineLearningGoal: z.string(),
  baselineExperiment: z.string(),
  baselineRationale: z.string(),
  baselineSuccessCriteria: z.string(),
  baselineStopCriteria: z.string(),
  submission: submissionSchema,
  revisedLearningGoal: z.string().optional().default(""),
  revisedExperiment: z.string().optional().default(""),
  revisedRationale: z.string().optional().default(""),
  revisedSuccessCriteria: z.string().optional().default(""),
  revisedStopCriteria: z.string().optional().default(""),
  selfReportedChangedPlan: z.boolean().optional().default(false),
  selfReportedValue: z.number().min(1).max(5).optional(),
});

const critiqueJsonSchema = {
  name: "experiment_plan_critique",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "proposedExperimentSummary",
      "proposedExperimentType",
      "productRiskType",
      "experimentDesignIssue",
      "primaryRiskType",
      "riskExplanation",
      "weakestAssumption",
      "assumptionExplanation",
      "experimentFit",
      "experimentFitExplanation",
      "recommendedExperiments",
      "passCriteria",
      "failCriteria",
      "revisedLearningPlan",
      "confidence",
      "confidenceExplanation",
    ],
    properties: {
      proposedExperimentSummary: { type: "string" },
      proposedExperimentType: { type: "string" },
      productRiskType: { type: "string", enum: ["value", "usability", "feasibility", "viability", "mixed"] },
      experimentDesignIssue: {
        type: "string",
        enum: ["wrong_method", "vague_criteria", "missing_decision", "weak_evidence", "premature_behavior_test", "needs_calibration", "none"],
      },
      primaryRiskType: { type: "string", enum: ["value", "usability", "feasibility", "viability", "mixed"] },
      riskExplanation: { type: "string" },
      weakestAssumption: { type: "string" },
      assumptionExplanation: { type: "string" },
      experimentFit: { type: "string", enum: ["good", "partial", "poor"] },
      experimentFitExplanation: { type: "string" },
      recommendedExperiments: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "purpose", "whyItFits", "howToRun", "signalToLookFor"],
          properties: {
            name: { type: "string" },
            purpose: { type: "string" },
            whyItFits: { type: "string" },
            howToRun: { type: "array", items: { type: "string" } },
            signalToLookFor: { type: "string" },
          },
        },
      },
      passCriteria: { type: "array", items: { type: "string" } },
      failCriteria: { type: "array", items: { type: "string" } },
      revisedLearningPlan: { type: "string" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      confidenceExplanation: { type: "string" },
    },
  },
};

app.post("/api/critique", async (req, res) => {
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Complete the five required fields before requesting a critique." });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: "OPENROUTER_API_KEY is missing in .env.local." });
  }

  try {
    const critique = await generateCritique(parsed.data);
    const db = readDb();
    const submission = { id: id(), createdAt: now(), ...parsed.data };
    const savedCritique = { id: id(), submissionId: submission.id, createdAt: now(), ...critique };
    db.submissions.unshift(submission);
    db.critiques.unshift(savedCritique);
    writeDb(db);
    res.json({ submission, critique: savedCritique });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Critique generation failed." });
  }
});

app.post("/api/feedback", (req, res) => {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid feedback." });
  const db = readDb();
  const feedback = { id: id(), createdAt: now(), ...parsed.data };
  db.feedback.unshift(feedback);
  writeDb(db);
  res.json({ feedback });
});

app.post("/api/evaluation", async (req, res) => {
  const parsed = evaluationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Complete the baseline and critique inputs first." });
  if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: "OPENROUTER_API_KEY is missing in .env.local." });

  try {
    const critique = await generateCritique(parsed.data.submission, parsed.data);
    const db = readDb();
    const submission = { id: id(), createdAt: now(), ...parsed.data.submission };
    const savedCritique = { id: id(), submissionId: submission.id, createdAt: now(), ...critique };
    const session = {
      id: id(),
      createdAt: now(),
      ...parsed.data,
      submissionId: submission.id,
      critiqueId: savedCritique.id,
    };
    delete session.submission;
    db.submissions.unshift(submission);
    db.critiques.unshift(savedCritique);
    db.evaluationSessions.unshift(session);
    writeDb(db);
    res.json({ session, submission, critique: savedCritique });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Evaluation critique failed." });
  }
});

app.get("/api/admin", (_req, res) => {
  const db = readDb();
  const rows = db.critiques.map((critique) => {
    const submission = db.submissions.find((item) => item.id === critique.submissionId);
    const feedback = db.feedback.find((item) => item.critiqueId === critique.id);
    const evaluation = db.evaluationSessions.find((item) => item.critiqueId === critique.id);
    return { critique, submission, feedback, evaluation };
  });
  res.json({ rows, metrics: metrics(db) });
});

app.get("/api/export", (_req, res) => {
  const db = readDb();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", "attachment; filename=experiment-plan-critic-export.json");
  res.send(JSON.stringify(db, null, 2));
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      return res.sendFile(path.join(distDir, "index.html"));
    }
    next();
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true, host },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, host, () => {
  console.log(`Experiment X-Ray running at http://${host}:${port}/`);
});

async function generateCritique(submission, evaluationContext) {
  const userPrompt = `Analyze this product experiment plan.

Feature / solution idea:
${submission.featureIdea}

Target user:
${submission.targetUser}

Problem statement:
${submission.problemStatement}

Existing evidence:
${submission.existingEvidence}

Proposed experiment:
${submission.proposedExperiment}

Business goal:
${submission.businessGoal || "Not provided"}

Known constraints:
${submission.constraints || "Not provided"}

User confidence:
${submission.userConfidence || "Not provided"}

${evaluationContext ? `Baseline learning goal: ${evaluationContext.baselineLearningGoal}
Baseline experiment: ${evaluationContext.baselineExperiment}
Baseline rationale: ${evaluationContext.baselineRationale}
Baseline success criteria: ${evaluationContext.baselineSuccessCriteria}
Baseline stop/change criteria: ${evaluationContext.baselineStopCriteria}` : ""}

Return structured JSON with:
- proposedExperimentSummary: one sentence based only on the Proposed experiment field
- proposedExperimentType: short label based only on the Proposed experiment field
- productRiskType
- experimentDesignIssue
- primaryRiskType: same as productRiskType unless mixed is more accurate
- riskExplanation: one sentence
- weakestAssumption
- assumptionExplanation: one sentence
- experimentFit: good, partial, or poor
- experimentFitExplanation: one sentence
- recommendedExperiments: up to 3
- passCriteria: max 3 bullets for the top recommended experiment only
- failCriteria: max 3 bullets for the top recommended experiment only
- revisedLearningPlan: max 120 words, no markdown table
- confidence and confidenceExplanation`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  const completion = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://127.0.0.1:5173",
      "X-Title": "Experiment X-Ray Local Prototype",
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_schema", json_schema: critiqueJsonSchema },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt },
      ],
    }),
  }).finally(() => clearTimeout(timeout));

  const data = await completion.json();
  if (!completion.ok) throw new Error(data?.error?.message ?? "OpenRouter request failed.");
  const content = data?.choices?.[0]?.message?.content;
  const critique = typeof content === "string" ? JSON.parse(content) : content;
  return sanitizeCritique(critique);
}

function systemPrompt() {
  return `You are an expert product discovery coach. Your job is to critique experiment plans before teams commit build, recruiting, or calendar time.

Follow this sequence silently:
1. Parse what experiment the PM is actually proposing.
2. Identify the unresolved product or experiment-design risk.
3. Decide whether the proposed experiment answers that risk.
4. Recommend the smallest stronger next experiment.
5. Output concise, UI-ready language.

Risk definitions:
- value risk: whether users care enough to choose/use/buy/change behavior
- usability risk: whether users can understand/use the solution
- feasibility risk: whether the team can build or operate it
- viability risk: whether it works for the business/legal/operations model

Important:
- Do not keyword-match. If the input mentions usability as an anti-pattern, do not assume the proposed experiment is a usability test.
- Base proposedExperimentType and proposedExperimentSummary only on the Proposed experiment field.
- Quote or summarize the actual proposed experiment before judging fit.
- If the product being tested is an AI critic, scorer, rubric, evaluator, or coach, check calibration/accuracy before recommending a PM behavior-change test.
- If the product being tested is an AI critic, scorer, rubric, evaluator, or coach and no calibration evidence is provided, set experimentDesignIssue to needs_calibration and experimentFit to partial unless the proposed experiment is calibration itself.
- If the proposed experiment is directionally right but says "see what happens", lacks a numeric threshold, lacks an observable behavior, or lacks a decision consequence, set experimentDesignIssue to vague_criteria, not wrong_method.
- If the proposed experiment adds a button, link, request access CTA, opt-in, waitlist, or workflow entry point to measure demand before building, classify proposedExperimentType as a fake-door test.
- If a fake-door test is aimed at value/demand risk but lacks thresholds or decision consequences, set experimentFit to partial, not poor, unless the signal is purely opinions or satisfaction.
- Prefer decision-quality evidence over satisfaction, opinions, usage vanity metrics, or UI feedback.
- Pass/fail criteria must belong to the top recommended experiment only; do not mix criteria from multiple experiment types.
- For value/demand tests, pass/fail criteria must be observable behaviors with numbers and decision consequences; do not use qualitative feedback, satisfaction, preference, or usability as pass/fail criteria.
- Pass/fail criteria must be evidence thresholds only, not next actions. Do not write "if pass, then..." or "if fail, interview..." inside criteria.
- Fail criteria should usually be the inverse of pass criteria using the same observable metric.
- Do not write conditional criteria for alternate methods. If the top recommendation is a fake-door test, criteria must only measure fake-door behaviors such as click, opt-in, request access, signup, or follow-through.
- Do not recommend usability testing as a pass/fail criterion for value, demand, or calibration tests.
- Strongly flag usability testing when it is actually proposed for unresolved value/desirability risk.
- Be direct, practical, concise, and critical without being rude.
- Do not recommend more than 3 experiments.
- Always pick one weakest assumption.
- Always provide clear pass/fail criteria.
- Do not echo the user's pasted plan.
- Do not use markdown tables.
- Keep each explanation under 35 words.
- Keep revisedLearningPlan under 120 words.`;
}

function sanitizeCritique(input) {
  const productRiskType = normalizeRiskType(input?.productRiskType ?? input?.primaryRiskType);
  return {
    proposedExperimentSummary: limitText(input?.proposedExperimentSummary ?? "", 220),
    proposedExperimentType: limitText(input?.proposedExperimentType ?? "", 80),
    productRiskType,
    experimentDesignIssue: normalizeExperimentDesignIssue(input?.experimentDesignIssue),
    primaryRiskType: normalizeRiskType(input?.primaryRiskType ?? productRiskType),
    riskExplanation: limitText(input?.riskExplanation ?? "", 280),
    weakestAssumption: limitText(input?.weakestAssumption ?? "", 260),
    assumptionExplanation: limitText(input?.assumptionExplanation ?? "", 320),
    experimentFit: input?.experimentFit ?? "partial",
    experimentFitExplanation: limitText(input?.experimentFitExplanation ?? "", 320),
    recommendedExperiments: Array.isArray(input?.recommendedExperiments) ? input.recommendedExperiments.slice(0, 3).map(compactExperiment) : [],
    passCriteria: Array.isArray(input?.passCriteria) ? input.passCriteria.slice(0, 3).map((item) => limitText(item, 220)) : [],
    failCriteria: Array.isArray(input?.failCriteria) ? input.failCriteria.slice(0, 3).map((item) => limitText(item, 220)) : [],
    revisedLearningPlan: limitText(input?.revisedLearningPlan ?? "", 900),
    confidence: input?.confidence ?? "medium",
    confidenceExplanation: limitText(input?.confidenceExplanation ?? "", 260),
  };
}

function normalizeRiskType(value) {
  return ["value", "usability", "feasibility", "viability", "mixed"].includes(value) ? value : "mixed";
}

function normalizeExperimentDesignIssue(value) {
  return [
    "wrong_method",
    "vague_criteria",
    "missing_decision",
    "weak_evidence",
    "premature_behavior_test",
    "needs_calibration",
    "none",
  ].includes(value)
    ? value
    : "none";
}

function compactExperiment(experiment) {
  return {
    name: limitText(experiment?.name ?? "", 70),
    purpose: limitText(experiment?.purpose ?? "", 220),
    whyItFits: limitText(experiment?.whyItFits ?? "", 220),
    howToRun: Array.isArray(experiment?.howToRun) ? experiment.howToRun.slice(0, 3).map((step) => limitText(step, 180)) : [],
    signalToLookFor: limitText(experiment?.signalToLookFor ?? "", 220),
  };
}

function limitText(value, max) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function readDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    return { submissions: [], critiques: [], feedback: [], evaluationSessions: [] };
  }
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function metrics(db) {
  const totalSessions = db.evaluationSessions.length;
  const feedback = db.feedback;
  const changed = feedback.filter((item) => item.didChangePlan).length;
  const changedType = feedback.filter((item) => item.changedExperimentType).length;
  const averageUsefulnessRating = feedback.length
    ? Number((feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(2))
    : 0;
  return {
    totalSessions,
    usableInputRate: db.submissions.length ? 1 : 0,
    percentPlansChanged: feedback.length ? Math.round((changed / feedback.length) * 100) : 0,
    percentChangedExperimentType: feedback.length ? Math.round((changedType / feedback.length) * 100) : 0,
    averageUsefulnessRating,
    percentWouldUseAgain: feedback.length ? Math.round((feedback.filter((item) => item.rating >= 4).length / feedback.length) * 100) : 0,
  };
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}
