const SESSION_DURATION = 24 * 60 * 60 * 1000;
const LESSON_TIMES = {1:["09:00","09:45"],2:["09:55","10:40"],3:["10:50","11:35"],4:["11:55","12:40"],5:["13:00","13:45"],6:["14:00","14:45"],7:["14:55","15:40"],8:["15:45","16:30"]};
const TIME_MODES = ["automatic", "manual"];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}
function cookies(request) {
  const value = request.headers.get("Cookie");
  if (!value) return {};
  return Object.fromEntries(value.split(";").map((x) => x.trim().split("=")).map(([k,...v]) => [k,v.join("=")]));
}
async function token(secret) {
  const timestamp = Date.now().toString();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp));
  return `${timestamp}.${[...new Uint8Array(signature)].map((b)=>b.toString(16).padStart(2,"0")).join("")}`;
}
async function validToken(value, secret) {
  if (!value) return false;
  const [timestamp, signature] = value.split(".");
  if (!timestamp || !signature || Date.now() - Number(timestamp) > SESSION_DURATION) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["verify"]);
  const bytes = new Uint8Array(signature.match(/.{1,2}/g).map((x)=>parseInt(x,16)));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(timestamp));
}
async function auth(request, env) { return validToken(cookies(request).admin_token, env.ADMIN_PASSWORD); }
function lessonTime(number) { const t = LESSON_TIMES[number]; return t ? `${t[0]} — ${t[1]}` : ""; }
function hasLessonData(lesson) { return Boolean(String(lesson.name ?? "").trim() || String(lesson.teacher ?? "").trim() || String(lesson.room ?? "").trim()); }
async function getTimeMode(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS schedule_settings (id INTEGER PRIMARY KEY CHECK (id = 1), time_mode TEXT NOT NULL DEFAULT 'automatic')`).run();
  let row = await env.DB.prepare(`SELECT time_mode FROM schedule_settings WHERE id = 1`).first();
  if (!row) { await env.DB.prepare(`INSERT INTO schedule_settings (id, time_mode) VALUES (1, 'automatic')`).run(); row = {time_mode:"automatic"}; }
  return TIME_MODES.includes(row.time_mode) ? row.time_mode : "automatic";
}
async function setTimeMode(env, mode) {
  if (!TIME_MODES.includes(mode)) throw new Error("Некорректный режим времени");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS schedule_settings (id INTEGER PRIMARY KEY CHECK (id = 1), time_mode TEXT NOT NULL DEFAULT 'automatic')`).run();
  await env.DB.prepare(`INSERT INTO schedule_settings (id,time_mode) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET time_mode=excluded.time_mode`).bind(mode).run();
}
async function updatedAt(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS schedule_meta (id INTEGER PRIMARY KEY CHECK (id = 1), updated_at INTEGER NOT NULL)`).run();
  let row = await env.DB.prepare(`SELECT updated_at FROM schedule_meta WHERE id = 1`).first();
  if (!row) { const now=Date.now(); await env.DB.prepare(`INSERT INTO schedule_meta (id,updated_at) VALUES (1,?)`).bind(now).run(); return now; }
  return row.updated_at;
}
async function touch(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS schedule_meta (id INTEGER PRIMARY KEY CHECK (id = 1), updated_at INTEGER NOT NULL)`).run();
  await env.DB.prepare(`INSERT INTO schedule_meta (id,updated_at) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`).bind(Date.now()).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/schedule" && request.method === "GET") {
      try {
        const {results} = await env.DB.prepare(`SELECT id,day,lesson_number,name,teacher,room,time FROM lessons ORDER BY day,lesson_number`).all();
        const mode = await getTimeMode(env);
        const lessons = results.map((lesson) => ({...lesson, time: mode === "automatic" ? (hasLessonData(lesson) ? lessonTime(lesson.lesson_number) : "") : String(lesson.time ?? "")}));
        return json({success:true, lessons, last_updated:await updatedAt(env), time_mode:mode});
      } catch (error) { return json({success:false,error:error.message},500); }
    }

    if (url.pathname === "/api/settings" && request.method === "GET") {
      try { return json({success:true,time_mode:await getTimeMode(env)}); }
      catch (error) { return json({success:false,error:error.message},500); }
    }

    if (url.pathname === "/api/settings" && request.method === "PUT") {
      if (!await auth(request,env)) return json({success:false,error:"Необходима авторизация"},401);
      try { const body=await request.json(); const mode=String(body.time_mode ?? ""); await setTimeMode(env,mode); await touch(env); return json({success:true,time_mode:mode}); }
      catch (error) { return json({success:false,error:error.message},400); }
    }

    if (url.pathname === "/api/auth" && request.method === "GET") return json({success:true,authenticated:await auth(request,env)});

    if (url.pathname === "/api/login" && request.method === "POST") {
      try {
        const body=await request.json(); const password=String(body.password ?? "");
        if (!password) return json({success:false,error:"Введите пароль"},400);
        if (password !== env.ADMIN_PASSWORD) return json({success:false,error:"Неверный пароль"},401);
        return json({success:true},200,{"Set-Cookie":`admin_token=${await token(env.ADMIN_PASSWORD)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`});
      } catch { return json({success:false,error:"Некорректный запрос"},400); }
    }

    if (url.pathname.startsWith("/api/lesson/") && request.method === "PUT") {
      if (!await auth(request,env)) return json({success:false,error:"Необходима авторизация"},401);
      try {
        const id=url.pathname.split("/").pop();
        if (!id || !/^\d+$/.test(id)) return json({success:false,error:"Некорректный ID урока"},400);
        const body=await request.json();
        const name=String(body.name ?? "").trim();
        const teacher=String(body.teacher ?? "").trim();
        const room=String(body.room ?? "").trim();
        const time=String(body.time ?? "").trim();
        const info=await env.DB.prepare(`SELECT day,lesson_number FROM lessons WHERE id = ?`).bind(Number(id)).first();
        if (!info) return json({success:false,error:"Урок не найден"},404);
        const mode=await getTimeMode(env);
        const finalTime=mode === "automatic" ? (hasLessonData({name,teacher,room}) ? lessonTime(info.lesson_number) : "") : time;
        await env.DB.prepare(`UPDATE lessons SET name=?,teacher=?,room=?,time=? WHERE id=?`).bind(name,teacher,room,finalTime,Number(id)).run();
        await touch(env);
        return json({success:true,lesson:{id:Number(id),day:info.day,lesson_number:info.lesson_number,name,teacher,room,time:finalTime}});
      } catch (error) { return json({success:false,error:error.message},500); }
    }

    if (url.pathname === "/api/activity/token" && request.method === "POST") {
      try {
        const body=await request.json(); const activityId=String(body.activity_id ?? "").trim(); const activityToken=String(body.token ?? "").trim();
        if (!activityToken) return json({success:false,error:"Токен не указан"},400);
        await env.DB.prepare(`INSERT INTO activity_tokens (id,token,activity_id,updated_at) VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,activity_id=excluded.activity_id,updated_at=excluded.updated_at`).bind(activityToken,activityId,Date.now()).run();
        return json({success:true});
      } catch (error) { return json({success:false,error:error.message},500); }
    }

    if (url.pathname === "/api/logout" && request.method === "POST") return json({success:true},200,{"Set-Cookie":"admin_token=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"});
    return json({success:false,message:"Not found"},404);
  },
};