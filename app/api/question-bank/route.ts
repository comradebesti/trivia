import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
export const runtime = "nodejs";
function db() {
 if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error("Database configuration missing.");
 return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
}
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
function authorize(req:NextRequest) {
 const secret=process.env.QUESTION_BANK_PASSWORD;
 if (!secret) return reply({error:"Set QUESTION_BANK_PASSWORD in your hosting environment first."},503);
 const supplied=req.headers.get("x-bank-password") || "";
 const a=Buffer.from(secret), b=Buffer.from(supplied);
 if (a.length!==b.length || !timingSafeEqual(a,b)) return reply({error:"Enter the Question Bank password."},403);
}
function check(error: {message:string}|null) { if(error) throw new Error(error.message); }
export async function GET(req:NextRequest) {
 const denied=authorize(req); if(denied) return denied;
 try {
 const client=db();
 const bank=await client.from("trivia_question_bank").select("*").order("updated_at",{ascending:false}); check(bank.error);
 const usage=await client.from("questions").select("bank_id,stage,games(id,title,phase)").not("bank_id","is",null); check(usage.error);
 return reply({questions:(bank.data || []).map(q=>({...q,usage:(usage.data || []).filter(u=>u.bank_id===q.id)}))});
 } catch(e) { console.error(e);return reply({error:"Could not load the bank. Run add-question-bank.sql and check the database settings."},503); }
}
export async function POST(req:NextRequest) {
 const denied=authorize(req); if(denied) return denied;
 try {
 const b=await req.json(), client=db();
 if(b.action==="delete") {
 if(typeof b.id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id)) return reply({error:"Choose a question to delete."},400);
 // The questions.bank_id foreign key uses ON DELETE SET NULL.
 // Existing game copies, answers and scores stay intact.
 const result=await client.from("trivia_question_bank").delete().eq("id",b.id).select("id");
 check(result.error);
 if(!result.data?.length) return reply({error:"Question not found. Refresh the bank."},404);
 return reply({ok:true});
 }
 if(b.action!=="save") return reply({error:"Unknown action."},400);
 const c=b.content || {}, status=b.status==="ready"?"ready":"draft";
 const stages=["round1","round2","halftime","final","tiebreaker"], kinds=["single","multiple","order","short","number"];
 if(!stages.includes(c.stage)||!kinds.includes(c.kind)) return reply({error:"Choose a stage and question type."},400);
 const content={stage:c.stage,kind:c.kind,prompt:String(c.prompt || "").trim().slice(0,300),category:String(c.category || "").trim().slice(0,80),options:Array.isArray(c.options)?c.options.slice(0,8).map((x:unknown)=>String(x).trim().slice(0,140)):[],correct:c.correct??null,points:10,bonusPrompt:String(c.bonusPrompt || "").trim().slice(0,300),bonusTarget:c.bonusTarget,bonusTolerance:c.bonusTolerance};
 if(status==="ready") {
 const n=content.stage==="halftime"?8:4, a=content.correct;
 const idx=(x:unknown)=>Number.isInteger(x)&&Number(x)>=0&&Number(x)<n;
 const valid=content.kind==="short"?typeof a==="string"&&a.trim().length>0:content.kind==="number"?typeof a==="number"&&Number.isFinite(a)&&a>=0&&a<=1e12:content.options.length===n&&content.options.every((x:string)=>!!x)&&(content.kind==="single"?idx(a):Array.isArray(a)&&a.every(idx)&&new Set(a).size===a.length&&(content.kind==="multiple"?a.length>=2:a.length===n));
 if(!content.prompt || !valid) return reply({error:"Complete the question, choices and correct answer, or save as a draft."},400);
 if((content.stage==="halftime"&&content.kind!=="order")||(content.stage==="tiebreaker"&&content.kind!=="number")||(content.stage==="final"&&content.kind==="number")) return reply({error:"Halftime uses ordering. Tiebreaker uses a number. Final uses a nonnumeric type."},400);
 if(content.bonusPrompt && [content.bonusTarget,content.bonusTolerance].some(x=>typeof x!=="number"||!Number.isFinite(x)||x<0||x>1e12)) return reply({error:"Complete the bonus target and tolerance."},400);
 if(content.kind==="multiple") content.correct=[...a].sort((x:number,y:number)=>x-y);
 }
 const row={content,status,notes:String(b.notes || "").slice(0,2000),tags:String(b.tags || "").slice(0,300),updated_at:new Date().toISOString()};
 const result=b.id?await client.from("trivia_question_bank").update(row).eq("id",b.id).select("id").single():await client.from("trivia_question_bank").insert(row).select("id").single();
 check(result.error); return reply({ok:true,id:result.data?.id});
 } catch(e){console.error(e);return reply({error:"Could not update the Question Bank. Check the migration and try again."},503);}
}
