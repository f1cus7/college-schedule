const days = [
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница"
];

let currentMobileDay = new Date().getDay() - 1;
let lessonSheetTimer = null;
let lessonSheetShownFor = null;
let lessonSheetDismissedFor = null;

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
updateLessonSheet();

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

function getLessonTime(lesson) {
    if (!lesson?.time) {
        return null;
    }

    const match = lesson.time.match(
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
}


function getCurrentLesson() {
    const now = new Date();

    const currentDay = now.getDay() - 1;

    if (currentDay < 0 || currentDay > 4) {
        return null;
    }

    const currentMinutes =
        now.getHours() * 60 + now.getMinutes();

    const currentSeconds =
        now.getSeconds();

    const currentTotalSeconds =
        currentMinutes * 60 + currentSeconds;

    const lessonsToday = (window.currentLessons || [])
        .filter(lesson =>
            lesson.day === currentDay &&
            lesson.time
        );

    for (const lesson of lessonsToday) {
        const time = getLessonTime(lesson);

        if (!time) {
            continue;
        }

        const startSeconds = time.start * 60;
        const endSeconds = time.end * 60;

        if (
            currentTotalSeconds >= startSeconds &&
            currentTotalSeconds < endSeconds
        ) {
            return {
                lesson,
                startSeconds,
                endSeconds,
                currentTotalSeconds
            };
        }
    }

    return null;
}


function formatRemaining(seconds) {
    seconds = Math.max(0, Math.floor(seconds));

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return (
        `${String(minutes).padStart(2, "0")}:` +
        `${String(remainingSeconds).padStart(2, "0")}`
    );
}


function updateLessonSheet() {
    if (window.innerWidth > 650) {
        return;
    }

    const sheet = document.querySelector("#lesson-sheet");
    const title = document.querySelector("#sheet-lesson-name");
    const meta = document.querySelector("#sheet-lesson-meta");
    const remaining = document.querySelector("#sheet-remaining");
    const progress = document.querySelector("#lesson-progress-fill");

    if (!sheet || !title || !meta || !remaining || !progress) {
        return;
    }

    const current = getCurrentLesson();

    if (!current) {
        hideLessonSheet();
        return;
    }

    const {
        lesson,
        startSeconds,
        endSeconds,
        currentTotalSeconds
    } = current;

    const remainingSeconds =
        endSeconds - currentTotalSeconds;

    const duration =
        endSeconds - startSeconds;

    const elapsed =
        currentTotalSeconds - startSeconds;

    const percent = Math.min(
        100,
        Math.max(
            0,
            (elapsed / duration) * 100
        )
    );

    title.textContent = lesson.name || "Урок";

    meta.textContent = [
        lesson.teacher,
        lesson.room
    ]
        .filter(Boolean)
        .join(" · ");

    remaining.textContent =
        `${formatRemaining(remainingSeconds)} мин`;

    progress.style.width = `${percent}%`;

    const lessonId = lesson.id;

    // Новый урок
    if (lessonSheetShownFor !== lessonId) {
        lessonSheetShownFor = lessonId;

        setTimeout(() => {
            // Не показываем, если пользователь уже
            // успел закрыть именно этот урок
            if (lessonSheetDismissedFor !== lessonId) {
                showLessonSheet();
            }
        }, 2000);
    }
}


function showLessonSheet() {
    if (window.innerWidth > 650) {
        return;
    }

    const sheet = document.querySelector("#lesson-sheet");

    if (!sheet) {
        return;
    }

    sheet.classList.add("visible");
}


function hideLessonSheet() {
    const sheet = document.querySelector("#lesson-sheet");

    if (!sheet) {
        return;
    }

    sheet.classList.remove("visible");
}


function setupLessonSheet() {
    const sheet = document.querySelector("#lesson-sheet");
    const closeButton = document.querySelector("#lesson-sheet-close");

    if (!sheet || !closeButton) {
        return;
    }

    closeButton.addEventListener("click", () => {
        const current = getCurrentLesson();

        if (current) {
            lessonSheetDismissedFor =
                current.lesson.id;
        }

        hideLessonSheet();
    });


    let startY = 0;
    let currentY = 0;
    let dragging = false;

    sheet.addEventListener(
        "touchstart",
        event => {
            startY = event.touches[0].clientY;
            currentY = startY;
            dragging = true;

            sheet.style.transition = "none";
        },
        {
            passive: true
        }
    );


    sheet.addEventListener(
        "touchmove",
        event => {
            if (!dragging) {
                return;
            }

            currentY = event.touches[0].clientY;

            const deltaY =
                Math.max(0, currentY - startY);

            sheet.style.transform =
                `translateY(${deltaY}px)`;
        },
        {
            passive: true
        }
    );


    sheet.addEventListener(
        "touchend",
        () => {
            if (!dragging) {
                return;
            }

            dragging = false;

            const deltaY =
                currentY - startY;

            sheet.style.transition =
                "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)";

            if (deltaY > 80) {
                const current = getCurrentLesson();

                if (current) {
                    lessonSheetDismissedFor =
                        current.lesson.id;
                }

                hideLessonSheet();

                sheet.style.transform = "";
            } else {
                sheet.style.transform = "";
            }
        }
    );
}


setupLessonSheet();



setInterval(() => {
    loadSchedule();
}, 60000);

setInterval(() => {
    updateLessonSheet();
}, 1000);

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js")
            .then(registration => {
                console.log(
                    "Service Worker зарегистрирован:",
                    registration.scope
                );
            })
            .catch(error => {
                console.error(
                    "Ошибка регистрации Service Worker:",
                    error
                );
            });
    });
}