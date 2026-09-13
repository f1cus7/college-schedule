const SESSION_DURATION = 24 * 60 * 60 * 1000;

const LESSON_TIMES = {
  1: ["09:00", "09:45"],
  2: ["09:55", "10:40"],
  3: ["10:50", "11:35"],
  4: ["11:55", "12:40"],
  5: ["13:00", "13:45"],
  6: ["14:00", "14:45"],
  7: ["14:55", "15:40"],
  8: ["15:45", "16:30"],
};

const TIME_FORMATS = ["long", "compact", "hyphen"];

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function parseCookies(request) {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((cookie) => cookie.trim().split("="))
      .map(([key, ...value]) => [key, value.join("=")]),
  );
}

async function createSessionToken(secret) {
  const timestamp = Date.now().toString();

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp),
  );

  const signature = [...new Uint8Array(signatureBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `${timestamp}.${signature}`;
}

async function verifySessionToken(token, secret) {
  if (!token) {
    return false;
  }

  const [timestamp, signature] = token.split(".");

  if (!timestamp || !signature) {
    return false;
  }

  const tokenTime = Number(timestamp);

  if (!Number.isFinite(tokenTime)) {
    return false;
  }

  if (Date.now() - tokenTime > SESSION_DURATION) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

  const signatureBytes = new Uint8Array(
    signature.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)),
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(timestamp),
  );
}

async function isAuthenticated(request, env) {
  const cookies = parseCookies(request);

  return verifySessionToken(cookies.admin_token, env.ADMIN_PASSWORD);
}

function getLessonTime(lessonNumber, format = "long") {
  const time = LESSON_TIMES[lessonNumber];

  if (!time) {
    return "";
  }

  const [start, end] = time;

  if (format === "compact") {
    return `${start}–${end}`;
  }

  if (format === "hyphen") {
    return `${start} - ${end}`;
  }

  return `${start} — ${end}`;
}

function hasLessonData(lesson) {
  return Boolean(
    String(lesson.name ?? "").trim() &&
      String(lesson.teacher ?? "").trim() &&
      String(lesson.room ?? "").trim(),
  );
}

async function getTimeFormat(env) {
  await env.DB.prepare(
    `
      CREATE TABLE IF NOT EXISTS schedule_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        time_format TEXT NOT NULL DEFAULT 'long'
      )
    `,
  ).run();

  let row = await env.DB.prepare(
    `SELECT time_format FROM schedule_settings WHERE id = 1`,
  ).first();

  if (!row) {
    await env.DB.prepare(
      `INSERT INTO schedule_settings (id, time_format) VALUES (1, 'long')`,
    ).run();

    row = { time_format: "long" };
  }

  return TIME_FORMATS.includes(row.time_format) ? row.time_format : "long";
}

async function updateTimeFormat(env, timeFormat) {
  if (!TIME_FORMATS.includes(timeFormat)) {
    throw new Error("Некорректный формат времени");
  }

  await env.DB.prepare(
    `
      CREATE TABLE IF NOT EXISTS schedule_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        time_format TEXT NOT NULL DEFAULT 'long'
      )
    `,
  ).run();

  await env.DB.prepare(
    `
      INSERT INTO schedule_settings (id, time_format)
      VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET
        time_format = excluded.time_format
    `,
  )
    .bind(timeFormat)
    .run();
}

async function getScheduleUpdatedAt(env) {
  await env.DB.prepare(
    `
      CREATE TABLE IF NOT EXISTS schedule_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        updated_at INTEGER NOT NULL
      )
    `,
  ).run();

  let row = await env.DB.prepare(
    `SELECT updated_at FROM schedule_meta WHERE id = 1`,
  ).first();

  if (!row) {
    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO schedule_meta (id, updated_at) VALUES (1, ?)`,
    )
      .bind(now)
      .run();

    row = { updated_at: now };
  }

  return row.updated_at;
}

async function updateScheduleTimestamp(env) {
  await env.DB.prepare(
    `
      CREATE TABLE IF NOT EXISTS schedule_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        updated_at INTEGER NOT NULL
      )
    `,
  ).run();

  await env.DB.prepare(
    `
      INSERT INTO schedule_meta (id, updated_at)
      VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at
    `,
  )
    .bind(Date.now())
    .run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/schedule" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          `
            SELECT
              id,
              day,
              lesson_number,
              name,
              teacher,
              room,
              time
            FROM lessons
            ORDER BY day, lesson_number
          `,
        ).all();

        const timeFormat = await getTimeFormat(env);
        const lastUpdated = await getScheduleUpdatedAt(env);

        const formattedResults = results.map((lesson) => ({
          ...lesson,
          time: hasLessonData(lesson)
            ? getLessonTime(lesson.lesson_number, timeFormat)
            : "",
        }));

        return json({
          success: true,
          lessons: formattedResults,
          last_updated: lastUpdated,
          time_format: timeFormat,
        });
      } catch (error) {
        return json(
          {
            success: false,
            error: error.message,
          },
          500,
        );
      }
    }

    if (url.pathname === "/api/settings" && request.method === "GET") {
      try {
        const timeFormat = await getTimeFormat(env);

        return json({
          success: true,
          time_format: timeFormat,
        });
      } catch (error) {
        return json(
          {
            success: false,
            error: error.message,
          },
          500,
        );
      }
    }

    if (url.pathname === "/api/settings" && request.method === "PUT") {
      const authenticated = await isAuthenticated(request, env);

      if (!authenticated) {
        return json(
          {
            success: false,
            error: "Необходима авторизация",
          },
          401,
        );
      }

      try {
        const body = await request.json();
        const timeFormat = String(body.time_format ?? "");

        await updateTimeFormat(env, timeFormat);
        await updateScheduleTimestamp(env);

        return json({
          success: true,
          time_format: timeFormat,
        });
      } catch (error) {
        return json(
          {
            success: false,
            error: error.message,
          },
          400,
        );
      }
    }

    if (url.pathname === "/api/auth" && request.method === "GET") {
      const authenticated = await isAuthenticated(request, env);

      return json({
        success: true,
        authenticated,
      });
    }

    if (url.pathname === "/api/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const password = String(body.password ?? "");

        if (!password) {
          return json(
            {
              success: false,
              error: "Введите пароль",
            },
            400,
          );
        }

        if (password !== env.ADMIN_PASSWORD) {
          return json(
            {
              success: false,
              error: "Неверный пароль",
            },
            401,
          );
        }

        const token = await createSessionToken(env.ADMIN_PASSWORD);

        return json(
          {
            success: true,
          },
          200,
          {
            "Set-Cookie":
              `admin_token=${token}; ` +
              `HttpOnly; ` +
              `Secure; ` +
              `SameSite=Strict; ` +
              `Path=/; ` +
              `Max-Age=86400`,
          },
        );
      } catch {
        return json(
          {
            success: false,
            error: "Некорректный запрос",
          },
          400,
        );
      }
    }

    if (url.pathname.startsWith("/api/lesson/") && request.method === "PUT") {
      const authenticated = await isAuthenticated(request, env);

      if (!authenticated) {
        return json(
          {
            success: false,
            error: "Необходима авторизация",
          },
          401,
        );
      }

      try {
        const id = url.pathname.split("/").pop();

        if (!id || !/^\d+$/.test(id)) {
          return json(
            {
              success: false,
              error: "Некорректный ID урока",
            },
            400,
          );
        }

        const body = await request.json();

        const name = String(body.name ?? "").trim();
        const teacher = String(body.teacher ?? "").trim();
        const room = String(body.room ?? "").trim();
        const timeFormat = await getTimeFormat(env);
        const time =
          name && teacher && room
            ? getLessonTime(
                Number(
                  await env.DB.prepare(
                    `SELECT lesson_number FROM lessons WHERE id = ?`,
                  )
                    .bind(Number(id))
                    .first()
                    .then((lesson) => lesson?.lesson_number ?? 0),
                ),
                timeFormat,
              )
            : "";

        await env.DB.prepare(
          `
            UPDATE lessons
            SET
              name = ?,
              teacher = ?,
              room = ?,
              time = ?
            WHERE id = ?
          `,
        )
          .bind(name, teacher, room, time, Number(id))
          .run();

        const lesson = await env.DB.prepare(
          `
            SELECT
              id,
              day,
              lesson_number,
              name,
              teacher,
              room,
              time
            FROM lessons
            WHERE id = ?
          `,
        )
          .bind(Number(id))
          .first();

        if (!lesson) {
          return json(
            {
              success: false,
              error: "Урок не найден",
            },
            404,
          );
        }

        await updateScheduleTimestamp(env);

        return json({
          success: true,
          lesson: {
            ...lesson,
            time: hasLessonData(lesson)
              ? getLessonTime(lesson.lesson_number, timeFormat)
              : "",
          },
        });
      } catch (error) {
        return json(
          {
            success: false,
            error: error.message,
          },
          500,
        );
      }
    }

    if (url.pathname === "/api/activity/token" && request.method === "POST") {
      try {
        const body = await request.json();
        const token = String(body.token ?? "").trim();
        const activityId = String(body.activity_id ?? "").trim();

        if (!token) {
          return json(
            {
              success: false,
              error: "Токен не указан",
            },
            400,
          );
        }

        await env.DB.prepare(
          `
            INSERT INTO activity_tokens (id, token, activity_id, updated_at)
            VALUES (1, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              token = excluded.token,
              activity_id = excluded.activity_id,
              updated_at = excluded.updated_at
          `,
        )
          .bind(token, activityId, Date.now())
          .run();

        return json({
          success: true,
        });
      } catch (error) {
        return json(
          {
            success: false,
            error: error.message,
          },
          500,
        );
      }
    }

    if (url.pathname === "/api/logout" && request.method === "POST") {
      return json(
        {
          success: true,
        },
        200,
        {
          "Set-Cookie":
            "admin_token=; " +
            "HttpOnly; " +
            "Secure; " +
            "SameSite=Strict; " +
            "Path=/; " +
            "Max-Age=0",
        },
      );
    }

    return json(
      {
        success: false,
        message: "Not found",
      },
      404,
    );
  },
};