const TIME_FORMATS = [
  {
    value: "long",
    label: "09:00 — 09:45",
  },
  {
    value: "compact",
    label: "09:00–09:45",
  },
  {
    value: "hyphen",
    label: "09:00 - 09:45",
  },
];

const timeFormatButton = document.querySelector("#time-format-button");

if (timeFormatButton) {
  let currentFormat = "long";
  let saving = false;

  function updateButton() {
    const format = TIME_FORMATS.find((item) => item.value === currentFormat);

    timeFormatButton.textContent = `Формат: ${format?.label ?? TIME_FORMATS[0].label}`;
  }

  async function loadTimeFormat() {
    try {
      const response = await fetch("/api/settings", {
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Не удалось загрузить формат времени");
      }

      currentFormat = TIME_FORMATS.some((item) => item.value === data.time_format)
        ? data.time_format
        : "long";

      updateButton();
    } catch (error) {
      console.error(error);
    }
  }

  async function saveTimeFormat() {
    if (saving) {
      return;
    }

    const currentIndex = TIME_FORMATS.findIndex(
      (item) => item.value === currentFormat,
    );

    const nextIndex = (currentIndex + 1) % TIME_FORMATS.length;
    const nextFormat = TIME_FORMATS[nextIndex].value;

    saving = true;
    timeFormatButton.disabled = true;

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          time_format: nextFormat,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Не удалось сохранить формат времени");
      }

      currentFormat = data.time_format;
      updateButton();

      if (typeof loadSchedule === "function") {
        await loadSchedule();
      }
    } catch (error) {
      console.error(error);
      alert(error.message || "Не удалось изменить формат времени");
    } finally {
      saving = false;
      timeFormatButton.disabled = false;
    }
  }

  timeFormatButton.addEventListener("click", saveTimeFormat);
  updateButton();
  loadTimeFormat();
}
