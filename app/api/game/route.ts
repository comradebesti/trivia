import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
const stages = ["round1", "halftime", "round2", "final", "tiebreaker"];
const stageName: Record<string, string> = { round1: "Round one", halftime: "Halftime", round2: "Round two", final: "Final question", tiebreaker: "Tiebreaker" };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const err = (message: string, status = 400) => json({ error: message }, status);
const clean = (x: unknown, max: number) => typeof x === "string" ? x.trim().slice(0, max) : "";
const random = () => crypto.randomUUID() + crypto.randomUUID();
function db() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing database configuration.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function unwrap<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
type Row = Record<string, any>;
const sortQuestions = (a: Row, b: Row) => stages.indexOf(a.stage) - stages.indexOf(b.stage) || a.position - b.position;
function exact(q: Row, a: Row) {
  if (q.kind === "short") return false;
  if (q.kind === "number") return Number(a.choice) === Number(q.correct);
  return JSON.stringify(a.choice) === JSON.stringify(q.correct);
}
function points(q: Row, a: Row): number {
  if (a.manual_points !== null && a.manual_points !== undefined) return a.manual_points;
  if (q.stage === "tiebreaker") return 0;
  if (q.stage === "halftime" && q.kind === "order" && Array.isArray(a.choice)) return a.choice.filter((x: number, i: number) => x === q.correct[i]).length;
  const hit = exact(q, a);
  if (q.stage === "final") return hit ? a.wager || 0 : -(a.wager || 0);
  return hit ? (q.stage === "round1" || q.stage === "round2" ? a.wager || 0 : q.points) : 0;
}
async function read(id: string, hostToken = "", teamToken = "") {
  const client = db();
  const game = unwrap(await client.from("games").select("*").eq("id", id).maybeSingle()) as Row | null;
  if (!game) return err("Game not found.", 404);
  const isHost = game.host_token === hostToken && !!hostToken;
  const questions = (unwrap(await client.from("questions").select("*").eq("game_id", id)) as Row[]).sort(sortQuestions);
  const teams = (unwrap(await client.from("teams").select("id,name,token,created_at").eq("game_id", id).order("created_at")) as Row[]);
  const ids = questions.map(q => q.id);
  const answers = ids.length ? unwrap(await client.from("answers").select("*").in("question_id", ids)) as Row[] : [];
  const wagers = unwrap(await client.from("final_wagers").select("*").eq("game_id", id)) as Row[];
  const team = teams.find(t => t.token === teamToken) || null;
  const current = questions.find(q => q.id === game.active_question) || null;
  const leaderboard = teams.map(t => {
    const own = answers.filter(a => a.team_id === t.id);
    const score = own.filter(a => isHost || game.phase === "reveal" || a.question_id !== current?.id)
      .reduce((sum, a) => sum + points(questions.find(q => q.id === a.question_id)!, a), 0);
    const tie = questions.find(q => q.stage === "tiebreaker");
    const tieAnswer = own.find(a => a.question_id === tie?.id);
    const distance = tie && tieAnswer && game.phase === "reveal" ? Math.abs(Number(tieAnswer.choice) - Number(tie.correct)) : null;
    return { id: t.id, name: t.name, score, distance };
  }).sort((a, b) => b.score - a.score || (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.name.localeCompare(b.name));
  const active = current && { id: current.id, position: questions.indexOf(current) + 1, stage: current.stage, kind: current.kind, category: game.phase === "wager" && !isHost ? "" : current.category, prompt: game.phase === "wager" && !isHost ? "" : current.prompt, options: game.phase === "wager" && !isHost ? [] : current.options, points: current.points, ...(isHost || game.phase === "reveal" ? { correct: current.correct } : {}) };
  return json({
    id, title: game.title, phase: game.phase, current: active, activeQuestion: game.active_question,
    questions: isHost ? questions.map((q, i) => ({ ...q, position: i + 1 })) : questions.map(q => ({ id: q.id, stage: q.stage })),
    leaderboard, answerCount: answers.filter(a => a.question_id === current?.id).length,
    wagerCount: wagers.length, myWager: team ? wagers.find(w => w.team_id === team.id)?.amount ?? null : null,
    myTeam: team ? { id: team.id, name: team.name } : null,
    myAnswer: team && current ? answers.find(a => a.team_id === team.id && a.question_id === current.id)?.choice ?? null : null,
    usedWagers: team && current ? answers.filter(a => a.team_id === team.id && a.stage === current.stage).map(a => a.wager) : [],
    responses: isHost ? answers.map(a => {
      const q = questions.find(q => q.id === a.question_id)!;
      return { id: a.id, questionId: a.question_id, team: teams.find(t => t.id === a.team_id)?.name, answer: a.choice, wager: a.wager, points: points(q, a), graded: a.manual_points !== null };
    }) : [],
    isHost, stageNames: stageName
  });
}
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams;
    const id = clean(p.get("game"), 12);
    if (!id) return err("Enter a game code.");
    return await read(id, p.get("host") || "", p.get("team") || "");
  } catch (e) { console.error(e); return err("Game is temporarily unavailable.", 503); }
}
export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as Record<string, any>, client = db();
    if (b.action === "create") {
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(), host = random();
      unwrap(await client.from("games").insert({ id, host_token: host, title: clean(b.title, 80) || "Team Trivia", created_at: Date.now() }).select("id").single());
      return json({ id, host });
    }
    const id = clean(b.game, 12);
    const game = unwrap(await client.from("games").select("*").eq("id", id).maybeSingle()) as Row | null;
    if (!game) return err("Game not found.", 404);
    if (b.action === "join") {
      const name = clean(b.name, 36);
      if (name.length < 2) return err("Use at least two characters for your team name.");
      const token = random();
      const result = await client.from("teams").insert({ id: crypto.randomUUID(), game_id: id, name, token, created_at: Date.now() });
      if (result.error) return err(result.error.code === "23505" ? "That team name is taken." : "Could not join.");
      return json({ team: token });
    }
    if (b.action === "finalWager") {
      if (game.phase !== "wager") return err("Final wagers are closed.");
      const t = unwrap(await client.from("teams").select("id").eq("game_id", id).eq("token", clean(b.team, 100)).maybeSingle()) as Row | null;
      if (!t) return err("Join a team first.", 403);
      const amount = Number(b.amount);
      if (!Number.isInteger(amount) || amount < 0) return err("Enter a whole-number wager.");
      const q = unwrap(await client.from("questions").select("*").eq("game_id", id)) as Row[];
      const a = unwrap(await client.from("answers").select("*").eq("team_id", t.id)) as Row[];
      const score = a.reduce((n, answer) => n + points(q.find(x => x.id === answer.question_id)!, answer), 0);
      if (amount > Math.max(0, score)) return err(`Your wager cannot exceed your ${score} points.`);
      const prior = unwrap(await client.from("final_wagers").select("amount").eq("game_id", id).eq("team_id", t.id).maybeSingle());
      if (prior) return err("Your final wager is already locked in.");
      unwrap(await client.from("final_wagers").insert({ game_id: id, team_id: t.id, amount }));
      return json({ ok: true });
    }
    if (b.action === "answer") {
      if (game.phase !== "open") return err("Answers are closed.");
      const q = unwrap(await client.from("questions").select("*").eq("id", game.active_question).eq("game_id", id).single()) as Row;
      const choice = b.choice, n = q.options.length;
      const index = (x: unknown) => Number.isInteger(x) && Number(x) >= 0 && Number(x) < n;
      const valid = q.kind === "short" ? typeof choice === "string" && choice.trim().length > 0 && choice.length <= 300
        : q.kind === "number" ? typeof choice === "number" && Number.isFinite(choice) && choice >= 0 && choice <= 1e12
        : q.kind === "single" ? index(choice)
        : Array.isArray(choice) && choice.length > 0 && choice.every(index) && new Set(choice).size === choice.length && (q.kind !== "order" || choice.length === n);
      if (!valid) return err("Complete your answer.");
      const normalized = q.kind === "multiple" ? [...choice].sort((a: number, b: number) => a - b) : q.kind === "short" ? choice.trim() : choice;
      const wager = (q.stage === "round1" || q.stage === "round2") ? Number(b.wager) : null;
      const result = await client.rpc("submit_trivia_answer", { p_game_id: id, p_team_token: clean(b.team, 100), p_choice: normalized, p_wager: wager });
      if (result.error) return err(result.error.message.replace(/^.*?ERROR:\s*/i, ""));
      return json({ ok: true });
    }
    if (!b.host || game.host_token !== b.host) return err("Host access required.", 403);
    if (b.action === "rename") {
      if (game.phase !== "lobby") return err("Change the game title before starting.");
      const title = clean(b.title, 80);
      if (!title) return err("Enter a game title.");
      unwrap(await client.from("games").update({ title }).eq("id", id));
      return json({ ok: true });
    }
    if (b.action === "grade") {
      const answerId = Number(b.answerId), amount = Number(b.points);
      if (!Number.isInteger(answerId) || !Number.isInteger(amount) || amount < -1000 || amount > 1000) return err("Enter a point adjustment between -1000 and 1000.");
      const qs = unwrap(await client.from("questions").select("id").eq("game_id", id)) as Row[];
      if (!qs.length) return err("Question not found.");
      const result = await client.from("answers").update({ manual_points: amount }).eq("id", answerId).in("question_id", qs.map(q => q.id)).select("id");
      if (result.error || !result.data?.length) return err("Answer not found.");
      return json({ ok: true });
    }
    if (b.action === "add") {
      if (game.phase !== "lobby") return err("Add questions before the game starts.");
      const stage = clean(b.stage, 20), kind = clean(b.kind, 20), prompt = clean(b.prompt, 300), category = clean(b.category, 80), pts = Number(b.points);
      if (!stages.includes(stage) || !["single","multiple","order","short","number"].includes(kind) || !prompt) return err("Complete the question and stage.");
      if ((stage === "halftime" && kind !== "order") || (stage === "tiebreaker" && kind !== "number") || (stage === "final" && kind === "number")) return err("Halftime uses ordering; the tiebreaker uses a number.");
      const existing = unwrap(await client.from("questions").select("id,position,stage").eq("game_id", id)) as Row[];
      if (["halftime","final","tiebreaker"].includes(stage) && existing.some(q => q.stage === stage)) return err("There can be one question in this special round.");
      if (["round1","round2"].includes(stage) && existing.filter(q => q.stage === stage).length >= 6) return err("Each main round can have up to six questions.");
      const options = Array.isArray(b.options) ? b.options.map((x: unknown) => clean(x, 140)) : [];
      const expectedLength = stage === "halftime" ? 8 : 4;
      const idx = (x: unknown) => Number.isInteger(x) && Number(x) >= 0 && Number(x) < options.length;
      const answer = b.correct;
      const valid = kind === "short" ? typeof answer === "string" && answer.trim().length > 0
        : kind === "number" ? Number.isFinite(Number(answer)) && Number(answer) >= 0
        : options.length === expectedLength && options.every((x: string) => !!x) && (
          kind === "single" ? idx(answer)
          : Array.isArray(answer) && answer.length >= (kind === "multiple" ? 2 : expectedLength) && answer.every(idx) && new Set(answer).size === answer.length && (kind !== "order" || answer.length === expectedLength));
      if (!valid || !Number.isInteger(pts) || pts < 1 || pts > 100) return err("Complete the answer choices and correct answer.");
      const correct = kind === "multiple" ? [...answer].sort((a: number, b: number) => a - b) : kind === "short" ? answer.trim() : kind === "number" ? Number(answer) : answer;
      unwrap(await client.from("questions").insert({ game_id: id, stage, position: Math.max(0, ...existing.map(q => q.position)) + 1, category, prompt, kind, options: kind === "short" || kind === "number" ? [] : options, correct, points: stage === "halftime" ? 8 : pts }));
      return json({ ok: true });
    }
    if (b.action === "remove") {
      if (game.phase !== "lobby") return err("Questions cannot be removed after starting.");
      unwrap(await client.from("questions").delete().eq("id", Number(b.question)).eq("game_id", id));
      return json({ ok: true });
    }
    if (b.action === "open") {
      if (game.phase === "open" || game.phase === "wager" || game.phase === "closed") return err("Finish the current question first.");
      const questions = (unwrap(await client.from("questions").select("*").eq("game_id", id)) as Row[]).sort(sortQuestions);
      const next = questions[questions.findIndex(q => q.id === game.active_question) + 1];
      if (!next) return err("No more questions. Add questions before starting.");
      unwrap(await client.from("games").update({ active_question: next.id, phase: next.stage === "final" ? "wager" : "open" }).eq("id", id));
      return json({ ok: true });
    }
    if (b.action === "showFinal") {
      if (game.phase !== "wager") return err("The final wager phase is not active.");
      unwrap(await client.from("games").update({ phase: "open" }).eq("id", id));
      return json({ ok: true });
    }
    if (b.action === "close" || b.action === "reveal") {
      if (!game.active_question || (b.action === "close" && game.phase !== "open") || (b.action === "reveal" && game.phase !== "closed")) return err("That step is not available yet.");
      unwrap(await client.from("games").update({ phase: b.action === "close" ? "closed" : "reveal" }).eq("id", id));
      return json({ ok: true });
    }
    return err("Unknown action.");
  } catch (e) { console.error(e); return err("Could not save. Please try again.", 503); }
}
