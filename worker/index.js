const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 часа

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

        return json({
          success: true,
          lessons: results,
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

        const time = String(body.time ?? "").trim();

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

        return json({
          success: true,
          lesson,
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
