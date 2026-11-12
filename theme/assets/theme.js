(() => {
"use strict";

document.documentElement.classList.add("js");

function createDateFormatter(options) {
  const styles = {};
  if (options.dateStyle && options.dateStyle !== "none") {
    styles.dateStyle = options.dateStyle;
  }
  if (options.timeStyle && options.timeStyle !== "none") {
    styles.timeStyle = options.timeStyle;
  }
  if (!Object.keys(styles).length) {
    return { format: () => "" };
  }

  if (!window.Intl || !Intl.DateTimeFormat) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(undefined, styles);
  } catch {
    return null;
  }
}

const localDateFormatter = createDateFormatter({
  dateStyle: document.documentElement.dataset.zpDateStyle || "medium",
});

const localDateTimeFormatter = createDateFormatter({
  dateStyle: document.documentElement.dataset.zpDateStyle || "medium",
  timeStyle: document.documentElement.dataset.zpTimeStyle || "none",
});

function enhanceTimeElement(time, formatter) {
  if (!(time instanceof HTMLTimeElement) || !formatter) {
    return;
  }

  const value = time.getAttribute("datetime");
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return;
  }

  if (!time.getAttribute("title")) {
    time.setAttribute("title", value);
  }
  time.textContent = formatter.format(date);
}

function enhanceLocalTimes(root = document) {
  root.querySelectorAll("time[data-zp-local-date]").forEach((time) => {
    enhanceTimeElement(time, localDateFormatter);
  });

  root.querySelectorAll("time[data-zp-local-date-time]").forEach((time) => {
    enhanceTimeElement(time, localDateTimeFormatter);
  });
}

enhanceLocalTimes();
})();
