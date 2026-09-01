const days = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница"
];

let currentMobileDay = new Date().getDay() - 1;

if (currentMobileDay < 0 || currentMobileDay > 4) {
    currentMobileDay = 0;
}

const scheduleElement = document.querySelector("#schedule");

async function loadSchedule() {
    try {
        const response = await fetch("/api/schedule");

        if (!response.ok) {
            throw new Error("Ошибка API");
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error("Не удалось получить расписание");
        }

        renderSchedule(data.lessons);
    } catch (error) {
        console.error(error);

        scheduleElement.innerHTML = `
            <div class="error">
                Не удалось загрузить расписание
            </div>
        `;
    }
}

function renderSchedule(lessons) {
    window.currentLessons = lessons;

    scheduleElement.innerHTML = "";

    for (let day = 0; day < 5; day++) {
        const dayLessons = lessons.filter(
            lesson => lesson.day === day
        );

        const column = document.createElement("section");

column.className = "day";

if (day === new Date().getDay() - 1) {
    column.classList.add("current-day");
}

        column.innerHTML = `
            <div class="day-title">
                ${days[day]}
            </div>

            <div class="lessons">
                ${dayLessons.map(renderLesson).join("")}
            </div>
        `;

        scheduleElement.appendChild(column);
    }
    createMobileDays();
    scrollToCurrentLesson();
}

function createMobileDays() {
    const mobileDays = document.querySelector("#mobile-days");

    mobileDays.innerHTML = "";

    days.forEach((day, index) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "mobile-day";

        if (index === currentMobileDay) {
            button.classList.add("active");
        }

        button.textContent = day.slice(0, 2);

        button.addEventListener("click", () => {
            currentMobileDay = index;

            document.querySelectorAll(".day").forEach((column, columnIndex) => {
                column.classList.toggle(
                    "mobile-hidden",
                    columnIndex !== currentMobileDay
                );
            });

            document.querySelectorAll(".mobile-day").forEach((dayButton, buttonIndex) => {
                dayButton.classList.toggle(
                    "active",
                    buttonIndex === currentMobileDay
                );
            });
        });

        mobileDays.appendChild(button);
    });

    document.querySelectorAll(".day").forEach((column, index) => {
        column.classList.toggle(
            "mobile-hidden",
            index !== currentMobileDay
        );
    });
}

function renderLesson(lesson) {
    const isEmpty =
        !lesson.name &&
        !lesson.teacher &&
        !lesson.room &&
        !lesson.time;

    let lessonClass = "";

if (isCurrentLesson(lesson)) {
    lessonClass = " lesson-current";
} else if (isPassedLesson(lesson)) {
    lessonClass = " lesson-passed";
}

    if (isEmpty) {
        return `
            <article class="lesson lesson-empty">
                <div class="lesson-number">
                    ${lesson.lesson_number}
                </div>

                <div class="lesson-content">
                    <div class="empty-label">
                        Окно
                    </div>
                </div>
            </article>
        `;
    }

    return `
        <article class="lesson${lessonClass}">
            <div class="lesson-number">
                ${lesson.lesson_number}
            </div>

            <div class="lesson-content">
                <div class="lesson-name">
                    ${escapeHtml(lesson.name)}
                </div>

                ${
                    lesson.teacher || lesson.room
                        ? `
                            <div class="lesson-meta">
                                ${escapeHtml(lesson.teacher)}
                                ${
                                    lesson.teacher && lesson.room
                                        ? " · "
                                        : ""
                                }
                                ${escapeHtml(lesson.room)}
                            </div>
                        `
                        : ""
                }
            </div>

            ${
                lesson.time
                    ? `
                        <div class="lesson-time">
                            ${escapeHtml(lesson.time)}
                        </div>
                    `
                    : ""
            }
        </article>
    `;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

loadSchedule();

function isCurrentLesson(lesson) {
    const now = new Date();

    const currentDay = now.getDay() - 1;

    if (currentDay < 0 || currentDay > 4) {
        return false;
    }

    if (lesson.day !== currentDay || !lesson.time) {
        return false;
    }

    const parseTime = (time) => {
        const match = time.match(
            /^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/
        );

        if (!match) {
            return null;
        }

        return {
            start:
                Number(match[1]) * 60 +
                Number(match[2]),

            end:
                Number(match[3]) * 60 +
                Number(match[4])
        };
    };

    const currentMinutes =
        now.getHours() * 60 + now.getMinutes();

    const currentTime = parseTime(lesson.time);

    if (!currentTime) {
        return false;
    }

    const lessonsToday = (window.currentLessons || [])
        .filter(item =>
            item.day === currentDay &&
            item.time
        );

    const activeLesson = lessonsToday.find(item => {
        const time = parseTime(item.time);

        return (
            time &&
            currentMinutes >= time.start &&
            currentMinutes < time.end
        );
    });
    if (activeLesson) {
        return activeLesson.id === lesson.id;
    }
    const nextLesson = lessonsToday
        .map(item => {
            const time = parseTime(item.time);

            return time
                ? {
                    lesson: item,
                    start: time.start
                }
                : null;
        })
        .filter(Boolean)
        .filter(item => item.start > currentMinutes)
        .sort((a, b) => a.start - b.start)[0];

    return nextLesson?.lesson.id === lesson.id;
}

setInterval(() => {
    loadSchedule();
}, 60000);

function scrollToCurrentLesson() {
    if (window.innerWidth > 650) {
        return;
    }

    const currentLesson = document.querySelector(".lesson-current");

    if (!currentLesson) {
        return;
    }

    setTimeout(() => {
        currentLesson.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }, 200);
}

function isPassedLesson(lesson) {
    const now = new Date();

    const currentDay = now.getDay() - 1;

    if (currentDay < 0 || currentDay > 4) {
        return false;
    }

    if (lesson.day !== currentDay || !lesson.time) {
        return false;
    }

    const match = lesson.time.match(
        /^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/
    );

    if (!match) {
        return false;
    }

    const endHour = Number(match[3]);
    const endMinute = Number(match[4]);

    const currentMinutes =
        now.getHours() * 60 + now.getMinutes();

    const endMinutes =
        endHour * 60 + endMinute;

    return currentMinutes >= endMinutes;
}