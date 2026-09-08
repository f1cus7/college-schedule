const lastUpdateElement = document.querySelector("#last-update");

function formatLastUpdate(timestamp) {
    if (!timestamp) {
        return "—";
    }

    return new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(new Date(timestamp));
}

const originalFetch = window.fetch;

window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
        const url = typeof args[0] === "string" ? args[0] : args[0]?.url;

        if (url?.includes("/api/schedule")) {
            const data = await response.clone().json();

            if (data.last_updated && lastUpdateElement) {
                lastUpdateElement.textContent =
                    `Последнее обновление: ${formatLastUpdate(data.last_updated)}`;
            }
        }
    } catch (error) {
        console.error("Ошибка получения даты обновления:", error);
    }

    return response;
};
