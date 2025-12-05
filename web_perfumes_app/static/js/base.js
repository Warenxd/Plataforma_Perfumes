(() => {
  const grid = document.getElementById("perfumes-grid");
  const searchInput = document.getElementById("search");
  const filtersForm = document.getElementById("filters-form");
  const supportsFetch = typeof window.fetch === "function";
  const filterConfigs = [
    {
      name: "marca",
      selector: 'input[name="marca"]',
      clearButton: document.getElementById("clear-brand-filters"),
    },
    {
      name: "genero",
      selector: 'input[name="genero"]',
      clearButton: document.getElementById("clear-gender-filters"),
    },
    {
      name: "estacion",
      selector: 'input[name="estacion"]',
      clearButton: document.getElementById("clear-season-filters"),
    },
  ];

  if (grid && supportsFetch) {
    let isFetching = false;
    let searchDebounce = null;
    const loaderClasses = ["opacity-50", "pointer-events-none"];

    const setLoading = (state) => {
      isFetching = state;
      grid.classList[state ? "add" : "remove"](...loaderClasses);
    };

    const replaceContent = (html) => {
      grid.innerHTML = html;
    };

    const syncSearchInputFromUrl = (url) => {
      if (!searchInput) {
        return;
      }
      try {
        const parsed = new URL(url, window.location.origin);
        searchInput.value = parsed.searchParams.get("q") || "";
      } catch (error) {
        console.warn("No se pudo sincronizar la barra de busqueda", error);
      }
    };

    const syncFiltersFromUrl = (url) => {
      if (!filtersForm) {
        return;
      }
      try {
        const parsed = new URL(url, window.location.origin);
        filterConfigs.forEach(({ name, selector }) => {
          const values = parsed.searchParams.getAll(name);
          if (values.length === 0) {
            filtersForm.querySelectorAll(selector).forEach((input) => {
              input.checked = false;
            });
            return;
          }
          filtersForm.querySelectorAll(selector).forEach((input) => {
            input.checked = values.includes(input.value);
          });
        });
      } catch (error) {
        console.warn("No se pudieron sincronizar los filtros", error);
      }
    };

    const pushState = (url, html, replace = false) => {
      const state = { html };
      if (replace) {
        window.history.replaceState(state, "", url);
      } else {
        window.history.pushState(state, "", url);
      }
    };

    const fetchPage = async (url, { push = true, replaceState = false } = {}) => {
      if (isFetching) {
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(url, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (!response.ok) {
          throw new Error("Error al cargar la pagina " + response.status);
        }
        const data = await response.json();
        if (!data || typeof data.html !== "string") {
          throw new Error("Respuesta invalida del servidor");
        }
        replaceContent(data.html);
        syncSearchInputFromUrl(url);
        syncFiltersFromUrl(url);
        if (push) {
          pushState(url, data.html, replaceState);
        }
      } catch (error) {
        console.error(error);
        window.location.href = url;
      } finally {
        setLoading(false);
      }
    };

    grid.addEventListener("click", (event) => {
      const link = event.target.closest(".pagination-link");
      if (!link || event.defaultPrevented || isFetching) {
        return;
      }

      const isModified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
      if (event.button !== 0 || isModified) {
        return;
      }

      event.preventDefault();
      fetchPage(link.href);
    });

    if (searchInput) {
      let lastValue = searchInput.value;
      searchInput.setAttribute("autocomplete", "off");

      searchInput.addEventListener("input", () => {
        const currentValue = searchInput.value;
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
          const trimmed = currentValue.trim();
          if (trimmed === lastValue.trim()) {
            return;
          }
          lastValue = currentValue;
          const url = new URL(window.location.href);
          if (trimmed) {
            url.searchParams.set("q", trimmed);
          } else {
            url.searchParams.delete("q");
          }
          url.searchParams.delete("page");
          fetchPage(url.toString());
        }, 350);
      });
    }

    const applyFiltersFromSidebar = () => {
      if (!filtersForm) {
        return;
      }
      const url = new URL(window.location.href);
      filterConfigs.forEach(({ name, selector }) => {
        url.searchParams.delete(name);
        filtersForm
          .querySelectorAll(`${selector}:checked`)
          .forEach((input) => {
            url.searchParams.append(name, input.value);
          });
      });
      if (searchInput) {
        const trimmed = searchInput.value.trim();
        if (trimmed) {
          url.searchParams.set("q", trimmed);
        } else {
          url.searchParams.delete("q");
        }
      }
      url.searchParams.delete("page");
      fetchPage(url.toString());
    };

    const isFilterInput = (element) => {
      if (!element) {
        return false;
      }
      return filterConfigs.some(({ selector }) => element.matches(selector));
    };

    if (filtersForm) {
      filtersForm.addEventListener("change", (event) => {
        if (isFilterInput(event.target)) {
          event.preventDefault();
          applyFiltersFromSidebar();
        }
      });

      filtersForm.addEventListener("submit", (event) => {
        event.preventDefault();
        applyFiltersFromSidebar();
      });
    }

    filterConfigs.forEach(({ selector, clearButton }) => {
      if (clearButton && filtersForm) {
        clearButton.addEventListener("click", (event) => {
          event.preventDefault();
          filtersForm
            .querySelectorAll(selector)
            .forEach((input) => (input.checked = false));
          applyFiltersFromSidebar();
        });
      }
    });

    window.addEventListener("popstate", (event) => {
      if (event.state && typeof event.state.html === "string") {
        replaceContent(event.state.html);
        syncSearchInputFromUrl(window.location.href);
        syncFiltersFromUrl(window.location.href);
      } else {
        window.location.reload();
      }
    });

    pushState(window.location.href, grid.innerHTML, true);
    syncSearchInputFromUrl(window.location.href);
    syncFiltersFromUrl(window.location.href);
  }

  const refreshForm = document.getElementById("refresh-perfumes-form");
  const refreshButton = document.getElementById("refresh-perfumes-button");
  const refreshOverlay = document.getElementById("refresh-overlay");
  const refreshStageText = document.getElementById("refresh-stage-text");
  const refreshStageLabel = document.getElementById("refresh-stage-label");
  const refreshProgressBar = document.getElementById("refresh-progress-bar");
  const refreshErrorText = document.getElementById("refresh-error-text");
  const refreshStatusUrl = refreshForm ? refreshForm.dataset.statusUrl : null;
  let refreshProgressInterval = null;
  let currentProgressValue = 0;
  let refreshStatusInterval = null;
  let activeStatusKey = null;

  const showOverlay = () => {
    if (!refreshOverlay) {
      return;
    }
    refreshOverlay.classList.remove("hidden");
    refreshOverlay.classList.add("flex");
  };

  const hideOverlay = () => {
    if (!refreshOverlay) {
      return;
    }
    refreshOverlay.classList.add("hidden");
    refreshOverlay.classList.remove("flex");
  };

  const updateStageText = (title, detail) => {
    if (refreshStageText) {
      refreshStageText.textContent = title;
    }
    if (refreshStageLabel) {
      refreshStageLabel.textContent = detail || "";
    }
  };

  const updateProgress = (value) => {
    currentProgressValue = value;
    if (refreshProgressBar) {
      refreshProgressBar.style.width = `${value}%`;
    }
  };

  const stopProgressAnimation = () => {
    if (refreshProgressInterval) {
      clearInterval(refreshProgressInterval);
      refreshProgressInterval = null;
    }
  };

  const animateProgressUntil = (target) => {
    if (!refreshProgressBar) {
      return;
    }
    stopProgressAnimation();
    refreshProgressInterval = setInterval(() => {
      const ceiling = Math.max(target - 3, 0);
      if (currentProgressValue >= ceiling) {
        return;
      }
      updateProgress(Math.min(currentProgressValue + 1, ceiling));
    }, 250);
  };

  const statusFormatters = {
    scraping: (status) => {
      if (!status) {
        return null;
      }
      if (status.state === "error") {
        return status.error || "Error en scraping.";
      }
      const parts = [];
      if (status.category_label) {
        parts.push(status.category_label);
      }
      if (status.page) {
        parts.push(`Página ${status.page}`);
      }
      if (status.url) {
        parts.push(status.url);
      }
      return parts.join(" · ") || null;
    },
    urls: (status) => {
      if (!status) {
        return null;
      }
      if (status.state === "error") {
        return status.error || "Error al normalizar URLs.";
      }
      const total = Number(status.total) || 0;
      const currentRaw = Number(status.current) || 0;
      const current = total ? Math.min(currentRaw, total) : currentRaw;
      const parts = [];
      if (current) {
        parts.push(total ? `Perfume ${current}/${total}` : `Perfume ${current}`);
      } else if (total) {
        parts.push(`0/${total}`);
      }
      if (status.perfume) {
        parts.push(status.perfume);
      }
      return parts.join(" · ") || null;
    },
  };

  const updateStatusLabel = (stageKey, payload) => {
    if (!stageKey || stageKey !== activeStatusKey || !refreshStageLabel) {
      return;
    }
    const formatter = statusFormatters[stageKey];
    if (!formatter) {
      return;
    }
    const statusData = payload && typeof payload.status === "object" ? payload.status : null;
    const label = formatter(statusData);
    if (label) {
      refreshStageLabel.textContent = label;
    }
  };

  const stopStatusPolling = () => {
    if (refreshStatusInterval) {
      clearInterval(refreshStatusInterval);
      refreshStatusInterval = null;
    }
    activeStatusKey = null;
  };

  const startStatusPolling = (stageKey) => {
    if (!refreshStatusUrl || !stageKey || !supportsFetch) {
      return;
    }
    stopStatusPolling();
    activeStatusKey = stageKey;
    const poll = async () => {
      try {
        const url = new URL(refreshStatusUrl, window.location.origin);
        url.searchParams.set("stage", stageKey);
        url.searchParams.set("_", Date.now());
        const response = await fetch(url.toString(), {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json().catch(() => null);
        if (!payload || payload.ok === false) {
          return;
        }
        updateStatusLabel(stageKey, payload);
      } catch (error) {
        console.warn("No se pudo consultar el estado del refresco", error);
      }
    };
    poll();
    refreshStatusInterval = setInterval(poll, 1000);
  };

  const postRefreshStage = async (stage) => {
    if (!refreshForm) {
      return null;
    }
    const csrfInput = refreshForm.querySelector('input[name="csrfmiddlewaretoken"]');
    if (!csrfInput) {
      throw new Error("Token CSRF no encontrado");
    }
    const formData = new FormData();
    formData.append("csrfmiddlewaretoken", csrfInput.value);
    formData.append("stage", stage);
    const response = await fetch(refreshForm.action, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      throw new Error((data && data.error) || "Error inesperado");
    }
    return data;
  };

  const refreshStages = [
    {
      key: "scraping",
      title: "Recolectando perfumes...",
      detail: "Conectando con Silk Perfumes.",
      progress: 45,
      statusKey: "scraping",
      formatter: (data) =>
        `Creados ${data.creados || 0}, actualizados ${data.actualizados || 0}, errores ${data.errores || 0}.`,
    },
    {
      key: "urls",
      title: "Recolectando URLs de Fragrantica...",
      detail: "Buscando coincidencias en Fragrantica.",
      progress: 85,
      statusKey: "urls",
      formatter: (data) => `${data.urls_actualizadas || 0} URLs normalizadas.`,
    },
  ];

  const runRefreshWorkflow = async () => {
    if (!refreshForm) {
      return;
    }
    showOverlay();
    updateProgress(15);
    updateStageText("Preparando actualización...", "Conectando con el servidor.");
    refreshErrorText && refreshErrorText.classList.add("hidden");
    refreshErrorText && (refreshErrorText.textContent = "");
    if (refreshButton) {
      refreshButton.disabled = true;
    }
    try {
      for (const stage of refreshStages) {
        updateStageText(stage.title, stage.detail);
        animateProgressUntil(stage.progress);
        if (stage.statusKey) {
          startStatusPolling(stage.statusKey);
        }
        const data = await postRefreshStage(stage.key);
        if (stage.statusKey) {
          stopStatusPolling();
        }
        stopProgressAnimation();
        updateProgress(stage.progress);
        updateStageText(stage.title, stage.formatter ? stage.formatter(data) : "Etapa completada.");
      }
      updateStageText("Actualización completada", "Refrescando la vista con los nuevos datos...");
      updateProgress(100);
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (error) {
      stopProgressAnimation();
      stopStatusPolling();
      const message = error && error.message ? error.message : "Error inesperado.";
      updateStageText("Error durante la actualización", "Intenta nuevamente en unos momentos.");
      if (refreshErrorText) {
        refreshErrorText.textContent = message;
        refreshErrorText.classList.remove("hidden");
      }
      updateProgress(0);
      if (refreshButton) {
        refreshButton.disabled = false;
      }
      setTimeout(() => {
        hideOverlay();
        if (refreshErrorText) {
          refreshErrorText.classList.add("hidden");
          refreshErrorText.textContent = "";
        }
      }, 2500);
    }
  };

  if (refreshForm && refreshOverlay && supportsFetch) {
    refreshForm.addEventListener("submit", (event) => {
      event.preventDefault();
      runRefreshWorkflow();
    });
  }
})();
