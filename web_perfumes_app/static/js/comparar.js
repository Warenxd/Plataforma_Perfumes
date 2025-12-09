(() => {
  const STORAGE_KEY = "perfumes_comparar";

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

  const loadItems = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((item) => ({
        ...item,
        cantidad: Number(item.cantidad) >= 0 ? Number(item.cantidad) : 0,
        precio_venta: Number(item.precio_venta) || 0,
        decants: Array.isArray(item.decants)
          ? item.decants.map((d, idx) => ({
              id: d.id || `d-${idx}-${Date.now()}`,
              ml: Number(d.ml) || 0,
              precio: Number(d.precio) || 0,
              cantidad: Number(d.cantidad) >= 0 ? Number(d.cantidad) : 1,
            }))
          : [],
      }));
    } catch (error) {
      console.warn("No se pudo leer la lista", error);
      return [];
    }
  };

  const saveItems = (items) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn("No se pudo guardar la lista", error);
    }
  };

  const updateItem = (id, data, root = document) => {
    const items = loadItems();
    const next = items.map((item) => {
      if (String(item.id) !== String(id)) {
        return item;
      }
      return { ...item, ...data };
    });
    saveItems(next);
    render(root);
  };

  const mutateDecants = (itemId, mutateFn, root = document) => {
    const items = loadItems();
    const next = items.map((item) => {
      if (String(item.id) !== String(itemId)) {
        return item;
      }
      const currentDecants = Array.isArray(item.decants) ? item.decants : [];
      return { ...item, decants: mutateFn(currentDecants) };
    });
    saveItems(next);
    render(root);
  };

  const setGlobalCount = (value) => {
    const badge = document.getElementById("comparison-toggle-count");
    if (badge) {
      badge.textContent = value;
    }
  };

  const render = (root = document) => {
    const body = root.querySelector("#compare-body");
    const countEl = root.querySelector("#compare-count");
    const summaryCompra = root.querySelector("#summary-compra");
    const summaryVenta = root.querySelector("#summary-venta");
    const summaryGanancia = root.querySelector("#summary-ganancia");
    const summaryWrapper = root.querySelector("#summary-ganancia-wrapper");
    const summaryDot = root.querySelector("#summary-ganancia-dot");
    if (!body || !countEl) {
      return;
    }

    const items = loadItems();
    body.innerHTML = "";
    let totalCompraGeneral = 0;
    let totalVentaGeneral = 0;
    let totalGananciaGeneral = 0;

    const syncSummary = () => {
      if (summaryCompra) summaryCompra.textContent = formatPriceCLP(totalCompraGeneral);
      if (summaryVenta) summaryVenta.textContent = formatPriceCLP(totalVentaGeneral);
      if (summaryGanancia) summaryGanancia.textContent = formatPriceCLP(totalGananciaGeneral);
      if (summaryWrapper) {
        summaryWrapper.className =
          "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold " +
          (totalGananciaGeneral >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700");
      }
      if (summaryDot) {
        summaryDot.className =
          "h-2 w-2 rounded-full " + (totalGananciaGeneral >= 0 ? "bg-emerald-500" : "bg-rose-500");
      }
    };

    if (items.length === 0) {
      body.innerHTML = '<tr><td colspan="7" class="text-center text-slate-500 py-5 text-sm">Aún no agregas perfumes para comparar.</td></tr>';
      countEl.textContent = "0";
      setGlobalCount("0");
      if (typeof window.refreshComparisonUI === "function") {
        window.refreshComparisonUI();
      } else if (typeof window.updateComparisonFromStorage === "function") {
        window.updateComparisonFromStorage();
      }
      syncSummary();
      return;
    }

    items.forEach((item) => {
      const tr = document.createElement("tr");
      tr.className = "border-b border-slate-100 last:border-0";

      const tdPerfume = document.createElement("td");
      tdPerfume.className = "px-4 py-3";
      const wrapper = document.createElement("div");
      wrapper.className = "flex items-center gap-3";
      const thumb = document.createElement("div");
      thumb.className = "h-12 w-12 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center overflow-hidden";
      if (item.imagen) {
        const img = document.createElement("img");
        img.src = item.imagen;
        img.alt = item.nombre || "";
        img.className = "h-full w-full object-cover";
        thumb.appendChild(img);
      } else {
        thumb.textContent = "N/A";
        thumb.classList.add("text-xs", "text-slate-500");
      }
      const info = document.createElement("div");
      info.className = "leading-tight";
      const name = document.createElement("p");
      name.className = "text-sm font-semibold text-slate-800";
      name.textContent = item.nombre || "Perfume";
      const brand = document.createElement("p");
      brand.className = "text-xs text-slate-500";
      brand.textContent = item.marca || "";
      info.append(name, brand);
      wrapper.append(thumb, info);
      tdPerfume.appendChild(wrapper);

      // Decants
      const decants = Array.isArray(item.decants) ? item.decants : [];
      const decantBox = document.createElement("div");
      decantBox.className = "mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3";
      const decantHeader = document.createElement("div");
      decantHeader.className = "flex items-center justify-between text-xs font-semibold text-slate-700";
      const decantCount = document.createElement("span");
      decantCount.textContent = `Decants (${decants.length})`;
      const decantTotalLabel = document.createElement("span");
      const decantTotal = decants.reduce(
        (acc, d) => acc + (Number(d.precio) || 0) * (Number(d.cantidad) || 0),
        0
      );
      decantTotalLabel.textContent = `Total: ${formatPriceCLP(decantTotal)}`;
      decantHeader.append(decantCount, decantTotalLabel);
      decantBox.appendChild(decantHeader);

      const decantList = document.createElement("div");
      decantList.className = "space-y-2";

      const handleDecantUpdate = (decantId, patch) =>
        mutateDecants(item.id, (curr) =>
          curr.map((d) => (String(d.id) === String(decantId) ? { ...d, ...patch } : d)),
          root
        );

      decants.forEach((decant) => {
        const row = document.createElement("div");
        row.className = "grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs";

        const mlWrapper = document.createElement("div");
        mlWrapper.className = "col-span-3 flex items-center gap-1";
        const mlLabel = document.createElement("span");
        mlLabel.className = "text-slate-500";
        mlLabel.textContent = "ML";
        const mlInput = document.createElement("input");
        mlInput.type = "number";
        mlInput.min = "0";
        mlInput.step = "0.1";
        mlInput.value = Number(decant.ml) || 0;
        mlInput.className = "w-full rounded border border-slate-300 px-2 py-1";
        mlInput.addEventListener("change", () => {
          handleDecantUpdate(decant.id, { ml: Number(mlInput.value) || 0 });
        });
        mlWrapper.append(mlLabel, mlInput);

        const precioWrapper = document.createElement("div");
        precioWrapper.className = "col-span-3 flex items-center gap-1";
        const precioLabel = document.createElement("span");
        precioLabel.className = "text-slate-500";
        precioLabel.textContent = "$";
        const precioInput = document.createElement("input");
        precioInput.type = "number";
        precioInput.min = "0";
        precioInput.step = "1";
        precioInput.value = Number(decant.precio) || 0;
        precioInput.className = "w-full rounded border border-slate-300 px-2 py-1";
        precioInput.addEventListener("change", () => {
          handleDecantUpdate(decant.id, { precio: Number(precioInput.value) || 0 });
        });
        precioWrapper.append(precioLabel, precioInput);

        const cantidadWrapper = document.createElement("div");
        cantidadWrapper.className = "col-span-3 flex items-center gap-1";
        const cantidadLabel = document.createElement("span");
        cantidadLabel.className = "text-slate-500";
        cantidadLabel.textContent = "Qty";
        const cantidadInput = document.createElement("input");
        cantidadInput.type = "number";
        cantidadInput.min = "0";
        cantidadInput.step = "1";
        cantidadInput.value = Number(decant.cantidad) || 0;
        cantidadInput.className = "w-full rounded border border-slate-300 px-2 py-1";
        cantidadInput.addEventListener("change", () => {
          const val = Number(cantidadInput.value);
          handleDecantUpdate(decant.id, { cantidad: val >= 0 ? val : 0 });
        });
        cantidadWrapper.append(cantidadLabel, cantidadInput);

        const actionsWrapper = document.createElement("div");
        actionsWrapper.className = "col-span-3 flex items-center justify-end gap-2";
        const totalDecant = (Number(decant.precio) || 0) * (Number(decant.cantidad) || 0);
        const totalTag = document.createElement("span");
        totalTag.className = "rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700";
        totalTag.textContent = formatPriceCLP(totalDecant);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "text-[11px] font-semibold text-rose-600 hover:text-rose-500";
        removeBtn.textContent = "Quitar";
        removeBtn.addEventListener("click", () => {
          mutateDecants(
            item.id,
            (curr) => curr.filter((d) => String(d.id) !== String(decant.id)),
            root
          );
        });
        actionsWrapper.append(totalTag, removeBtn);

        row.append(mlWrapper, precioWrapper, cantidadWrapper, actionsWrapper);
        decantList.appendChild(row);
      });

      const addDecantBtn = document.createElement("button");
      addDecantBtn.type = "button";
      addDecantBtn.className =
        "flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100";
      addDecantBtn.innerHTML = '<i class="fa-solid fa-plus"></i><span>Agregar decant</span>';
      addDecantBtn.addEventListener("click", () => {
        mutateDecants(
          item.id,
          (curr) => [
            ...curr,
            {
              id: `d-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              ml: 0,
              precio: 0,
              cantidad: 1,
            },
          ],
          root
        );
      });

      decantBox.append(decantList, addDecantBtn);
      tdPerfume.appendChild(decantBox);

      const tdCantidad = document.createElement("td");
      tdCantidad.className = "px-4 py-3 whitespace-nowrap";
      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.min = "0";
      qtyInput.step = "1";
      qtyInput.value = Number.isFinite(item.cantidad) ? item.cantidad : 0;
      qtyInput.className = "w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-700";
      qtyInput.addEventListener("change", () => {
        const value = Number(qtyInput.value);
        updateItem(item.id, { cantidad: value >= 0 ? value : 0 }, root);
      });
      tdCantidad.appendChild(qtyInput);

      const tdPrecio = document.createElement("td");
      tdPrecio.className = "px-4 py-3 whitespace-nowrap text-sm font-semibold text-slate-800";
      tdPrecio.textContent = formatPriceCLP(item.precio);

      const tdTotal = document.createElement("td");
      tdTotal.className =
        "px-4 py-3 whitespace-nowrap text-sm font-semibold text-indigo-700 rounded-lg border border-indigo-100 bg-indigo-50/50";
      const qtyNumber = Number(item.cantidad) || 0;
      const precioUnit = Number(item.precio) || 0;
      const totalCompra = precioUnit * qtyNumber;
      tdTotal.textContent = formatPriceCLP(totalCompra);
      totalCompraGeneral += totalCompra;

      const tdVenta = document.createElement("td");
      tdVenta.className = "px-4 py-3 whitespace-nowrap";
      const ventaInput = document.createElement("input");
      ventaInput.type = "number";
      ventaInput.min = "0";
      ventaInput.step = "1";
      ventaInput.value = Number.isFinite(item.precio_venta) ? item.precio_venta : 0;
      ventaInput.className = "w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-700";
      ventaInput.addEventListener("change", () => {
        const value = Number(ventaInput.value);
        updateItem(item.id, { precio_venta: value >= 0 ? value : 0 }, root);
      });
      tdVenta.appendChild(ventaInput);

      const tdGanancia = document.createElement("td");
      const precioVenta = Number(item.precio_venta) || 0;
      const totalVenta = precioVenta * qtyNumber;
      const totalVentaFull = totalVenta + decantTotal;
      const totalGanancia = totalVentaFull - totalCompra;
      totalVentaGeneral += totalVentaFull;
      totalGananciaGeneral += totalGanancia;
      const gainClass =
        "px-4 py-3 whitespace-nowrap text-sm font-semibold rounded-lg border " +
        (totalGanancia >= 0
          ? "text-emerald-700 border-emerald-100 bg-emerald-50/60"
          : "text-rose-700 border-rose-200 bg-rose-50");
      tdGanancia.className = gainClass;
      tdGanancia.textContent = formatPriceCLP(totalGanancia);

      const tdAcciones = document.createElement("td");
      tdAcciones.className = "px-4 py-3 text-right";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "text-xs font-semibold text-rose-600 hover:text-rose-500";
      removeBtn.textContent = "Quitar";
        removeBtn.addEventListener("click", () => {
          const remaining = loadItems().filter((it) => String(it.id) !== String(item.id));
          saveItems(remaining);
          render(root);
        });
      tdAcciones.appendChild(removeBtn);

      tr.append(tdPerfume, tdCantidad, tdPrecio, tdTotal, tdVenta, tdGanancia, tdAcciones);
      body.appendChild(tr);
    });

    const totalItems = loadItems().length;
    countEl.textContent = String(totalItems);
    setGlobalCount(String(totalItems));
    if (typeof window.refreshComparisonUI === "function") {
      window.refreshComparisonUI();
    } else if (typeof window.updateComparisonFromStorage === "function") {
      window.updateComparisonFromStorage();
    }
    totalGananciaGeneral = totalVentaGeneral - totalCompraGeneral;
    syncSummary();
  };

  const bindControls = (root = document) => {
    const clearBtn = root.querySelector("#compare-clear");
    const refreshBtn = root.querySelector("#compare-refresh");
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.addEventListener("click", () => {
        saveItems([]);
        render(root);
      });
      clearBtn.dataset.bound = "true";
    }
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.addEventListener("click", () => render(root));
      refreshBtn.dataset.bound = "true";
    }
  };

  const initComparar = (scope = document) => {
    const hasElements =
      scope.querySelector &&
      scope.querySelector("#compare-body") &&
      scope.querySelector("#compare-count");
    if (!hasElements) {
      return;
    }
    render(scope);
    bindControls(scope);
  };

  const onReady = () => initComparar(document);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }

  window.initComparar = initComparar;
})();
