const loginSection = document.querySelector("#login-section");
const editorSection = document.querySelector("#editor-section");

const loginForm = document.querySelector("#login-form");
const passwordInput = document.querySelector("#password");
const loginError = document.querySelector("#login-error");

const adminSchedule = document.querySelector("#admin-schedule");
const logoutButton = document.querySelector("#logout-button");
const saveAllButton = document.querySelector("#save-all-button");

const days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginError.textContent = "";

  const password = passwordInput.value.trim();

  if (!password) {
    loginError.textContent = "Введите пароль";
    return;
  }

  try {
    const response = await fetch("/api/login", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      credentials: "include",

      body: JSON.stringify({
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      loginError.textContent = data.error || "Ошибка авторизации";

      return;
    }

    loginSection.classList.add("hidden");
    editorSection.classList.remove("hidden");

    loadSchedule();
  } catch (error) {
    console.error(error);

    loginError.textContent = "Не удалось подключиться к серверу";
  }
});

async function loadSchedule() {
  adminSchedule.innerHTML = `
        <div class="loading">
            Загрузка...
        </div>
    `;

  try {
    const response = await fetch("/api/schedule", {
      method: "GET",
      credentials: "include",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Не удалось загрузить расписание");
    }

    renderSchedule(data.lessons);
    setupRoomInputs();
    setupTimeInputs();
    setupChangeTracking();
    setupDayToggles();
  } catch (error) {
    console.error(error);

    adminSchedule.innerHTML = `
            <div class="error">
                ${escapeHtml(error.message)}
            </div>
        `;
  }
}

function renderSchedule(lessons) {
  adminSchedule.innerHTML = "";

  for (let day = 0; day < 5; day++) {
    const dayLessons = lessons.filter((lesson) => lesson.day === day);

    const column = document.createElement("section");

    column.className = "admin-day";

    column.innerHTML = `
    <button
        type="button"
        class="admin-day-title"
        aria-expanded="false"
    >
        <span>${days[day]}</span>
        <span class="admin-day-arrow"></span>
    </button>

    <div class="admin-lessons">
        ${dayLessons.map(renderLesson).join("")}
    </div>
`;

    adminSchedule.appendChild(column);
  }
}

function setupDayToggles() {
  const dayTitles = document.querySelectorAll(".admin-day-title");

  dayTitles.forEach((title) => {
    const day = title.closest(".admin-day");
    const lessons = day.querySelector(".admin-lessons");

    if (window.innerWidth <= 650) {
      lessons.classList.add("day-collapsed");
    }

    title.addEventListener("click", () => {
      if (window.innerWidth > 650) {
        return;
      }

      const isOpen = title.getAttribute("aria-expanded") === "true";

      title.setAttribute("aria-expanded", String(!isOpen));

      lessons.classList.toggle("day-collapsed", isOpen);
    });
  });
}

function renderLesson(lesson) {
  return `
        <article
            class="admin-lesson"
            data-id="${lesson.id}"
        >

            <div class="admin-lesson-number">
                ${lesson.lesson_number}
            </div>

            <div class="admin-fields">

                <label>
                    <span>Название</span>

                    <input
                        type="text"
                        class="lesson-name"
                        value="${escapeHtml(lesson.name)}"
                        placeholder="Название урока"
                    >
                </label>

                <label>
                    <span>Учитель</span>

                    <input
                        type="text"
                        class="lesson-teacher"
                        value="${escapeHtml(lesson.teacher)}"
                        placeholder="Учитель"
                    >
                </label>

                <label>
                    <span>Кабинет</span>

                    <input
    type="text"
    class="lesson-room"
    value="${escapeHtml(lesson.room)}"
    placeholder="1.19"
    inputmode="numeric"
>
                </label>

                <label>
                    <span>Время</span>

                    <input
    type="text"
    class="lesson-time"
    value="${escapeHtml(lesson.time)}"
    placeholder="09:00 — 09:45"
    inputmode="numeric"
>
                </label>

                <button
    type="button"
    class="save-lesson"
    disabled
>
    Сохранить
</button>

                <div class="save-status"></div>

            </div>

        </article>
    `;
}

function setupRoomInputs() {
  const roomInputs = document.querySelectorAll(".lesson-room");

  roomInputs.forEach((input) => {
    input.addEventListener("input", () => {
      let digits = input.value.replace(/\D/g, "");

      digits = digits.slice(0, 3);

      if (digits.length <= 1) {
        input.value = digits;
        return;
      }

      input.value = `${digits[0]}.${digits.slice(1)}`;
    });

    input.addEventListener("keydown", (event) => {
      const allowedKeys = [
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "Tab",
        "Home",
        "End",
      ];

      if (allowedKeys.includes(event.key)) {
        return;
      }
      if (!/^\d$/.test(event.key)) {
        event.preventDefault();
      }
    });
  });
}

logoutButton.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error(error);
  }

  editorSection.classList.add("hidden");
  loginSection.classList.remove("hidden");

  passwordInput.value = "";
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

adminSchedule.addEventListener("click", async (event) => {
  const button = event.target.closest(".save-lesson");

  if (!button) {
    return;
  }

  const lessonElement = button.closest(".admin-lesson");

  const id = lessonElement.dataset.id;

  const name = lessonElement.querySelector(".lesson-name").value;
  const teacher = lessonElement.querySelector(".lesson-teacher").value;
  let room = lessonElement.querySelector(".lesson-room").value.trim();

  if (/^\d{2,3}$/.test(room)) {
    if (room.length === 2) {
      room = `${room[0]}.${room[1]}`;
    } else if (room.length === 3) {
      room = `${room[0]}.${room.slice(1)}`;
    }
  }
  const time = lessonElement.querySelector(".lesson-time").value;

  const status = lessonElement.querySelector(".save-status");

  button.disabled = true;
  button.textContent = "Сохранение...";
  status.textContent = "";

  try {
    const response = await fetch(`/api/lesson/${id}`, {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      credentials: "include",

      body: JSON.stringify({
        name,
        teacher,
        room,
        time,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Ошибка сохранения");
    }

    status.textContent = "Сохранено";

    lessonElement.querySelectorAll("input").forEach((input) => {
      input.dataset.savedValue = input.value;
    });

    button.disabled = true;
    button.textContent = "Сохранено";
  } catch (error) {
    console.error(error);

    status.textContent = error.message || "Ошибка сохранения";
  } finally {
    button.disabled = false;
    button.textContent = "Сохранить";
  }
});

async function checkAuth() {
  try {
    const response = await fetch("/api/auth", {
      method: "GET",
      credentials: "include",
    });

    const data = await response.json();

    if (data.authenticated) {
      loginSection.classList.add("hidden");
      editorSection.classList.remove("hidden");

      loadSchedule();
    }
  } catch (error) {
    console.error("Ошибка проверки авторизации:", error);
  }
}

checkAuth();

function setupChangeTracking() {
  const lessons = document.querySelectorAll(".admin-lesson");

  lessons.forEach((lesson) => {
    const inputs = lesson.querySelectorAll("input");
    const button = lesson.querySelector(".save-lesson");

    inputs.forEach((input) => {
      input.dataset.savedValue = input.value;

      input.addEventListener("input", () => {
        const changed = Array.from(inputs).some((input) => {
          return input.value !== input.dataset.savedValue;
        });

        button.disabled = !changed;
        button.textContent = changed ? "Сохранить" : "Сохранено";

        const status = lesson.querySelector(".save-status");
        status.textContent = "";
        updateSaveAllButton();
      });
    });
  });
}

saveAllButton.addEventListener("click", async () => {
  const lessons = document.querySelectorAll(".admin-lesson");

  const changedLessons = Array.from(lessons).filter((lesson) => {
    const inputs = lesson.querySelectorAll("input");

    return Array.from(inputs).some((input) => {
      return input.value !== input.dataset.savedValue;
    });
  });

  if (changedLessons.length === 0) {
    return;
  }

  saveAllButton.disabled = true;
  saveAllButton.textContent = "Сохранение...";

  try {
    for (const lessonElement of changedLessons) {
      await saveLesson(lessonElement);
    }

    saveAllButton.textContent = "Сохранено";
  } catch (error) {
    console.error(error);

    saveAllButton.textContent = "Ошибка";
  } finally {
    updateSaveAllButton();
  }
});

async function saveLesson(lessonElement) {
  const id = lessonElement.dataset.id;

  const name = lessonElement.querySelector(".lesson-name").value.trim();
  const teacher = lessonElement.querySelector(".lesson-teacher").value.trim();
  const room = lessonElement.querySelector(".lesson-room").value.trim();
  const time = lessonElement.querySelector(".lesson-time").value.trim();

  const response = await fetch(`/api/lesson/${id}`, {
    method: "PUT",

    headers: {
      "Content-Type": "application/json",
    },

    credentials: "include",

    body: JSON.stringify({
      name,
      teacher,
      room,
      time,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Ошибка сохранения");
  }

  lessonElement.querySelectorAll("input").forEach((input) => {
    input.dataset.savedValue = input.value;
  });

  const button = lessonElement.querySelector(".save-lesson");
  const status = lessonElement.querySelector(".save-status");

  button.disabled = true;
  button.textContent = "Сохранено";

  status.textContent = "Сохранено";
}

function updateSaveAllButton() {
  const lessons = document.querySelectorAll(".admin-lesson");

  const hasChanges = Array.from(lessons).some((lesson) => {
    const inputs = lesson.querySelectorAll("input");

    return Array.from(inputs).some((input) => {
      return input.value !== input.dataset.savedValue;
    });
  });

  saveAllButton.disabled = !hasChanges;

  if (!hasChanges) {
    saveAllButton.textContent = "Сохранить всё";
  }
}

function setupTimeInputs() {
  const timeInputs = document.querySelectorAll(".lesson-time");

  timeInputs.forEach((input) => {
    input.addEventListener("input", () => {
      let value = input.value.replace(/\D/g, "");
      value = value.slice(0, 8);

      if (value.length <= 2) {
        input.value = value;
        return;
      }

      if (value.length <= 4) {
        input.value = `${value.slice(0, 2)}:${value.slice(2)}`;
        return;
      }

      if (value.length <= 6) {
        input.value = `${value.slice(0, 2)}:${value.slice(2, 4)} — ${value.slice(4)}`;
        return;
      }

      input.value =
        `${value.slice(0, 2)}:${value.slice(2, 4)} — ` +
        `${value.slice(4, 6)}:${value.slice(6, 8)}`;
    });

    input.addEventListener("keydown", (event) => {
      const allowedKeys = [
        "Backspace",
        "Delete",
        "ArrowLeft",
        "ArrowRight",
        "Tab",
        "Home",
        "End",
      ];

      if (allowedKeys.includes(event.key)) {
        return;
      }

      if (!/^\d$/.test(event.key)) {
        event.preventDefault();
      }
    });
  });
}
