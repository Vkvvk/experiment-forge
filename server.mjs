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
const model = process.env.OPENROUTER_MODEL ?? "minimax/minimax-m3";
const dataDir = path.resolve("data");
const dbPath = path.join(dataDir, "db.json");

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

const vite = await createViteServer({
  server: { middlewareMode: true, host },
  appType: "spa",
});

app.use(vite.middlewares);

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

Return a structured critique with:
1. primary risk type
2. explanation of risk type
3. weakest assumption
4. why this is the weakest assumption
5. fit rating of the proposed experiment: good, partial, or poor
6. explanation of experiment fit
7. up to 3 better experiment recommendations
8. pass criteria
9. fail criteria
10. revised learning plan
11. confidence level and explanation`;

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
  return `You are an expert product discovery coach. Your job is to help product managers de-risk product ideas before engineering build.
You are especially good at distinguishing:
- value risk: whether users care enough to choose/use/buy/change behavior
- usability risk: whether users can understand/use the solution
- feasibility risk: whether the team can build it
- viability risk: whether it works for the business/legal/operations model
Be direct, practical, and critical without being rude.
Your job is not to make the PM feel good. Your job is to help them choose the right experiment.
Strongly flag cases where a PM is proposing usability testing when the real unresolved risk is value/desirability.
Do not recommend more than 3 experiments.
Always pick one weakest assumption.
Always provide clear pass/fail criteria.
Output concise, structured, copyable language.`;
}

function sanitizeCritique(input) {
  return {
    primaryRiskType: input?.primaryRiskType ?? "mixed",
    riskExplanation: input?.riskExplanation ?? "",
    weakestAssumption: input?.weakestAssumption ?? "",
    assumptionExplanation: input?.assumptionExplanation ?? "",
    experimentFit: input?.experimentFit ?? "partial",
    experimentFitExplanation: input?.experimentFitExplanation ?? "",
    recommendedExperiments: Array.isArray(input?.recommendedExperiments) ? input.recommendedExperiments.slice(0, 3) : [],
    passCriteria: Array.isArray(input?.passCriteria) ? input.passCriteria : [],
    failCriteria: Array.isArray(input?.failCriteria) ? input.failCriteria : [],
    revisedLearningPlan: input?.revisedLearningPlan ?? "",
    confidence: input?.confidence ?? "medium",
    confidenceExplanation: input?.confidenceExplanation ?? "",
  };
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
