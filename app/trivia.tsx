"use client";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
type Stage = "round1" | "halftime" | "round2" | "final" | "tiebreaker";
type Kind = "single" | "multiple" | "order" | "short" | "number";
type Question = { id: number; position: number; stage: Stage; prompt: string; options: string[]; kind: Kind; points: number; correct?: number | number[] | string };
type Response = { id: number; questionId: number; team: string; answer: number | number[] | string; wager: number | null; points: number };
type Game = {
  id: string; title: string; phase: string; activeQuestion: number | null; current: Question | null; questions: Question[];
  leaderboard: { id: string; name: string; score: number; distance: number | null }[];
  answerCount: number; wagerCount: number; myWager: number | null; myTeam: { id: string; name: string } | null;
  myAnswer: number | number[] | string | null; usedWagers: number[]; responses: Response[]; isHost: boolean;
};
const stages: { id: Stage; label: string }[] = [
  { id: "round1", label: "Round one" }, { id: "halftime", label: "Halftime" }, { id: "round2", label: "Round two" },
  { id: "final", label: "Final question" }, { id: "tiebreaker", label: "Tiebreaker" }
];
const stageLabel = (stage: Stage) => stages.find(s => s.id === stage)?.label || stage;
const key = (id: string, role: string) => `halloween-trivia:${id}:${role}`;
const label = (i: number) => String.fromCharCode(65 + i);
const move = (list: number[], from: number, to: number) => { const copy = [...list]; copy.splice(to, 0, copy.splice(from, 1)[0]); return copy; };
const answerText = (q: Question, answer: number | number[] | string) => q.kind === "short" || q.kind === "number"
  ? String(answer) : q.kind === "single" ? q.options[Number(answer)] || ""
  : Array.isArray(answer) ? answer.map(n => q.options[n]).join(q.kind === "order" ? " → " : ", ") : "";

export default function Trivia() {
  const [id, setId] = useState(""), [joinCode, setJoinCode] = useState("");
  const [host, setHost] = useState(""), [team, setTeam] = useState("");
  const [game, setGame] = useState<Game | null>(null);
  const [title, setTitle] = useState("Halloween Trivia"), [name, setName] = useState("");
  const [stage, setStage] = useState<Stage>("round1"), [kind, setKind] = useState<Kind>("single");
  const [prompt, setPrompt] = useState(""), [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0), [multi, setMulti] = useState<number[]>([]);
  const [orderedCorrect, setOrderedCorrect] = useState([0, 1, 2, 3]);
  const [expected, setExpected] = useState(""), [points, setPoints] = useState(10);
  const [selected, setSelected] = useState<number[]>([]), [ordering, setOrdering] = useState([0, 1, 2, 3]);
  const [written, setWritten] = useState(""), [wager, setWager] = useState<number | "">("");
  const [finalWager, setFinalWager] = useState<number | "">("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(""), [copied, setCopied] = useState(false);
  const joinUrl = typeof window !== "undefined" && id ? `${window.location.origin}/?game=${id}` : "";
  const isRound = game?.current?.stage === "round1" || game?.current?.stage === "round2";
  const roundSize = isRound ? game?.questions.filter(q => q.stage === game.current?.stage).length || 0 : 0;
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get("game")?.toUpperCase() || "";
    if (!code) return;
    setId(code); setHost(p.get("host") || localStorage.getItem(key(code, "host")) || "");
    setTeam(localStorage.getItem(key(code, "team")) || "");
    if (p.has("host")) { localStorage.setItem(key(code, "host"), p.get("host")!); history.replaceState(null, "", `/?game=${code}`); }
  }, []);
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/game?game=${encodeURIComponent(id)}&host=${encodeURIComponent(host)}&team=${encodeURIComponent(team)}`, { cache: "no-store" });
      const j = await r.json() as Game & { error?: string };
      if (!r.ok) throw new Error(j.error);
      setGame(j); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load game."); }
  }, [id, host, team]);
  useEffect(() => { if (!id) return; void load(); const timer = setInterval(() => void load(), 2500); return () => clearInterval(timer); }, [id, load]);
  useEffect(() => { if (joinUrl) void QRCode.toDataURL(joinUrl, { width: 280, margin: 2, color: { dark: "#281927", light: "#ffffff" } }).then(setQr); }, [joinUrl]);
  useEffect(() => {
    setSelected([]); setOrdering(game?.current?.options.map((_, i) => i) || [0, 1, 2, 3]);
    setWritten(""); setWager(""); setFinalWager("");
  }, [game?.activeQuestion]);
  function setStageAndOptions(next: Stage) {
    setStage(next);
    const n = next === "halftime" ? 8 : 4;
    setOptions(Array(n).fill("")); setOrderedCorrect(Array.from({ length: n }, (_, i) => i));
    setKind(next === "halftime" ? "order" : next === "tiebreaker" ? "number" : "single");
  }
  async function send(action: string, values: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/game", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, game: id, host, team, ...values }) });
      const j = await r.json() as { error?: string; id: string; host: string; team: string };
      if (!r.ok) throw new Error(j.error || "Please try again.");
      if (action === "create") { localStorage.setItem(key(j.id, "host"), j.host); setId(j.id); setHost(j.host); history.replaceState(null, "", `/?game=${j.id}`); }
      if (action === "join") { localStorage.setItem(key(id, "team"), j.team); setTeam(j.team); }
      if (action === "add") { setPrompt(""); setOptions(Array(stage === "halftime" ? 8 : 4).fill("")); setCorrect(0); setMulti([]); setOrderedCorrect(Array.from({ length: stage === "halftime" ? 8 : 4 }, (_, i) => i)); setExpected(""); }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }
  async function copy() { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  function submitAnswer(choice: number | number[] | string) { void send("answer", { choice, wager: isRound ? wager : null }); }
  function wagerPicker() {
    if (!isRound || game?.phase !== "open" || game.myAnswer !== null) return null;
    return <div className="wagers"><b>Choose your wager · use each number once this round</b><div>{Array.from({ length: roundSize }, (_, i) => i + 1).map(n => <button className={wager === n ? "picked" : ""} disabled={game.usedWagers.includes(n)} key={n} onClick={() => setWager(n)}>{n}</button>)}</div></div>;
  }
  const question = game?.current;
  const answerLocked = game?.myAnswer !== null;
  const canAnswer = game?.phase === "open" && !answerLocked && !busy && (!isRound || wager !== "");

  return <main className="shell">
    <header className="mast"><div className="brand"><span className="brandmark">✳</span> HALLOWEEN <b>TRIVIA</b></div><span className="mastnote">A little friendly haunting</span></header>
    {!id ? <section className="intro grid2"><div><div className="eyebrow">THE GAME IS AFOOT</div><h1>Put your heads <em>together.</em></h1><p>One phone per team. Two rounds of 5–8 questions, a halftime challenge, a final wager, and a tiebreaker if you need one.</p></div>
      <div className="card start"><h2>Host a game</h2><label>Game title<input value={title} maxLength={80} onChange={e => setTitle(e.target.value)} /></label><button className="primary" disabled={busy} onClick={() => void send("create", { title })}>Create game ↗</button><div className="divider">or join a game</div><form onSubmit={e => { e.preventDefault(); if (joinCode.length === 8) { setId(joinCode); history.replaceState(null, "", `/?game=${joinCode}`); } }}><label>Game code<input placeholder="8 letter code" maxLength={8} value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></label><button className="secondary" disabled={joinCode.length !== 8}>Join game</button></form></div>
    </section> : <>
      <div className="topline"><div><div className="eyebrow">{game?.isHost ? "HOST DESK" : game?.myTeam ? "TEAM SCREEN" : "JOIN THE GAME"} · {id}</div><h1>{game?.title || "Halloween Trivia"}</h1></div><span className="pill">{game?.phase === "wager" ? "Place final wagers" : game?.phase === "open" ? "Question open" : game?.phase === "reveal" ? "Answer revealed" : game?.phase === "closed" ? "Answers closed" : "Waiting to start"}</span></div>
      {error && <div className="error" role="alert">{error}</div>}
      {!game ? <div className="card">Loading game…</div> : game.isHost ? <div className="gamegrid"><div className="maincol">
        <section className="card joincard"><div className="sectionhead"><div><div className="eyebrow">GET EVERYONE IN</div><h2>Team join</h2></div><span className="code">{id}</span></div><div className="joincontent">{qr && <img src={qr} alt="QR code to join" width="180" height="180" />}<div><p>One person from each team scans the code. They name their team and answer on that phone.</p><button className="secondary" onClick={() => void copy()}>{copied ? "Copied!" : "Copy join link"}</button><div className="url">{joinUrl}</div></div></div></section>
        {game.phase === "lobby" && <section className="card"><div className="eyebrow">WRITE THE QUIZ</div><h2>Add a question</h2>
          <label>Part of the game<select value={stage} onChange={e => setStageAndOptions(e.target.value as Stage)}>{stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label>Question type<select value={kind} disabled={stage === "halftime" || stage === "tiebreaker"} onChange={e => setKind(e.target.value as Kind)}><option value="single">One answer</option><option value="multiple">Select all that apply</option><option value="order">Put in order</option><option value="short">Written answer · host grades</option>{stage === "tiebreaker" && <option value="number">Closest number wins</option>}</select></label>
          <label>Question<textarea rows={3} maxLength={300} placeholder={stage === "halftime" ? "Put these eight horror movies in release order" : "What is the question?"} value={prompt} onChange={e => setPrompt(e.target.value)} /></label>
          {kind === "short" || kind === "number" ? <label>{kind === "number" ? "Target number" : "Expected answer (shown at reveal)"}<input type={kind === "number" ? "number" : "text"} min={0} value={expected} onChange={e => setExpected(e.target.value)} /></label> : <div className="choicesform">{options.map((o, i) => <label key={i}>{label(i)}. Answer choice<input maxLength={140} value={o} onChange={e => setOptions(v => v.map((x, n) => n === i ? e.target.value : x))} /></label>)}</div>}
          {kind === "single" && <label>Correct answer<select value={correct} onChange={e => setCorrect(Number(e.target.value))}>{options.map((_, i) => <option value={i} key={i}>{label(i)}</option>)}</select></label>}
          {kind === "multiple" && <div className="editanswer"><b>Correct answers · choose at least two</b>{options.map((o, i) => <label key={i}><input type="checkbox" checked={multi.includes(i)} onChange={() => setMulti(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i])} /> {label(i)}. {o || "Answer choice"}</label>)}</div>}
          {kind === "order" && <div className="editanswer"><b>Correct order · use arrows to arrange</b>{orderedCorrect.map((index, i) => <div className="orderrow" key={index}><strong>{i + 1}</strong><span>{options[index] || `Answer ${label(index)}`}</span><button disabled={i === 0} onClick={() => setOrderedCorrect(v => move(v, i, i - 1))} aria-label="Move up">↑</button><button disabled={i === orderedCorrect.length - 1} onClick={() => setOrderedCorrect(v => move(v, i, i + 1))} aria-label="Move down">↓</button></div>)}</div>}
          {stage === "halftime" ? <p className="muted">Eight items · one point for each item in the right position. You can adjust points afterward.</p> : stage === "round1" || stage === "round2" ? <p className="muted">Add 5–8 questions. The number of questions sets the maximum wager, and each wager can be used once per round.</p> : stage === "final" ? <p className="muted">Teams wager up to their current score before seeing the question. A wrong answer loses the wager.</p> : <p className="muted">Closest guess breaks a tie on points.</p>}
          {stage !== "round1" && stage !== "round2" && stage !== "halftime" && stage !== "final" && stage !== "tiebreaker" && <label>Points<input type="number" min={1} max={100} value={points} onChange={e => setPoints(Number(e.target.value))} /></label>}
          <button className="primary" disabled={busy} onClick={() => void send("add", { stage, prompt, options, kind, correct: kind === "single" ? correct : kind === "multiple" ? multi : kind === "order" ? orderedCorrect : kind === "number" ? Number(expected) : expected, points })}>Add question +</button>
        </section>}
        {question && <section className="card current"><div className="eyebrow">{stageLabel(question.stage).toUpperCase()} · QUESTION {question.position}</div>
          {game.phase === "wager" ? <><h2>Final wagers are open</h2><p>Teams can wager up to their current score. The question stays hidden until you reveal it.</p><p>{game.wagerCount} of {game.leaderboard.length} teams wagered</p><button className="primary" disabled={busy} onClick={() => void send("showFinal")}>Show final question →</button></> :
          <><h2>{question.prompt}</h2>{question.kind !== "short" && question.kind !== "number" && <div className="answergrid">{question.options.map((o, i) => <div className={`answer ${game.phase === "reveal" && (Array.isArray(question.correct) ? question.correct.includes(i) : question.correct === i) ? "right" : ""}`} key={i}><span>{label(i)}</span>{o}</div>)}</div>}
          {game.phase === "reveal" && <p><b>Correct:</b> {answerText(question, question.correct!)}</p>}
          <p>{game.answerCount} of {game.leaderboard.length} teams answered</p><div className="actions">
            {game.phase === "open" && <button className="primary" disabled={busy} onClick={() => void send("close")}>Close answers</button>}
            {game.phase === "closed" && <button className="primary" disabled={busy} onClick={() => void send("reveal")}>Reveal answer</button>}
            {game.phase === "reveal" && question.position < game.questions.length && <button className="primary" disabled={busy} onClick={() => void send("open")}>{game.questions[question.position]?.stage === "tiebreaker" ? "Open tiebreaker if needed" : "Next question"} →</button>}
          </div></>}</section>}
        {game.responses.length > 0 && <section className="card"><div className="eyebrow">HOST GRADING</div><h2>Review answers</h2><p className="muted">Change any team’s points for a spelling mistake or partial credit. The leaderboard updates for everyone.</p>
          {game.questions.map(q => { const rows = game.responses.filter(r => r.questionId === q.id); return rows.length ? <div className="reviewgroup" key={q.id}><h3>{stageLabel(q.stage)} · {q.prompt}</h3>{rows.map(r => <div className="reviewrow" key={r.id}><div><b>{r.team}</b><small>{answerText(q, r.answer)}{r.wager !== null ? ` · Wager: ${r.wager}` : ""}</small></div><label>Points<input type="number" min={-1000} max={1000} aria-label={`Points for ${r.team}`} defaultValue={r.points} key={`${r.id}-${r.points}`} onBlur={e => { if (Number(e.target.value) !== r.points) void send("grade", { answerId: r.id, points: Number(e.target.value) }); }} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} /></label></div>)}</div> : null; })}
        </section>}
        {game.phase === "lobby" && game.questions.length > 0 && <button className="primary big" disabled={busy} onClick={() => void send("open")}>Start game · Open first question →</button>}
        {game.phase === "reveal" && question?.position === game.questions.length && <div className="card done">That’s the game. Check the standings! 🏆</div>}
      </div><aside className="sidecol"><section className="card"><div className="eyebrow">THE ROSTER</div><h2>Teams <span className="count">{game.leaderboard.length}</span></h2>{game.leaderboard.length ? <ol className="scores">{game.leaderboard.map((t, i) => <li key={t.id}><span>{String(i + 1).padStart(2, "0")}</span><b>{t.name}</b><strong>{t.score}</strong>{t.distance !== null && <small>off by {t.distance}</small>}</li>)}</ol> : <p className="muted">Teams appear as they join.</p>}</section>
        <section className="card"><div className="eyebrow">YOUR LINEUP</div><h2>Questions <span className="count">{game.questions.length}</span></h2>{game.questions.length ? <ol className="questionlist">{game.questions.map(q => <li key={q.id}><span>{String(q.position).padStart(2, "0")}</span><div>{q.prompt}<small>{stageLabel(q.stage)} · Correct: {answerText(q, q.correct!)}</small></div>{game.phase === "lobby" && <button aria-label="Remove question" onClick={() => void send("remove", { question: q.id })}>×</button>}</li>)}</ol> : <p className="muted">Add a question to start.</p>}</section>
      </aside></div> : <div className="player">{!game.myTeam ? <section className="card"><div className="eyebrow">HELLO, FUTURE WINNERS</div><h2>Join your team</h2><p>One phone per team. Pick a name everyone will recognize.</p><form onSubmit={e => { e.preventDefault(); void send("join", { name }); }}><label>Team name<input maxLength={36} minLength={2} required value={name} placeholder="The Brain Trust" onChange={e => setName(e.target.value)} /></label><button className="primary" disabled={busy}>Join game →</button></form></section> : <>
        <section className="teamtag"><span>PLAYING AS</span><strong>{game.myTeam.name}</strong></section>
        {question ? <section className="card current"><div className="eyebrow">{stageLabel(question.stage).toUpperCase()} · QUESTION {question.position} OF {game.questions.length}</div>
          {game.phase === "wager" ? <><h2>Final wager</h2><p>Choose how many of your current points to risk. You’ll gain that many for a correct answer or lose them for a wrong one. The question comes next.</p>{game.myWager === null ? <><label>Your wager · up to {Math.max(0, game.leaderboard.find(t => t.id === game.myTeam?.id)?.score || 0)}<input type="number" min={0} max={Math.max(0, game.leaderboard.find(t => t.id === game.myTeam?.id)?.score || 0)} value={finalWager} onChange={e => setFinalWager(e.target.value === "" ? "" : Number(e.target.value))} /></label><button className="primary" disabled={busy || finalWager === ""} onClick={() => void send("finalWager", { amount: finalWager })}>Lock in wager</button></> : <p className="response">Wager locked in: {game.myWager}. Waiting for the question…</p>}</> :
          <><h2>{question.prompt}</h2>{wagerPicker()}
            {question.kind === "short" || question.kind === "number" ? <><label>Your {question.kind === "number" ? "number" : "answer"}<textarea rows={2} maxLength={300} disabled={game.phase !== "open" || answerLocked} value={game.myAnswer !== null ? String(game.myAnswer) : written} onChange={e => setWritten(e.target.value)} /></label>{game.phase === "open" && !answerLocked && <button className="primary" disabled={!canAnswer || !written.trim() || (question.kind === "number" && !Number.isFinite(Number(written)))} onClick={() => submitAnswer(question.kind === "number" ? Number(written) : written)}>Submit answer</button>}</> :
            question.kind === "order" ? <><p>Put these in order. Use the arrows to move each answer.</p><div className="editanswer">{(Array.isArray(game.myAnswer) ? game.myAnswer : ordering).map((index, i) => <div className="orderrow" key={index}><strong>{i + 1}</strong><span>{question.options[index]}</span><button aria-label="Move up" disabled={!canAnswer || i === 0} onClick={() => setOrdering(v => move(v, i, i - 1))}>↑</button><button aria-label="Move down" disabled={!canAnswer || i === ordering.length - 1} onClick={() => setOrdering(v => move(v, i, i + 1))}>↓</button></div>)}</div>{game.phase === "open" && !answerLocked && <button className="primary" disabled={!canAnswer} onClick={() => submitAnswer(ordering)}>Lock in order</button>}</> :
            <><div className="answergrid">{question.options.map((o, i) => <button key={i} className={`answer ${game.myAnswer === i || (Array.isArray(game.myAnswer) ? game.myAnswer.includes(i) : selected.includes(i)) ? "selected" : ""} ${game.phase === "reveal" && (Array.isArray(question.correct) ? question.correct.includes(i) : question.correct === i) ? "right" : ""}`} disabled={!canAnswer} onClick={() => question.kind === "multiple" ? setSelected(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i]) : submitAnswer(i)}><span>{label(i)}</span>{o}</button>)}</div>{question.kind === "multiple" && game.phase === "open" && !answerLocked && <button className="primary submitmulti" disabled={!canAnswer || selected.length === 0} onClick={() => submitAnswer(selected)}>Lock in {selected.length} answer{selected.length === 1 ? "" : "s"}</button>}</>}
            <p className="response">{game.phase === "open" ? answerLocked ? "Answer locked in. Waiting for the host…" : "You get one submission!" : game.phase === "reveal" ? `Correct answer: ${answerText(question, question.correct!)}` : "Answers are closed. Waiting for the reveal…"}</p>
          </>}
        </section> : <section className="card waiting"><div className="waiticon">✳</div><h2>You’re in!</h2><p>Hang tight. The host will open the first question soon.</p></section>}
        <section className="card"><div className="eyebrow">THE STANDINGS</div><h2>Leaderboard</h2><ol className="scores">{game.leaderboard.map((t, i) => <li className={t.id === game.myTeam?.id ? "mine" : ""} key={t.id}><span>{String(i + 1).padStart(2, "0")}</span><b>{t.name}</b><strong>{t.score}</strong>{t.distance !== null && <small>off by {t.distance}</small>}</li>)}</ol></section>
      </>}</div>}
    </>}
    <footer>Refresh whenever you need. Your team stays saved on this device.</footer>
  </main>;
}
