(() => {
  const STORAGE_KEY = "perfumes_comparar";
  const SHIPPING_OVERRIDES_KEY = "perfumes_comparar_envios";
  const shippingDefaults = {
    silk: { label: "Silk", valor: 6000 },
    yauras: { label: "Yauras", valor: 6000 },
    joy: { label: "Joy", valor: 4100 },
  };

  const formatPrice = (value) => {
    const num = Number(value) || 0;
    try {
      return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(num);
    } catch (error) {
      return `$${num.toLocaleString("es-CL")}`;
    }
  };

  const loadComparisonItems = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((i) => i && i.id);
    } catch (error) {
      console.warn("No se pudo leer comparison", error);
      return [];
    }
  };

  const inferShipping = (tiendaRaw) => {
    const name = (tiendaRaw || "").toLowerCase().trim();
    if (!name) return null;
    const overrides = loadShippingOverrides();
    if (overrides[name] !== undefined) {
      const val = Number(overrides[name]);
      if (Number.isFinite(val) && val >= 0) return val;
    }
    if (name.includes("silk")) return shippingDefaults.silk.valor;
    if (name.includes("yauras")) return shippingDefaults.yauras.valor;
    if (name.includes("joy")) return shippingDefaults.joy.valor;
    return null;
  };

  const loadShippingOverrides = () => {
    try {
      const raw = localStorage.getItem(SHIPPING_OVERRIDES_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  };

  const saveShippingOverride = (tienda, valor) => {
    const current = loadShippingOverrides();
    current[(tienda || "").toLowerCase().trim()] = valor;
    try {
      localStorage.setItem(SHIPPING_OVERRIDES_KEY, JSON.stringify(current));
    } catch (error) {
      console.warn("No se pudo guardar envío personalizado", error);
    }
  };

  const renderCompras = (root = document) => {
    const wrapper =
      (root && root.querySelector && root.querySelector("#compras-wrapper")) ||
      document.getElementById("compras-wrapper");
    if (!wrapper) return;

    const items = loadComparisonItems();
    if (!items.length) {
      wrapper.innerHTML =
        '<div class="rounded-3xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-slate-500">No has agregado perfumes. Usa “Agregar para comparar +” en el listado.</div>';
      return;
    }

    // Agrupar por tienda
    const storeMap = {};
    const minTotalByPerfume = {};
    items.forEach((item) => {
      const tienda = (item.tienda || "Sin tienda").trim();
      if (!storeMap[tienda]) storeMap[tienda] = [];
      storeMap[tienda].push(item);
      const key = String(item.id);
      const shippingGuess = inferShipping(tienda) || 0;
      const total = (Number(item.precio) || 0) + shippingGuess;
      if (!minTotalByPerfume[key] || total < minTotalByPerfume[key]) {
        minTotalByPerfume[key] = total;
      }
    });

    const stores = Object.keys(storeMap);
    const grid = document.createElement("div");
    grid.className = "grid gap-6 md:grid-cols-2 xl:grid-cols-3";

    const storeTotals = stores.map((tienda) => {
      const lista = storeMap[tienda] || [];
      const shipping = inferShipping(tienda) || 0;
      const total = lista.reduce((acc, p) => acc + (Number(p.precio) || 0), 0) + shipping;
      return { tienda, total };
    });
    const minStoreTotal = storeTotals.reduce(
      (min, s) => (min === null || s.total < min ? s.total : min),
      null
    );
    const minStoreCount = storeTotals.filter((s) => s.total === minStoreTotal).length;

    stores.forEach((tienda) => {
      const lista = storeMap[tienda]
        .slice()
        .sort((a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0));
      const shipping = inferShipping(tienda) || 0;
      const totalTienda = lista.reduce((acc, p) => acc + (Number(p.precio) || 0), 0) + shipping;
      const storeIsBest =
        minStoreTotal !== null && minStoreCount === 1 && totalTienda === minStoreTotal;
      const card = document.createElement("div");
      card.className =
        "rounded-[28px] border shadow-xl p-5 space-y-5 ring-1 ring-black/5 " +
        (storeIsBest
          ? "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50"
          : "border-slate-200 bg-white");
      const header = document.createElement("div");
      header.className = "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";
      const totalBadge = storeIsBest
        ? `<span class="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3.5 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 shadow-sm">
            <i class="fa-solid fa-trophy"></i> Mejor total: ${formatPrice(totalTienda)}
          </span>`
        : `<span class="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3.5 py-1.5 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-100 shadow-sm">
            Total tienda: ${formatPrice(totalTienda)}
          </span>`;
      header.innerHTML = `
        <div class="space-y-2">
          <p class="text-[12px] uppercase tracking-[0.28em] text-slate-500">Tienda</p>
          <p class="text-xl font-semibold text-slate-900 flex items-center gap-3">
            <span class="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white text-sm shadow">${tienda.charAt(0) || "T"}</span>
            <span class="text-2xl">${tienda}</span>
          </p>
          <label class="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-600">
            Envío:
            <input type="number" min="0" inputmode="numeric" value="${shipping || 0}"
              class="w-32 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 shadow-sm focus:border-indigo-400 focus:outline-none"
              data-store-shipping="${tienda}">
            <span class="text-[11px] text-slate-500">(aplica una vez)</span>
          </label>
        </div>
        <div class="text-right space-y-2">
          <span class="block rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">${lista.length} perfume(s)</span>
          ${totalBadge}
        </div>
      `;
      const list = document.createElement("div");
      list.className = "space-y-4";

      lista.forEach((perfume) => {
        const price = Number(perfume.precio) || 0;
        const total = price + shipping;
        const row = document.createElement("div");
        row.className = "rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base shadow-sm ring-1 ring-white/60";
        row.innerHTML = `
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="flex items-start gap-3">
              <div class="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
                ${
                  perfume.imagen
                    ? `<img src="${perfume.imagen}" alt="${perfume.nombre || ""}" class="h-full w-full object-cover">`
                    : '<span class="text-[11px] text-slate-500">Sin foto</span>'
                }
              </div>
              <div class="leading-tight">
                <p class="text-[12px] uppercase tracking-[0.18em] text-slate-500">${perfume.marca || ""}</p>
                <p class="text-base font-semibold text-slate-900">${perfume.nombre || "Perfume"}</p>
              </div>
            </div>
            <div class="text-right space-y-1">
              <span class="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3.5 py-1.5 text-sm font-semibold text-indigo-700">
                Precio: ${formatPrice(perfume.precio)}
              </span>
              <div class="text-sm text-slate-600 font-semibold text-indigo-700">Total con envío tienda: ${formatPrice(total)}</div>
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            ${
              perfume.url
                ? `<a class="text-indigo-600 hover:text-indigo-500 font-semibold" href="${perfume.url}" target="_blank" rel="noopener">Ver tienda</a>`
                : "Sin enlace"
            }
            <button class="text-[11px] font-semibold text-rose-600 hover:text-rose-500" data-remove-perfume="${perfume.id}">Quitar</button>
          </div>
        `;
        list.appendChild(row);
      });

      card.append(header, list);
      grid.appendChild(card);
    });

    wrapper.innerHTML = "";
    wrapper.appendChild(grid);

    if (!wrapper.dataset.handlersBound) {
      wrapper.addEventListener("click", (event) => {
        const removeBtn = event.target.closest("[data-remove-perfume]");
        if (removeBtn) {
          const id = removeBtn.dataset.removePerfume;
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (Array.isArray(parsed)) {
              const next = parsed.filter((p) => String(p.id) !== String(id));
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            }
          } catch (error) {
            console.warn("No se pudo quitar el perfume", error);
          }
          renderCompras(root);
          if (typeof window.refreshComparisonUI === "function") {
            window.refreshComparisonUI();
          } else if (typeof window.updateComparisonFromStorage === "function") {
            window.updateComparisonFromStorage();
          }
        }
      });

      wrapper.addEventListener("change", (event) => {
        const input = event.target.closest("[data-store-shipping]");
        if (input) {
          const tienda = input.dataset.storeShipping;
          const val = Number(input.value);
          const safe = Number.isFinite(val) && val >= 0 ? val : 0;
          input.value = safe;
          saveShippingOverride(tienda, safe);
          renderCompras(root);
        }
      });

      wrapper.dataset.handlersBound = "1";
    }
  };

  const initCompararCompras = (root = document) => {
    renderCompras(root);
  };

  window.initCompararCompras = initCompararCompras;

  const onReady = () => initCompararCompras(document);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
