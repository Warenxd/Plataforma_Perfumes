(() => {
  const modal = document.getElementById("custom-perfume-modal");
  const form = document.getElementById("custom-perfume-form");
  const openBtn = document.getElementById("open-custom-perfume-modal");
  const statusBox = document.getElementById("custom-perfume-status");
  const totalCounter = document.getElementById("total-perfumes-count");
  const gridTop = document.getElementById("perfumes-grid-top");
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
    if (!gridTop || !html) return;
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
      // Recarga para refrescar filtros, contadores y listado
      window.location.reload();
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
