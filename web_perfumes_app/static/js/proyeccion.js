(() => {
  const formatCLP = (value) => {
    const num = Number(value) || 0;
    try {
      return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(num);
    } catch (e) {
      return `$${num.toLocaleString("es-CL")}`;
    }
  };

  const formatNum = (value) => {
    const num = Number(value) || 0;
    try {
      return num.toLocaleString("es-CL");
    } catch (e) {
      return `${num}`;
    }
  };

  const sanitizeNumber = (raw, fallback) => {
    const clean = (raw || "").toString().replace(/[^\d-]/g, "");
    if (!clean) return fallback;
    const val = parseInt(clean, 10);
    return Number.isFinite(val) ? val : fallback;
  };

  const parseField = (form, name, fallback) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return fallback;
    return sanitizeNumber(input.value, fallback);
  };

  const renderResultados = (root, data) => {
    const cont = root.querySelector("#proyeccion-resultados");
    if (!cont) return;

    cont.innerHTML = `
      <div class="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-xl ring-1 ring-black/5">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p class="text-[11px] uppercase tracking-[0.28em] text-slate-500">Proyección</p>
            <p class="text-lg font-semibold text-slate-900">Ingreso y unidades proyectadas</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span class="rounded-full bg-slate-100 px-3 py-1 font-semibold">Cálculo lineal</span>
            <span class="rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-700">${data.meses} meses</span>
          </div>
        </div>
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-[11px] uppercase tracking-[0.25em] text-slate-500">Ingreso total</p>
            <p class="text-2xl font-semibold text-slate-900">${formatCLP(data.totalIngreso)}</p>
            <p class="mt-1 text-xs text-slate-600">Promedio mensual: ${formatCLP(data.ingreso)}</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-[11px] uppercase tracking-[0.25em] text-slate-500">Unidades</p>
            <p class="text-2xl font-semibold text-slate-900">${formatNum(data.totalUnidades)}</p>
            <p class="mt-1 text-xs text-slate-600">${formatNum(data.perfumesMes)} perfumes/mes, ${formatNum(data.decantsMes)} decants/mes</p>
          </div>
          <div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-[11px] uppercase tracking-[0.25em] text-slate-500">Tiempo</p>
            <p class="text-2xl font-semibold text-slate-900">${formatNum(data.meses)} meses</p>
            <p class="mt-1 text-xs text-slate-600">Proyección lineal sin crecimiento</p>
          </div>
        </div>
      </div>
    `;
  };

  const initProyeccion = (root = document) => {
    const form = root.querySelector && root.querySelector("#proyeccion-form");
    if (!form) return;
    const ingresoInput = form.querySelector('[name="ingreso"]');
    const formatIngresoInput = () => {
      if (!ingresoInput) return;
      const raw = ingresoInput.value;
      const val = sanitizeNumber(raw, "");
      ingresoInput.value = val === "" ? "" : formatNum(val);
    };

    const resultados = () => {
      const ingreso = parseField(form, "ingreso", 500000);
      const perfumesMes = parseField(form, "perfumes", 20);
      const decantsMes = parseField(form, "decants", 40);
      const meses = parseInt(parseField(form, "horizonte", 6), 10) || 6;
      const totalIngreso = ingreso * meses;
      const totalUnidades = (perfumesMes + decantsMes) * meses;

      renderResultados(root, { ingreso, perfumesMes, decantsMes, meses, totalIngreso, totalUnidades });
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      resultados();
    });

    const resetBtn = root.querySelector("#proyeccion-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        form.reset();
        resultados();
      });
    }

    form.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("change", resultados);
    });

    if (ingresoInput) {
      ingresoInput.addEventListener("input", formatIngresoInput);
      formatIngresoInput();
    }
    resultados();
  };

  window.initProyeccion = initProyeccion;

  const onReady = () => initProyeccion(document);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
