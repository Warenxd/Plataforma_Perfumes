(() => {
  const grid = document.getElementById("perfumes-grid");
  const searchInput = document.getElementById("search");
  const filtersForm = document.getElementById("filters-form");
  const clearFiltersBtn = document.getElementById("clear-brand-filters");
  const brandInputSelector = 'input[name="marca"]';
  if (!grid || typeof window.fetch !== "function") {
    return;
  }

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

  const syncBrandFiltersFromUrl = (url) => {
    if (!filtersForm) {
      return;
    }
    try {
      const parsed = new URL(url, window.location.origin);
      const marcas = parsed.searchParams.getAll("marca");
      filtersForm.querySelectorAll(brandInputSelector).forEach((input) => {
        input.checked = marcas.includes(input.value);
      });
    } catch (error) {
      console.warn("No se pudo sincronizar los filtros de marcas", error);
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
      syncBrandFiltersFromUrl(url);
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
    url.searchParams.delete("marca");
    filtersForm
      .querySelectorAll(`${brandInputSelector}:checked`)
      .forEach((input) => {
        url.searchParams.append("marca", input.value);
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

  if (filtersForm) {
    filtersForm.addEventListener("change", (event) => {
      if (event.target.matches(brandInputSelector)) {
        event.preventDefault();
        applyFiltersFromSidebar();
      }
    });

    filtersForm.addEventListener("submit", (event) => {
      event.preventDefault();
      applyFiltersFromSidebar();
    });
  }

  if (clearFiltersBtn && filtersForm) {
    clearFiltersBtn.addEventListener("click", (event) => {
      event.preventDefault();
      filtersForm
        .querySelectorAll(brandInputSelector)
        .forEach((input) => (input.checked = false));
      applyFiltersFromSidebar();
    });
  }

  window.addEventListener("popstate", (event) => {
    if (event.state && typeof event.state.html === "string") {
      replaceContent(event.state.html);
      syncSearchInputFromUrl(window.location.href);
      syncBrandFiltersFromUrl(window.location.href);
    } else {
      window.location.reload();
    }
  });

  pushState(window.location.href, grid.innerHTML, true);
  syncSearchInputFromUrl(window.location.href);
  syncBrandFiltersFromUrl(window.location.href);
})();
