(() => {
  const initEstadisticas = (root = document) => {
    const panels = {
      acordes: root.querySelector("#panel-acordes"),
      notas: root.querySelector("#panel-notas"),
    };

    const showPanel = (key) => {
      Object.values(panels).forEach((p) => {
        if (!p) return;
        p.classList.add("hidden");
        p.classList.remove("flex");
      });
      if (panels[key]) {
        panels[key].classList.remove("hidden");
        panels[key].classList.add("flex");
      }
    };

    const hidePanel = (key) => {
      if (panels[key]) {
        panels[key].classList.add("hidden");
        panels[key].classList.remove("flex");
      }
    };

    root.querySelectorAll("[data-toggle-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-toggle-panel");
        if (!key) return;
        const panel = panels[key];
        const isVisible = panel && !panel.classList.contains("hidden");
        if (isVisible) {
          hidePanel(key);
        } else {
          showPanel(key);
        }
      });
    });

    root.querySelectorAll("[data-close-panel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-close-panel");
        if (!key) return;
        hidePanel(key);
      });
    });
  };

  window.initEstadisticas = initEstadisticas;

  if (document.currentScript && document.currentScript.dataset.autorun === "1") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => initEstadisticas(document));
    } else {
      initEstadisticas(document);
    }
  }
})();
