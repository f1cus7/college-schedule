const TIME_MODES = [
  { value: "automatic", label: "Автоматически" },
  { value: "manual", label: "Вручную" },
];

const timeFormatButton = document.querySelector("#time-format-button");
const dayColorsButton = document.querySelector("#day-colors-button");

if (timeFormatButton) {
  let currentMode = "automatic";
  let saving = false;

  function updateButton() {
    const mode = TIME_MODES.find((item) => item.value === currentMode);
    timeFormatButton.textContent = `Время: ${mode?.label ?? "Автоматически"}`;
    document.body.dataset.timeMode = currentMode;
  }

  async function loadTimeMode() {
    try {
      const response = await fetch("/api/settings", { credentials: "include" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Не удалось загрузить режим времени");
      currentMode = TIME_MODES.some((item) => item.value === data.time_mode) ? data.time_mode : "automatic";
      updateButton();
    } catch (error) {
      console.error(error);
    }
  }

  async function saveTimeMode() {
    if (saving) return;
    const nextMode = currentMode === "automatic" ? "manual" : "automatic";
    saving = true;
    timeFormatButton.disabled = true;

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time_mode: nextMode }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Не удалось сохранить режим времени");
      currentMode = data.time_mode;
      updateButton();
      if (typeof loadSchedule === "function") await loadSchedule();
    } catch (error) {
      console.error(error);
      alert(error.message || "Не удалось изменить режим времени");
    } finally {
      saving = false;
      timeFormatButton.disabled = false;
    }
  }

  timeFormatButton.addEventListener("click", saveTimeMode);
  updateButton();
  loadTimeMode();
}

if (dayColorsButton) {
  const storageKey = "admin-day-colors";
  let enabled = localStorage.getItem(storageKey) === "on";

  function updateDayColors() {
    document.body.dataset.dayColors = enabled ? "on" : "off";
    dayColorsButton.textContent = `Цвета дней: ${enabled ? "Вкл" : "Выкл"}`;
  }

  dayColorsButton.addEventListener("click", () => {
    enabled = !enabled;
    localStorage.setItem(storageKey, enabled ? "on" : "off");
    updateDayColors();
  });

  updateDayColors();
}
