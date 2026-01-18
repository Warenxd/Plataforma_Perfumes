(() => {
  const modal = document.getElementById("custom-perfume-modal");
  const form = document.getElementById("custom-perfume-form");
  const openBtn = document.getElementById("open-custom-perfume-modal");
  const statusBox = document.getElementById("custom-perfume-status");
  const totalCounter = document.getElementById("total-perfumes-count");
  const gridContainer = document.getElementById("perfumes-grid");
  const storeFiltersList = document.getElementById("store-filters-list");
  const storeFiltersEmpty = document.getElementById("store-filters-empty");
  const storeCountsWrapper = document.getElementById("store-counts-wrapper");
  const storeCountsList = document.getElementById("store-counts-list");
  const getGridTop = () => document.getElementById("perfumes-grid-top");
  const getEmptyGridMessage = () =>
    '<p class="mt-4 text-gray-600 text-center">No hay perfumes en la base de datos.</p>';
  const buildGridIfMissing = (html) => {
    if (!gridContainer || !html) return null;
    gridContainer.innerHTML = `
      <div id="perfumes-grid-top" class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 justify-items-center">
        ${html}
      </div>
    `;
    return getGridTop();
  };
  const hiddenId = document.getElementById("custom-perfume-id");
  const submitBtn = form?.querySelector("button[type='submit']");
  const titleEl = modal?.querySelector("h2");
  const COMPARISON_STORAGE_KEY = "perfumes_comparar";
  const currentImgBox = document.getElementById("custom-current-image");
  const currentImgThumb = document.getElementById("custom-current-image-thumb");
  const currentImgIcon = document.getElementById("custom-current-image-icon");
  const currentImgLabel = document.getElementById("custom-current-image-label");
  const fileInput = form?.querySelector('input[name="imagen"]');

  if (!modal || !form || !openBtn) {
    return;
  }

  const closeModal = () => {
    modal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    form.reset();
    if (hiddenId) hiddenId.value = "";
    if (submitBtn) submitBtn.textContent = "Guardar perfume";
    if (titleEl) titleEl.textContent = "Crea tu perfume custom";
    if (currentImgBox) currentImgBox.classList.add("hidden");
    if (currentImgThumb) {
      currentImgThumb.src = "";
      currentImgThumb.classList.add("hidden");
    }
    if (currentImgIcon) currentImgIcon.classList.remove("hidden");
    setStatus("", false, true);
  };

  const openModal = () => {
    modal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  };

  const setStatus = (text, isError = false, hide = false) => {
    if (!statusBox) return;
    if (hide || !text) {
      statusBox.classList.add("hidden");
      statusBox.textContent = "";
      return;
    }
    statusBox.textContent = text;
    statusBox.classList.remove("hidden");
    statusBox.classList.toggle("border-emerald-200", !isError);
    statusBox.classList.toggle("bg-emerald-50", !isError);
    statusBox.classList.toggle("text-emerald-700", !isError);
    statusBox.classList.toggle("border-red-200", isError);
    statusBox.classList.toggle("bg-red-50", isError);
    statusBox.classList.toggle("text-red-700", isError);
  };

  modal.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal());
  });

  openBtn.addEventListener("click", () => openModal());

  modal.addEventListener("click", (event) => {
    if (event.target.dataset && event.target.dataset.closeModal !== undefined) {
      closeModal();
    }
  });

  const getCsrfToken = () => {
    const input = form.querySelector("input[name='csrfmiddlewaretoken']");
    return input ? input.value : "";
  };

  const prependCardToGrid = (html) => {
    if (!html) return;
    let gridTop = getGridTop();
    if (!gridTop) {
      gridTop = buildGridIfMissing(html);
      if (!gridTop) return;
      if (window.syncCompareButtons) {
        window.syncCompareButtons();
      }
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html.trim();
    const newCard = wrapper.firstElementChild;
    if (newCard) {
      gridTop.prepend(newCard);
    }
    if (window.syncCompareButtons) {
      window.syncCompareButtons();
    }
  };

  const parsePriceToNumber = (value) => {
    if (!value) return 0;
    const cleaned = String(value).replace(/\./g, "").replace(/,/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  };

  const incrementTotalCounter = (delta = 1) => {
    if (!totalCounter) return;
    const current = Number(totalCounter.textContent) || 0;
    totalCounter.textContent = Math.max(0, current + delta);
  };

  const updateStoreFilters = (stores) => {
    if (!storeFiltersList) return;
    const selected = new Set(
      Array.from(document.querySelectorAll('input[name="tienda"]:checked')).map((el) => el.value)
    );
    storeFiltersList.innerHTML = "";
    if (!Array.isArray(stores) || stores.length === 0) {
      if (storeFiltersEmpty) {
        storeFiltersEmpty.classList.remove("hidden");
      } else {
        storeFiltersList.innerHTML = '<p class="text-xs text-slate-300">No hay tiendas registradas.</p>';
      }
      return;
    }
    if (storeFiltersEmpty) {
      storeFiltersEmpty.classList.add("hidden");
    }
    stores.forEach((store) => {
      const code = store?.code || "";
      if (!code) return;
      const label = store?.label || code;
      const wrapper = document.createElement("label");
      wrapper.className =
        "flex items-center justify-between gap-2 rounded-xl border border-[#1d2430] px-3 py-2 text-sm font-semibold text-slate-100 shadow-sm transition hover:border-[#2a3342] hover:bg-[#121924]";
      const text = document.createElement("span");
      text.className = "truncate";
      text.textContent = label;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "tienda";
      input.value = code;
      input.className =
        "h-4 w-4 rounded border-slate-500 bg-white text-indigo-600 accent-indigo-500 focus:ring-2 focus:ring-indigo-300 focus:ring-offset-1 focus:ring-offset-slate-900 transition";
      if (selected.has(code)) {
        input.checked = true;
      }
      wrapper.append(text, input);
      storeFiltersList.appendChild(wrapper);
    });
  };

  const updateStoreCounts = (counts) => {
    if (!storeCountsList) return;
    storeCountsList.innerHTML = "";
    if (!Array.isArray(counts) || counts.length === 0) {
      if (storeCountsWrapper) {
        storeCountsWrapper.classList.add("hidden");
      }
      return;
    }
    if (storeCountsWrapper) {
      storeCountsWrapper.classList.remove("hidden");
    }
    counts.forEach((item) => {
      const code = item?.code || "";
      if (!code) return;
      const label = item?.label || code;
      const count = Number(item?.count) || 0;
      const chip = document.createElement("span");
      chip.className =
        "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-800 shadow-sm";
      const tag = document.createElement("span");
      tag.className = "inline-flex items-center gap-1 rounded-full bg-slate-900 text-white px-2 py-0.5 text-[11px]";
      tag.textContent = label;
      const countEl = document.createElement("span");
      countEl.dataset.storeCount = code;
      countEl.textContent = count;
      chip.append(tag, countEl);
      storeCountsList.appendChild(chip);
    });
  };

  const removeCardFromGrid = (id) => {
    if (!id) return;
    const card = document.querySelector(`.flip-card[data-perfume-id="${id}"]`);
    if (card) {
      const gridTop = card.closest("#perfumes-grid-top");
      const finalizeRemoval = () => {
        card.remove();
        const hasCards = gridTop ? gridTop.querySelector(".flip-card") : null;
        if (!hasCards && gridContainer) {
          gridContainer.innerHTML = getEmptyGridMessage();
        }
        if (window.syncCompareButtons) {
          window.syncCompareButtons();
        }
      };

      // Animación de salida antes de quitar la card
      let timer = null;
      const onEnd = () => {
        if (timer) clearTimeout(timer);
        finalizeRemoval();
      };
      timer = setTimeout(onEnd, 400);
      card.addEventListener("animationend", onEnd, { once: true });
      card.addEventListener("animationcancel", onEnd, { once: true });
      card.classList.add("animate__animated", "animate__fadeOutDown");
      return;
    }
    if (window.syncCompareButtons) {
      window.syncCompareButtons();
    }
  };

  const formatPriceWithDots = (num) => {
    const n = Number(num) || 0;
    return n.toLocaleString("es-CL");
  };

  const handleEditClick = (btn) => {
    const card = btn.closest(".flip-card");
    if (!card) return;
    form.reset();
    if (hiddenId) hiddenId.value = card.dataset.perfumeId || "";
    const nombre = card.dataset.perfumeNombre || "";
    const marcaId = card.dataset.perfumeMarcaId || "";
    const precio = card.dataset.perfumePrecio || 0;
    const tiendaRaw = card.dataset.perfumeTiendaRaw || "";
    const urlProducto = card.dataset.perfumeUrl || "";
    const imagenUrl = card.dataset.perfumeImagen || "";
    const nombreInput = form.querySelector('input[name="nombre"]');
    const marcaSelect = form.querySelector('select[name="marca"]');
    const precioInput = form.querySelector('input[name="precio"]');
    const tiendaInput = form.querySelector('input[name="tienda"]');
    const urlInput = form.querySelector('input[name="url_producto"]');
    if (nombreInput) nombreInput.value = nombre;
    if (marcaSelect && marcaId) marcaSelect.value = marcaId;
    if (precioInput) precioInput.value = formatPriceWithDots(precio);
    if (tiendaInput) tiendaInput.value = tiendaRaw;
    if (urlInput) urlInput.value = urlProducto;
    if (currentImgBox) {
      if (imagenUrl) {
        currentImgBox.classList.remove("hidden");
        if (currentImgLabel) {
          const parts = imagenUrl.split("/");
          currentImgLabel.textContent = parts.length ? parts[parts.length - 1] : "Imagen actual";
        }
        if (currentImgThumb) {
          currentImgThumb.src = imagenUrl;
          currentImgThumb.classList.remove("hidden");
        }
        if (currentImgIcon) currentImgIcon.classList.add("hidden");
      } else {
        currentImgBox.classList.add("hidden");
        if (currentImgThumb) {
          currentImgThumb.src = "";
          currentImgThumb.classList.add("hidden");
        }
        if (currentImgIcon) currentImgIcon.classList.remove("hidden");
      }
    }
    const imgRadios = form.querySelectorAll('input[name="imagen_existente"]');
    imgRadios.forEach((r) => (r.checked = r.value === ""));
    if (submitBtn) submitBtn.textContent = "Guardar cambios";
    if (titleEl) titleEl.textContent = "Editar perfume custom";
    openModal();
  };

  const handleDeleteClick = async (btn) => {
    const id = btn.dataset.deleteCustom;
    if (!id) return;
    if (!window.confirm("¿Eliminar este perfume personalizado?")) return;
    try {
      const url = btn.dataset.deleteUrl;
      const resp = await fetch(url || `/perfumes/custom/${id}/eliminar/`, {
        method: "POST",
        headers: {
          "X-CSRFToken": getCsrfToken(),
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      const json = await resp.json();
      if (!resp.ok || !json?.ok) {
        alert(json?.error || "No se pudo eliminar.");
        return;
      }
      // Limpia comparación si estaba agregado
      try {
        const raw = localStorage.getItem(COMPARISON_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        const filtered = Array.isArray(parsed) ? parsed.filter((item) => String(item.id) !== String(id)) : [];
        localStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(filtered));
        if (typeof window.refreshComparisonUI === "function") {
          window.refreshComparisonUI();
        }
      } catch (error) {
        console.warn("No se pudo limpiar comparación tras eliminar perfume custom", error);
      }
      removeCardFromGrid(id);
      incrementTotalCounter(-1);
      if (Array.isArray(json?.tiendas)) {
        updateStoreFilters(json.tiendas);
      }
      if (Array.isArray(json?.tienda_counts)) {
        updateStoreCounts(json.tienda_counts);
      }
    } catch (error) {
      console.error(error);
      alert("Error al eliminar el perfume.");
    }
  };

  document.addEventListener("click", (event) => {
    const editBtn = event.target.closest("[data-edit-custom]");
    if (editBtn && modal.contains(form)) {
      event.preventDefault();
      handleEditClick(editBtn);
      return;
    }
    const deleteBtn = event.target.closest("[data-delete-custom]");
    if (deleteBtn) {
      event.preventDefault();
      handleDeleteClick(deleteBtn);
    }
  });

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (!currentImgBox || !currentImgLabel) return;
      if (file) {
        currentImgBox.classList.remove("hidden");
        currentImgLabel.textContent = file.name;
        if (currentImgThumb) {
          const reader = new FileReader();
          reader.onload = (e) => {
            currentImgThumb.src = e.target?.result || "";
            currentImgThumb.classList.remove("hidden");
            if (currentImgIcon) currentImgIcon.classList.add("hidden");
          };
          reader.readAsDataURL(file);
        }
      } else {
        currentImgBox.classList.add("hidden");
        if (currentImgThumb) {
          currentImgThumb.src = "";
          currentImgThumb.classList.add("hidden");
        }
        if (currentImgIcon) currentImgIcon.classList.remove("hidden");
      }
    });
  }

  const imageSearchInput = document.getElementById("existing-image-search");
  if (imageSearchInput) {
    const options = Array.from(document.querySelectorAll("[data-image-option]"));
    imageSearchInput.addEventListener("input", () => {
      const term = imageSearchInput.value.trim().toLowerCase();
      options.forEach((option) => {
        const text = (option.dataset.searchText || "").toLowerCase();
        const match = !term || text.includes(term);
        option.classList.toggle("hidden", !match);
      });
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add("opacity-70");
    }
    setStatus("Guardando perfume...", false);

    try {
      const formData = new FormData(form);
      const priceInput = form.querySelector('input[name="precio"]');
      if (priceInput) {
        const formatted = parsePriceToNumber(priceInput.value);
        priceInput.value = formatted;
        formData.set("precio", formatted);
      }
      const response = await fetch(form.action, {
        method: "POST",
        body: formData,
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRFToken": getCsrfToken(),
        },
      });
      let data = null;
      try {
        data = await response.json();
      } catch (err) {
        data = null;
      }
      const success = response.ok && (data === null || data.ok !== false);
      if (!success) {
        console.warn("Guardar perfume custom: respuesta no OK", {
          status: response.status,
          statusText: response.statusText,
          data,
        });
        setStatus((data && data.error) || "No se pudo guardar el perfume.", true);
        return;
      }
      console.log("Guardar perfume custom: éxito", { isEdit: Boolean(hiddenId && hiddenId.value), data });
      setStatus("Perfume guardado. Actualizando catálogo...", false);
      const payload = data || {};
      const isEdit = Boolean(hiddenId && hiddenId.value);
      if (payload.card_html) {
        const targetId = hiddenId ? hiddenId.value : null;
        if (isEdit && targetId) {
          const target = document.querySelector(`.flip-card[data-perfume-id="${targetId}"]`);
          if (target) {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = payload.card_html.trim();
            const newCard = wrapper.firstElementChild;
            if (newCard) {
              target.replaceWith(newCard);
            }
          } else {
            prependCardToGrid(payload.card_html);
          }
        } else {
          prependCardToGrid(payload.card_html);
        }
        if (window.syncCompareButtons) {
          window.syncCompareButtons();
        }
      } else {
        // Sin HTML devuelto, recarga para reflejar cambios
        window.location.reload();
        return;
      }
		if (!isEdit) {
			incrementTotalCounter();
		}
		if (Array.isArray(payload.tiendas)) {
			updateStoreFilters(payload.tiendas);
		}
		if (Array.isArray(payload.tienda_counts)) {
			updateStoreCounts(payload.tienda_counts);
		}
		setTimeout(() => {
        closeModal();
        setStatus("Perfume añadido con éxito.", false, true);
      }, 200);
    } catch (error) {
      console.error(error);
      setStatus("Error de red al guardar el perfume.", true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-70");
      }
    }
  });
})();
