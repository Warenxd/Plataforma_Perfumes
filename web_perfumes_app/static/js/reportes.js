(() => {
  const initReportes = (root = document) => {
    const container = root.querySelector("[data-reportes-root]");
    if (!container) return;

    // Fuerza comportamiento parcial para evitar recargas completas
    const isEmbedded = true;

    const replaceContent = async (url, options = {}) => {
      try {
        const res = await fetch(url, {
          credentials: "same-origin",
          headers: { "X-Requested-With": "XMLHttpRequest", ...(options.headers || {}) },
          ...options,
        });
        if (!res.ok) {
          console.error("No se pudo actualizar reportes:", res.status);
          return;
        }
        const html = await res.text();
        // Reemplazar solo el contenedor de reportes para evitar re-render completo
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const newRoot = doc.querySelector("[data-reportes-root]");
        const currentRoot = root.querySelector("[data-reportes-root]");
        if (newRoot && currentRoot && currentRoot.parentNode) {
          currentRoot.replaceWith(newRoot);
          initReportes(root);
        } else {
          // fallback
          root.innerHTML = html;
          initReportes(root);
        }
      } catch (error) {
        console.error("Error cargando reportes:", error);
      }
    };

    if (isEmbedded) {
      const form = container.querySelector("[data-reportes-form]");
      if (form) {
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          const formData = new FormData(form);
          formData.set("partial", "1");
          replaceContent(form.action || window.location.href, {
            method: "POST",
            body: formData,
          });
        });
      }
    }

    const yearSelect = container.querySelector("[data-reportes-year-select]");
    if (yearSelect) {
      yearSelect.addEventListener("change", (event) => {
        if (!isEmbedded) {
          if (yearSelect.form) {
            yearSelect.form.submit();
          }
          return;
        }
        event.preventDefault();
        const formEl = yearSelect.closest("form");
        const params = new URLSearchParams(new FormData(formEl));
        params.set("partial", "1");
        const url = new URL(formEl.action || window.location.href, window.location.origin);
        url.search = params.toString();
        replaceContent(url.toString(), { method: "GET" });
      });
    }

    // Tabla de filas múltiples
    const tableBody = container.querySelector("[data-reportes-table-body]");
    const addRowBtn = container.querySelector("[data-reportes-add-row]");
    const saveRowsBtn = container.querySelector("[data-reportes-save-rows]");
    const clearRowsBtn = container.querySelector("[data-reportes-clear-rows]");
    const rowTemplate = container.querySelector("#reportes-row-template");
    const formTable = container.querySelector("[data-reportes-form-table]");
    const csrfEl = formTable && formTable.querySelector('[name="csrfmiddlewaretoken"]');
    const csrfToken = csrfEl ? csrfEl.value : "";
    const DRAFT_KEY = "reportes_draft_rows";
    const STATE_KEY = "reportes_ui_state";

    const loadState = () => {
      try {
        const raw = localStorage.getItem(STATE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (error) {
        return {};
      }
    };

    const saveState = (state) => {
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify(state || {}));
      } catch (error) {
        // ignore
      }
    };

    const uiState = loadState();

    const formatCLP = (val) => {
      const n = Number(val) || 0;
      return n.toLocaleString("es-CL", { minimumFractionDigits: 0 });
    };

    // Eliminar venta desde el detalle mensual (SIN recargar página)
container.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest("[data-reportes-delete]");
  if (!deleteBtn) return;

  const deleteUrl = deleteBtn.dataset.deleteUrl;
  const monthId = deleteBtn.dataset.monthId; // 🔑 CLAVE
  const yearSelect = container.querySelector("[data-reportes-year-select]");
  const selectedYear = yearSelect ? yearSelect.value : null;

  if (!deleteUrl || !csrfToken) return;

  deleteBtn.disabled = true;

  try {
    // 1️⃣ Eliminar venta
    const res = await fetch(deleteUrl, {
      method: "POST",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": csrfToken,
      },
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      console.error("No se pudo eliminar la venta");
      deleteBtn.disabled = false;
      return;
    }

    // 2️⃣ Pedir HTML parcial del año
    const yearForm = container.querySelector("[data-reportes-year-form]");
    const baseUrl = yearForm
      ? yearForm.getAttribute("action")
      : window.location.pathname;

    const params = new URLSearchParams();
    if (selectedYear) params.set("year", selectedYear);
    params.set("partial", "1");

    const url = new URL(baseUrl, window.location.origin);
    url.search = params.toString();

    const resPartial = await fetch(url.toString(), {
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });

    if (!resPartial.ok) {
      // fallback duro
      window.location.href = url.toString();
      return;
    }

    const html = await resPartial.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const newRoot = doc.querySelector("[data-reportes-root]");
    const currentRoot = container;

    // 3️⃣ Reemplazar SOLO el mes afectado
    if (monthId && newRoot) {
      const newMonthCard = newRoot.querySelector(
        `[data-month-card][data-month-id="${monthId}"]`
      );
      const currentMonthCard = currentRoot.querySelector(
        `[data-month-card][data-month-id="${monthId}"]`
      );

      // Si el mes aún existe → reemplazar
      if (newMonthCard && currentMonthCard) {
        currentMonthCard.replaceWith(newMonthCard);
        initReportes(currentRoot);
        return;
      }

      // Si el mes quedó vacío → eliminar card
      if (!newMonthCard && currentMonthCard) {
        currentMonthCard.remove();
        return;
      }
    }

    // 4️⃣ Fallback general (no debería pasar)
    replaceContent(url.toString(), { method: "GET" });

  } catch (error) {
    console.error("Error eliminando venta", error);
    deleteBtn.disabled = false;
  }
});


    if (tableBody && tableBody.childNodes.length && !tableBody.querySelector("[data-reportes-row]")) {
      tableBody.innerHTML = "";
    }

    let activeSuggestionsBox = null;

window.addEventListener(
  "scroll",
  () => {
    if (activeSuggestionsBox) {
      activeSuggestionsBox.classList.add("hidden");
      activeSuggestionsBox = null;
    }
  },
  { passive: true }
);

  const attachSuggestions = (row) => {
  const input = row.querySelector('[name="nombre"][data-suggest-url]');
  const tiendaSelect = row.querySelector('[name="tienda"]');
  const imageThumb = row.querySelector("[data-reportes-thumb]");
  const box = row.querySelector("[data-reportes-suggestions]");
  const list = box ? box.querySelector("ul") : null;
  if (!input || !box || !list || !window.fetch) return;

  // Flotar el dropdown
  if (!box.dataset.floated) {
    box.dataset.floated = "1";
    box.style.position = "fixed";
    box.style.zIndex = "9999";
    box.style.maxHeight = "260px";
    box.style.overflowY = "auto";
    document.body.appendChild(box);
  }

  let controller = null;
  let debounceTimer = null;
  let itemsCache = [];
  let activeIndex = -1;
  const suggestUrl = input.dataset.suggestUrl;

  // -------------------------
  // Posicionamiento
  // -------------------------
  const placeBox = () => {
    const rect = input.getBoundingClientRect();
    const boxHeight = box.offsetHeight || 260;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;

    if (spaceBelow < boxHeight && spaceAbove > boxHeight) {
      box.style.top = `${rect.top - boxHeight - 4}px`;
      box.dataset.placement = "top";
    } else {
      box.style.top = `${rect.bottom + 4}px`;
      box.dataset.placement = "bottom";
    }
  };

  // -------------------------
  // Toggle (UNA SOLA VEZ)
  // -------------------------
  const toggleBox = (show) => {
    if (show) {
      placeBox();
      activeSuggestionsBox = box;
    } else {
      if (activeSuggestionsBox === box) activeSuggestionsBox = null;
    }
    box.classList.toggle("hidden", !show);
    if (!show) activeIndex = -1;
  };

  const updateActive = (idx) => {
    const items = Array.from(list.children);
    items.forEach((li, i) => li.classList.toggle("bg-slate-100", i === idx));
    activeIndex = idx;
    items[idx]?.scrollIntoView({ block: "nearest" });
  };

  const selectItem = (item) => {
    input.value = item.nombre;
    if (tiendaSelect && item.tienda_code) tiendaSelect.value = item.tienda_code;

    if (imageThumb) {
      imageThumb.innerHTML = item.imagen
        ? `<img src="${item.imagen}" class="h-full w-full object-cover">`
        : `<span class="text-[11px] font-semibold text-slate-400">Img</span>`;
    }

    toggleBox(false);
  };

  const render = (items) => {
    list.innerHTML = "";
    itemsCache = items;
    activeIndex = -1;
    if (!items.length) return toggleBox(false);

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "px-3 py-2 cursor-pointer hover:bg-slate-50";
      li.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-xl bg-slate-100 border overflow-hidden flex items-center justify-center">
            ${item.imagen ? `<img src="${item.imagen}" class="h-full w-full object-cover">` : `<span class="text-[11px]">Img</span>`}
          </div>
          <div class="leading-tight">
            <p class="text-sm font-semibold">${item.nombre}</p>
            <p class="text-xs text-slate-500">${item.marca || ""}</p>
            <p class="text-[11px] text-slate-500">${item.tienda ? `Tienda: ${item.tienda}` : ""}</p>
          </div>
        </div>
      `;
      li.addEventListener("click", () => selectItem(item));
      list.appendChild(li);
    });

    toggleBox(true);
  };

  const fetchSuggestions = async (value) => {
    if (controller) controller.abort();
    controller = new AbortController();
    try {
      const url = new URL(suggestUrl, window.location.origin);
      url.searchParams.set("q", value);
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();
      render(data.results || []);
    } catch {
      toggleBox(false);
    }
  };

  // Events
  input.addEventListener("input", (e) => {
    const value = e.target.value.trim();
    if (!value) return toggleBox(false);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSuggestions(value), 160);
  });

  input.addEventListener("focus", () => list.children.length && toggleBox(true));
  input.addEventListener("blur", () => setTimeout(() => toggleBox(false), 100));

  input.addEventListener("keydown", (e) => {
    if (!itemsCache.length) return;
    if (e.key === "ArrowDown") updateActive((activeIndex + 1) % itemsCache.length);
    if (e.key === "ArrowUp") updateActive((activeIndex - 1 + itemsCache.length) % itemsCache.length);
    if (e.key === "Enter" && activeIndex >= 0) selectItem(itemsCache[activeIndex]);
    if (e.key === "Escape") toggleBox(false);
  });
};



    const updateRowTotal = (row) => {
      const unidadesInput = row.querySelector('[name="unidades"]');
      const precioInput = row.querySelector('[name="precio_unitario"]');
      const unidades = Number((unidadesInput && unidadesInput.value) || 0);
      const precio = Number((precioInput && precioInput.value) || 0);
      const total = unidades * precio;
      const totalEl = row.querySelector("[data-row-total]");
      if (totalEl) totalEl.textContent = `$${formatCLP(total)}`;
      row.dataset.total = total;
    };

    const saveDraft = () => {
      if (!tableBody || !window.localStorage) return;
      const rows = Array.from(tableBody.querySelectorAll("[data-reportes-row]"));
      const entries = rows.map((row) => ({
        id: row.dataset.ventaId || "",
        nombre: (row.querySelector('[name="nombre"]') || {}).value || "",
        tipo: (row.querySelector('[name="tipo"]') || {}).value || "",
        tienda: (row.querySelector('[name="tienda"]') || {}).value || "",
        unidades: (row.querySelector('[name="unidades"]') || {}).value || "",
        precio_unitario: (row.querySelector('[name="precio_unitario"]') || {}).value || "",
        fecha_venta: (row.querySelector('[name="fecha_venta"]') || {}).value || "",
        imagen: (() => {
          const thumb = row.querySelector("[data-reportes-thumb] img");
          return thumb ? thumb.src : "";
        })(),
      }));
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(entries));
      } catch (error) {
        console.warn("No se pudo guardar borrador", error);
      }
    };

    const clearDraft = () => {
      if (!window.localStorage) return;
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch (error) {
        console.warn("No se pudo limpiar borrador", error);
      }
    };

    const initRow = (row) => {
      attachSuggestions(row);
      ["unidades", "precio_unitario"].forEach((name) => {
        const input = row.querySelector(`[name="${name}"]`);
        if (input) input.addEventListener("input", () => {
          updateRowTotal(row);
          saveDraft();
        });
      });
      const removeBtn = row.querySelector("[data-reportes-remove-row]");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          row.remove();
          saveDraft();
        });
      }
      row.querySelectorAll("input, select").forEach((el) => {
        el.addEventListener("change", saveDraft);
      });
      updateRowTotal(row);
    };

    const addRow = (defaults = {}, options = {}) => {
      if (!tableBody || !rowTemplate) return;
      const fragment = rowTemplate.content.cloneNode(true);
      const clone = fragment.querySelector("[data-reportes-row]");
      if (!clone) return;
      if (defaults.id) {
        clone.dataset.ventaId = defaults.id;
      } else {
        delete clone.dataset.ventaId;
      }
      if (defaults.nombre) clone.querySelector('[name="nombre"]').value = defaults.nombre;
      if (defaults.tipo) clone.querySelector('[name="tipo"]').value = defaults.tipo;
      if (defaults.tienda) clone.querySelector('[name="tienda"]').value = defaults.tienda;
      if (defaults.unidades) clone.querySelector('[name="unidades"]').value = defaults.unidades;
      if (defaults.precio_unitario) clone.querySelector('[name="precio_unitario"]').value = defaults.precio_unitario;
      if (defaults.fecha_venta) clone.querySelector('[name="fecha_venta"]').value = defaults.fecha_venta;
      const thumb = clone.querySelector("[data-reportes-thumb]");
      if (thumb) {
        thumb.innerHTML = "";
        if (defaults.imagen) {
          const img = document.createElement("img");
          img.src = defaults.imagen;
          img.alt = defaults.nombre || "";
          img.className = "h-full w-full object-cover";
          thumb.appendChild(img);
        } else {
          const fallback = document.createElement("span");
          fallback.className = "text-[11px] font-semibold text-slate-400";
          fallback.textContent = "Img";
          thumb.appendChild(fallback);
        }
      }
      tableBody.appendChild(clone);
      initRow(clone);
      if (!options.skipDraftSave) saveDraft();
    };

    const loadDraft = () => {
      if (!window.localStorage) return false;
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return false;
        if (tableBody) tableBody.innerHTML = "";
        parsed.forEach((entry) => addRow(entry, { skipDraftSave: true }));
        saveDraft();
        return parsed.length > 0;
      } catch (error) {
        console.warn("No se pudo cargar borrador", error);
        return false;
      }
    };

    // fila inicial
    const hasDraft = loadDraft();
    if (tableBody && !tableBody.querySelector("[data-reportes-row]") && !hasDraft) {
      addRow();
    }

    addRowBtn && addRowBtn.addEventListener("click", (event) => {
      event.preventDefault();
      addRow();
    });

    if (clearRowsBtn) {
      clearRowsBtn.addEventListener("click", (event) => {
        event.preventDefault();
        if (!tableBody) return;
        if (!confirm("¿Vaciar la tabla de filas?")) return;
        tableBody.innerHTML = "";
        addRow();
        saveDraft();
      });
    }

    const saveRows = async () => {
      if (!tableBody) return;
      const entries = [];
      const rows = Array.from(tableBody.querySelectorAll("[data-reportes-row]"));
      for (const row of rows) {
        const nombre = row.querySelector('[name="nombre"]').value.trim();
        const tipo = row.querySelector('[name="tipo"]').value;
        const tienda = row.querySelector('[name="tienda"]').value;
        const unidades = Number(row.querySelector('[name="unidades"]').value || 0);
        const precio_unitario = Number(row.querySelector('[name="precio_unitario"]').value || 0);
        const fecha_venta = row.querySelector('[name="fecha_venta"]').value;
        if (!nombre || !tienda || !fecha_venta || unidades <= 0 || precio_unitario <= 0) {
          alert("Completa todos los campos (unidades > 0, precio > 0).");
          return;
        }
        const ventaId = row.dataset.ventaId || "";
        entries.push({ id: ventaId, nombre, tipo, tienda, unidades, precio_unitario, fecha_venta });
      }
      const targetUrl = (formTable && formTable.action) || window.location.href;
      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken,
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ entries }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "No se pudo guardar");
        if (isEmbedded) {
          const url = new URL(targetUrl, window.location.origin);
          url.searchParams.set("partial", "1");
          if (data.year) url.searchParams.set("year", data.year);
          replaceContent(url.toString(), { method: "GET" });
        } else {
          window.location.href = data.year ? `${targetUrl}?year=${data.year}` : targetUrl;
        }
        clearDraft();
      } catch (error) {
        alert(error.message || "Error al guardar");
      }
    };

    saveRowsBtn && saveRowsBtn.addEventListener("click", (event) => {
      event.preventDefault();
      saveRows();
    });

    // Accordion año
    const accordion = container.querySelector('[data-accordion="year"]');
    const animateSection = (el, open) => {
      if (!el) return;
      el.style.overflow = "hidden";
      el.style.transition = "max-height 260ms ease";
      const onEnd = () => {
        if (!open) el.classList.add("hidden");
        el.removeEventListener("transitionend", onEnd);
      };
      if (open) {
        el.classList.remove("hidden");
        el.style.maxHeight = "0px";
        const target = el.scrollHeight;
        requestAnimationFrame(() => {
          el.addEventListener("transitionend", onEnd);
          el.style.maxHeight = `${target}px`;
        });
      } else {
        const target = el.scrollHeight;
        el.style.maxHeight = `${target}px`;
        requestAnimationFrame(() => {
          el.addEventListener("transitionend", onEnd);
          el.style.maxHeight = "0px";
        });
      }
    };

    if (accordion) {
      const trigger = accordion.querySelector("[data-accordion-trigger]");
      const body = accordion.querySelector("[data-accordion-body]");
      const label = accordion.querySelector("[data-accordion-label]");
      let isOpen = uiState.yearOpen !== undefined ? uiState.yearOpen : true;
      const setState = (open) => {
        console.log("[Reportes][Accordion] setState", { open, hasBody: !!body });
        isOpen = open;
        uiState.yearOpen = open;
        saveState(uiState);
        if (body) {
          animateSection(body, open);
        } else {
          console.warn("[Reportes][Accordion] body no encontrado al cambiar estado");
        }
        if (label) label.textContent = open ? "Ocultar" : "Mostrar";
      };
      console.log("[Reportes][Accordion] init", { isOpen, trigger: !!trigger, body: !!body, label: !!label });
      setState(isOpen);
      trigger &&
        trigger.addEventListener("click", () => {
          console.log("[Reportes][Accordion] click toggle", { current: isOpen, next: !isOpen });
          setState(!isOpen);
        });
    } else {
      console.warn("[Reportes][Accordion] no se encontró el acordeón de año");
    }

    // Toggle por mes
    const monthCards = container.querySelectorAll("[data-month-card]");
    if (monthCards && monthCards.length) {
      monthCards.forEach((card) => {
        const toggle = card.querySelector("[data-month-toggle]");
        const body = card.querySelector("[data-month-body]");
        const label = card.querySelector("[data-month-label]");
        const editBtn = card.querySelector("[data-month-edit]");
        const dataId = (editBtn && editBtn.dataset.monthJson) || "";
        const monthId = card.dataset.monthId || "";
        const dataEl =
          (dataId && document.getElementById(dataId)) ||
          card.querySelector('script[type="application/json"][id^="month-data-"]');
        if (!toggle || !body) return;
        if (monthId && !uiState.months) uiState.months = {};
        let open =
          monthId && uiState.months && typeof uiState.months[monthId] === "boolean"
            ? uiState.months[monthId]
            : true;
        let monthEntries = [];
        if (dataEl) {
          try {
            monthEntries = JSON.parse(dataEl.textContent || "[]");
          } catch (error) {
            monthEntries = [];
          }
        }
        const setState = (state) => {
          open = state;
          if (monthId) {
            uiState.months = uiState.months || {};
            uiState.months[monthId] = open;
            saveState(uiState);
          }
          animateSection(body, open);
          if (label) label.textContent = open ? "Ocultar" : "Mostrar";
        };
        setState(open);
        toggle.addEventListener("click", () => setState(!open));

        if (editBtn) {
          editBtn.addEventListener("click", () => {
            const parseData = () => {
              if (!dataEl) return [];
              try {
                return JSON.parse(dataEl.textContent || "[]");
              } catch (error) {
                console.warn("No se pudo parsear datos del mes", error);
                return [];
              }
            };
            let entriesToLoad = parseData();
            if (!entriesToLoad.length) {
              const saleNodes = card.querySelectorAll("[data-month-sale]");
              entriesToLoad = Array.from(saleNodes).map((node) => ({
                id: node.dataset.ventaId || "",
                nombre: node.dataset.nombre || "",
                tipo: node.dataset.tipo || "",
                tienda: node.dataset.tienda || "",
                unidades: Number(node.dataset.unidades || 0),
                precio_unitario: Number(node.dataset.precio || 0),
                fecha_venta: node.dataset.fecha || "",
                imagen: node.dataset.imagen || "",
              }));
            }
            if (!entriesToLoad.length) {
              alert("Este mes no tiene ventas para cargar.");
              return;
            }
            if (tableBody) {
              clearDraft();
              tableBody.innerHTML = "";
              entriesToLoad.forEach((entry) =>
                addRow(
                  {
                    id: entry.id,
                    nombre: entry.nombre,
                    tipo: entry.tipo,
                    tienda: entry.tienda,
                    unidades: entry.unidades,
                    precio_unitario: entry.precio_unitario,
                    fecha_venta: entry.fecha_venta,
                    imagen: entry.imagen,
                  },
                  { skipDraftSave: true }
                )
              );
              saveDraft();
              window.scrollTo({ top: container.offsetTop, behavior: "smooth" });
            }
          });
        }
      });
    }
  };

  const onReady = () => initReportes(document);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady, { once: true });
  } else {
    onReady();
  }

  window.initReportes = initReportes;
})();
