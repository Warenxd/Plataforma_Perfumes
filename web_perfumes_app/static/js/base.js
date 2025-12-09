(() => {
  const grid = document.getElementById("perfumes-grid");
  const searchInput = document.getElementById("search");
  const filtersForm = document.getElementById("filters-form");
  const totalPerfumesCount = document.getElementById("total-perfumes-count");
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
    {
      name: "tienda",
      selector: 'input[name="tienda"]',
      clearButton: document.getElementById("clear-store-filters"),
    },
  ];

  const COMPARISON_STORAGE_KEY = "perfumes_comparar";
  const comparisonTableBody = document.getElementById("comparison-table-body");
  const comparisonCount = document.getElementById("comparison-count");
  const comparisonClearButton = document.getElementById("comparison-clear");
  const comparisonSection = document.getElementById("comparison-section");
  const comparisonPanel = document.getElementById("comparison-panel");
  const comparisonToggle = document.getElementById("comparison-toggle");
  const comparisonClose = document.getElementById("comparison-close");
  const comparisonToggleCount = document.getElementById("comparison-toggle-count");
  const formatPriceCLP = (value) => {
    const number = Number(value) || 0;
    try {
      return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(number);
    } catch (error) {
      return `$${number.toLocaleString("es-CL")}`;
    }
  };
  const comparisonItems = (() => {
    try {
      const stored = localStorage.getItem(COMPARISON_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item && item.id);
      }
    } catch (error) {
      console.warn("No se pudo leer la lista de comparación", error);
    }
    return [];
  })();

  const saveComparison = () => {
    try {
      localStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(comparisonItems));
    } catch (error) {
      console.warn("No se pudo guardar la lista de comparación", error);
    }
  };

  const syncCompareButtons = () => {
    if (!grid) {
      return;
    }
    const ids = new Set(comparisonItems.map((item) => String(item.id)));
    grid.querySelectorAll(".compare-btn").forEach((button) => {
      const card = button.closest(".flip-card");
      if (!card) {
        return;
      }
      const id = card.dataset.perfumeId;
      const isAdded = id && ids.has(String(id));
      button.classList.toggle("is-added", Boolean(isAdded));
      button.disabled = Boolean(isAdded);
      button.textContent = isAdded ? "Agregado" : "Agregar para comparar +";
    });
  };

  const updateComparisonCounters = () => {
    const total = comparisonItems.length;
    if (comparisonCount) {
      comparisonCount.textContent = total;
    }
    if (comparisonToggleCount) {
      comparisonToggleCount.textContent = total;
    }
  };

  const renderComparisonTable = () => {
    updateComparisonCounters();
    if (!comparisonTableBody) {
      return;
    }
    comparisonTableBody.innerHTML = "";
    if (comparisonItems.length === 0) {
      comparisonTableBody.innerHTML =
        '<tr class="comparison-row"><td colspan="3" class="text-center text-slate-500 py-4 text-sm">Aún no agregas perfumes para comparar.</td></tr>';
    } else {
      comparisonItems.forEach((item) => {
        const row = document.createElement("tr");
        row.className = "comparison-row";
        const perfumeCell = document.createElement("td");
        const perfumeWrapper = document.createElement("div");
        perfumeWrapper.className = "flex items-center gap-3";

        const thumbHolder = document.createElement("div");
        thumbHolder.className = "flex h-12 w-12 items-center justify-center";

        if (item.imagen) {
          const img = document.createElement("img");
          img.src = item.imagen;
          img.alt = item.nombre || "";
          img.className = "comparison-thumb";
          thumbHolder.appendChild(img);
        } else {
          const fallback = document.createElement("div");
          fallback.className = "comparison-thumb flex items-center justify-center text-xs text-slate-500";
          fallback.textContent = "N/A";
          thumbHolder.appendChild(fallback);
        }

        const perfumeInfo = document.createElement("div");
        perfumeInfo.className = "leading-tight";
        const nameEl = document.createElement("p");
        nameEl.className = "text-sm font-semibold text-slate-800";
        nameEl.textContent = item.nombre || "Perfume";
        const brandEl = document.createElement("p");
        brandEl.className = "text-xs text-slate-500";
        brandEl.textContent = item.marca || "";
        perfumeInfo.append(nameEl, brandEl);

        perfumeWrapper.append(thumbHolder, perfumeInfo);
        perfumeCell.appendChild(perfumeWrapper);

        const priceCell = document.createElement("td");
        priceCell.className = "text-sm font-semibold text-slate-800 whitespace-nowrap align-middle";
        priceCell.textContent = formatPriceCLP(item.precio);

        const actionsCell = document.createElement("td");
        actionsCell.className = "text-right align-middle";
        const actionsWrapper = document.createElement("div");
        actionsWrapper.className = "flex justify-end gap-2";

        if (item.url) {
          const viewLink = document.createElement("a");
          viewLink.href = item.url;
          viewLink.target = "_blank";
          viewLink.rel = "noopener";
          viewLink.className = "text-xs font-semibold text-indigo-600 hover:text-indigo-500";
          viewLink.textContent = "Ver";
          actionsWrapper.appendChild(viewLink);
        }

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "text-xs font-semibold text-rose-600 hover:text-rose-500";
        removeButton.dataset.removeId = item.id;
        removeButton.textContent = "Quitar";
        actionsWrapper.appendChild(removeButton);

        actionsCell.appendChild(actionsWrapper);

        const tiendaLine = document.createElement("p");
        tiendaLine.className = "text-xs text-slate-500";
        tiendaLine.textContent = item.tienda ? `Tienda: ${item.tienda}` : "Tienda: -";
        perfumeInfo.appendChild(tiendaLine);

        row.append(perfumeCell, priceCell, actionsCell);
        comparisonTableBody.appendChild(row);
      });
    }
    syncCompareButtons();
  };

  const addToComparison = (payload) => {
    if (!payload || !payload.id) {
      return;
    }
    const exists = comparisonItems.some((item) => String(item.id) === String(payload.id));
    if (exists) {
      syncCompareButtons();
      return;
    }
    const wasEmpty = comparisonItems.length === 0;
    comparisonItems.push({
      id: String(payload.id),
      nombre: payload.nombre || "",
      marca: payload.marca || "",
      precio: payload.precio || 0,
      tienda: payload.tienda || "",
      url: payload.url || "",
      imagen: payload.imagen || "",
    });
    saveComparison();
    renderComparisonTable();
    if (wasEmpty) {
      if (comparisonPanel) {
        comparisonPanel.classList.remove("hidden");
      } else if (comparisonSection) {
        comparisonSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const removeFromComparison = (id) => {
    const initialLength = comparisonItems.length;
    for (let i = comparisonItems.length - 1; i >= 0; i -= 1) {
      if (String(comparisonItems[i].id) === String(id)) {
        comparisonItems.splice(i, 1);
      }
    }
    if (comparisonItems.length !== initialLength) {
      saveComparison();
      renderComparisonTable();
    }
  };

  const handleCompareButton = (button) => {
    const card = button.closest(".flip-card");
    if (!card) {
      return;
    }
    const id = card.dataset.perfumeId;
    const nombre = card.dataset.perfumeNombre;
    const marca = card.dataset.perfumeMarca;
    const tienda = card.dataset.perfumeTienda;
    const url = card.dataset.perfumeUrl;
    const imagen = card.dataset.perfumeImagen;
    const precio = Number(card.dataset.perfumePrecio || 0);
    addToComparison({
      id,
      nombre,
      marca,
      tienda,
      url,
      imagen,
      precio,
    });
  };

  if (comparisonClearButton) {
    comparisonClearButton.addEventListener("click", () => {
      if (comparisonItems.length === 0) {
        return;
      }
      comparisonItems.splice(0, comparisonItems.length);
      saveComparison();
      renderComparisonTable();
    });
  }

  if (comparisonToggle && comparisonPanel) {
    comparisonToggle.addEventListener("click", () => {
      const isHidden = comparisonPanel.classList.contains("hidden");
      if (isHidden) {
        comparisonPanel.classList.remove("hidden");
      } else {
        comparisonPanel.classList.add("hidden");
      }
    });
  }

  if (comparisonClose && comparisonPanel) {
    comparisonClose.addEventListener("click", () => {
      comparisonPanel.classList.add("hidden");
    });
  }

  if (comparisonTableBody) {
    comparisonTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-id]");
      if (!button) {
        return;
      }
      event.preventDefault();
      removeFromComparison(button.dataset.removeId);
    });
  }

  renderComparisonTable();

  if (grid && supportsFetch) {
    let isFetching = false;
    let searchDebounce = null;
    const loaderClasses = ["opacity-50", "pointer-events-none"];
    const progressMap = new WeakMap();
    const setDownloadStatus = (form, message, isError) => {
      if (!form) return;
      const statusEl = form.querySelector(".js-download-status");
      if (!statusEl) return;
      statusEl.textContent = message || "";
      statusEl.classList.remove("hidden");
      statusEl.style.color = isError ? "#ef4444" : "#0f172a";
    };

    const startDownloadProgress = (form) => {
      const container = form?.querySelector(".js-download-progress");
      const bar = form?.querySelector(".js-download-progress-bar");
      if (!container || !bar) return;
      setDownloadStatus(form, "Descargando acordes, notas y estaciones...", false);
      container.classList.remove("hidden");
      bar.style.width = "5%";
      if (progressMap.has(form)) {
        clearInterval(progressMap.get(form));
      }
      const interval = setInterval(() => {
        const current = parseFloat(bar.style.width) || 0;
        if (current < 85) {
          bar.style.width = Math.min(current + 5, 85) + "%";
        }
      }, 180);
      progressMap.set(form, interval);
    };

    const stopDownloadProgress = (form) => {
      const container = form?.querySelector(".js-download-progress");
      const bar = form?.querySelector(".js-download-progress-bar");
      const interval = progressMap.get(form);
      if (interval) {
        clearInterval(interval);
        progressMap.delete(form);
      }
      if (bar) {
        bar.style.width = "0%";
      }
      if (container) {
        container.classList.add("hidden");
      }
    };

    const setLoading = (state) => {
      isFetching = state;
      grid.classList[state ? "add" : "remove"](...loaderClasses);
    };

    const replaceContent = (html) => {
      grid.innerHTML = html;
      syncCompareButtons();
    };

    const updateTotalPerfumes = (value) => {
      if (!totalPerfumesCount) return;
      const num = Number(value);
      totalPerfumesCount.textContent = Number.isFinite(num) ? num : 0;
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

    const pushState = (url, html, totalPerfumes, replace = false) => {
      const state = { html, total_perfumes: totalPerfumes };
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
        updateTotalPerfumes(data.total_perfumes);
        syncSearchInputFromUrl(url);
        syncFiltersFromUrl(url);
        if (push) {
          pushState(url, data.html, data.total_perfumes, replaceState);
        }
      } catch (error) {
        console.error(error);
        window.location.href = url;
      } finally {
        setLoading(false);
      }
    };

    grid.addEventListener("click", (event) => {
      const compareButton = event.target.closest(".compare-btn");
      if (compareButton) {
        event.preventDefault();
        handleCompareButton(compareButton);
        return;
      }

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

    grid.addEventListener("submit", async (event) => {
      const form = event.target.closest(".js-download-form");
      if (!form) {
        return;
      }
      event.preventDefault();
      const btn = form.querySelector(".js-download-btn");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Cargando...";
      }
      setDownloadStatus(form, "", false);
      startDownloadProgress(form);

      try {
        const formData = new FormData(form);
        const resp = await fetch(form.action, {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
        });
        const json = await resp.json();
        if (json?.ok) {
          if (json.html) {
            const cardEl = form.closest(".flip-card");
            if (cardEl) {
              const wrapper = document.createElement("div");
              wrapper.innerHTML = json.html.trim();
              const newCard = wrapper.firstElementChild;
              if (newCard) {
                cardEl.replaceWith(newCard);
                syncCompareButtons();
              }
            }
            if (Array.isArray(json.updated_cards) && json.updated_cards.length) {
              json.updated_cards.forEach((item) => {
                if (!item || !item.id || !item.html) {
                  return;
                }
                const target = document.querySelector(`.flip-card[data-perfume-id="${item.id}"]`);
                if (!target) {
                  return;
                }
                const wrap = document.createElement("div");
                wrap.innerHTML = item.html.trim();
                const newCard = wrap.firstElementChild;
                if (newCard) {
                  target.replaceWith(newCard);
                }
              });
              syncCompareButtons();
            }
            showDownloadToast(json.message || `Descargado ${json.nombre || ""}`);
          } else {
            if (btn) btn.textContent = "Descargado";
            setDownloadStatus(form, json.message || "Listo", false);
            showDownloadToast(json.message || `Descargado ${json.nombre || ""}`);
          }
        } else {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Descargar detalles";
          }
          setDownloadStatus(form, json?.message || "No se pudo descargar", true);
          showDownloadToast(json?.message || "No se pudo descargar", true);
        }
      } catch (error) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Descargar detalles";
        }
        setDownloadStatus(form, "Error de red al descargar", true);
        showDownloadToast("Error de red al descargar", true);
      } finally {
        stopDownloadProgress(form);
      }
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
        updateTotalPerfumes(event.state.total_perfumes);
        syncSearchInputFromUrl(window.location.href);
        syncFiltersFromUrl(window.location.href);
      } else {
        window.location.reload();
      }
    });

    pushState(
      window.location.href,
      grid.innerHTML,
      totalPerfumesCount ? totalPerfumesCount.textContent : null,
      true
    );
    syncSearchInputFromUrl(window.location.href);
    syncFiltersFromUrl(window.location.href);
  }

  if (grid && !supportsFetch) {
    grid.addEventListener("click", (event) => {
      const compareButton = event.target.closest(".compare-btn");
      if (!compareButton) {
        return;
      }
      event.preventDefault();
      handleCompareButton(compareButton);
    });
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
  const downloadToast = document.getElementById("download-toast");

  const showDownloadToast = (message, isError = false) => {
    if (!downloadToast) return;
    downloadToast.textContent = message || "";
    downloadToast.classList.remove("hidden");
    downloadToast.style.backgroundColor = isError ? "#fee2e2" : "#bbf7d0"; // verde más claro
    downloadToast.style.color = "#0f172a"; // negro/azul oscuro
    downloadToast.style.borderColor = isError ? "#fecdd3" : "#86efac";
    downloadToast.textContent = `${isError ? "✖" : "✔"} ${message || ""}`;
    setTimeout(() => {
      downloadToast.classList.add("hidden");
    }, 2800);
  };

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
      key: "urls",
      title: "Actualizando URLs de Fragrantica...",
      detail: "Buscando coincidencias y normalizando URLs.",
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
