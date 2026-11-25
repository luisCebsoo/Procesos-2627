/**
 * GUI + Controlador del cliente BrewLab (Rediseño Luxury Dark Espresso V2.0).
 *
 * Arquitectura:
 * - Habla con el backend EXCLUSIVAMENTE a través de `Com`.
 * - Jamás realiza llamadas `fetch` directas ni contiene persistencia.
 * - Gestiona eventos del DOM, navegación dock, catálogo con filtros Santo Amaro,
 *   formulario inteligente por método, recetario con enlaces externos y carga automática,
 *   gráfica semanal de consumo minimalista y copia de ficha de barista.
 */
"use strict";

(function () {
  const Com = window.Com;
  const $ = (id) => document.getElementById(id);

  // Helper para mostrar mensajes de feedback
  function mostrarMsg(id, texto, esError = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = texto || "";
    el.className = "msg " + (esError ? "msg-error" : "msg-success");
    if (!texto) {
      el.style.display = "none";
    } else {
      el.style.display = "block";
    }
  }

  // Toast flotante no intrusivo para compartir ficha
  function mostrarToast(texto) {
    const existente = document.querySelector(".toast-barista");
    if (existente) existente.remove();

    const toast = document.createElement("div");
    toast.className = "toast-barista";
    toast.textContent = texto;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      toast.style.opacity = "0";
      toast.style.transform = "translateY(20px)";
      setTimeout(() => toast.remove(), 400);
    }, 2800);
  }

  // — Estado del Servidor —
  async function pintarEstado() {
    try {
      const data = await Com.health();
      $("estado").textContent = "Activo (" + data.servicio + ", usuarios: " + data.usuarios + ")";
    } catch (e) {
      $("estado").textContent = "Sin conexión: " + e.message;
    }
  }

  // — Sistema de Pestañas Flotantes —
  function cambiarTab(targetTab) {
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === targetTab));

    document.querySelectorAll(".tab-content").forEach((panel) => {
      panel.hidden = panel.id !== targetTab;
    });

    if (targetTab === "tab-descubrir") {
      pintarCatalogo();
    } else if (targetTab === "tab-extracciones") {
      pintarExtracciones();
      pintarConsumoSemanal();
    } else if (targetTab === "tab-comunidad") {
      pintarComunidad();
    } else if (targetTab === "tab-admin") {
      pintarAdmin();
    } else if (targetTab === "tab-despensa") {
      pintarBolsas();
    }
  }

  function configurarTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        cambiarTab(btn.getAttribute("data-tab"));
      });
    });
  }

  // — Filtros tipo Píldora para Métodos en Comunidad —
  function configurarPillsMetodos() {
    const pills = document.querySelectorAll("#pills-metodos-comunidad .pill-btn");
    pills.forEach((pill) => {
      pill.addEventListener("click", () => {
        pills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");

        const metodo = pill.getAttribute("data-metodo") || "";
        const select = $("com-metodo");
        if (select) {
          select.value = metodo;
        }
        pintarComunidad();
      });
    });
  }

  // — Control de Sesión y Vistas —
  function pintarSesion() {
    const sesion = Com.leerSesion();
    const dentro = !!(sesion && sesion.token && sesion.usuario);
    const admin = dentro && sesion.usuario.rol === "admin";

    // Actualizar badge de usuario en la cabecera
    const sesionEl = $("sesion");
    const avatarEl = document.querySelector(".avatar-circle");
    if (dentro) {
      const inicial = (sesion.usuario.email || "B").charAt(0).toUpperCase();
      if (avatarEl) avatarEl.textContent = inicial;
      sesionEl.textContent = `${sesion.usuario.email} (${sesion.usuario.rol})`;
    } else {
      if (avatarEl) avatarEl.textContent = "B";
      sesionEl.textContent = "sin sesión";
    }

    $("zona-sesion").hidden = !dentro;
    $("zona-invitado").hidden = dentro;
    $("zona-autenticado").hidden = !dentro;

    const navAdmin = $("nav-admin");
    if (navAdmin) {
      navAdmin.hidden = !admin;
    }

    if (dentro) {
      // Información de Mi Cuenta
      $("cuenta-email").textContent = sesion.usuario.email;
      $("cuenta-rol").textContent = sesion.usuario.rol;
      $("cuenta-estado").textContent = sesion.usuario.estado;

      // Cargar datos
      pintarBolsas();
      pintarExtracciones();
      pintarConsumoSemanal();
      pintarCatalogo();
      pintarComunidad();

      if (admin) {
        pintarAdmin();
      }
    }
  }

  // — 1. MÓDULO: DESPENSA DE CAFÉ —
  async function pintarBolsas() {
    try {
      const bolsas = await Com.listarBolsas();
      const contenedor = $("lista-bolsas");
      const selectorExt = $("ext-bolsa");

      // Actualizar selector de extracción
      if (selectorExt) {
        selectorExt.innerHTML = '<option value="">Selecciona una bolsa de tu despensa...</option>';
      }

      if (!bolsas || bolsas.length === 0) {
        contenedor.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-state-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
                <line x1="6" y1="1" x2="6" y2="4"></line>
                <line x1="10" y1="1" x2="10" y2="4"></line>
                <line x1="14" y1="1" x2="14" y2="4"></line>
              </svg>
            </div>
            <p>Tu despensa está vacía. Añade tu primera bolsa o explora en «Descubrir Café».</p>
          </div>
        `;
        return;
      }

      contenedor.innerHTML = "";

      bolsas.forEach((b) => {
        const inicial = Number(b.gramosIniciales) || 1;
        const restante = Number(b.gramosRestantes) || 0;
        const pct = Math.max(0, Math.min(100, Math.round((restante / inicial) * 100)));
        const esAgotada = b.estado === "agotada" || restante <= 0;

        // Añadir al selector de extracción si tiene café
        if (selectorExt && !esAgotada) {
          const opt = document.createElement("option");
          opt.value = b.id;
          opt.textContent = `${b.nombre} (${b.origen}) — ${restante}g disponibles`;
          selectorExt.appendChild(opt);
        }

        const card = document.createElement("div");
        card.className = "item-card";
        card.innerHTML = `
          <div>
            <div class="item-card-header">
              <div>
                <h4 class="item-title">${escapeHTML(b.nombre)}</h4>
                <span class="item-subtitle">${escapeHTML(b.origen)}</span>
              </div>
              <span class="badge ${esAgotada ? "badge-depleted" : "badge-active"}">
                ${esAgotada ? "Agotada" : "En despensa"}
              </span>
            </div>

            <div class="item-meta">
              <p><strong>Tostador:</strong> ${escapeHTML(b.tostador || "Desconocido")}</p>
              <p><strong>Variedad:</strong> ${escapeHTML(b.variedad || "Variada")} · <strong>Proceso:</strong> ${escapeHTML(b.proceso || "Lavado")}</p>
            </div>

            <div style="margin: 0.85rem 0 0.5rem 0;">
              <div style="display: flex; justify-content: space-between; font-size: 0.82rem; font-weight: 600;">
                <span style="color: var(--text-muted);">Stock disponible</span>
                <span style="color: var(--accent);">${restante}g / ${inicial}g (${pct}%)</span>
              </div>
              <div class="progress-bar-container">
                <div class="progress-bar-fill ${esAgotada ? "depleted" : ""}" style="width: ${pct}%;"></div>
              </div>
            </div>
          </div>

          <div class="item-footer">
            <span style="font-size: 0.78rem; color: var(--text-muted);">${formatearFecha(b.creadaEn)}</span>
            <button type="button" class="btn btn-danger btn-sm btn-borrar-bolsa" data-id="${b.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              Borrar
            </button>
          </div>
        `;

        card.querySelector(".btn-borrar-bolsa").addEventListener("click", async () => {
          if (confirm(`¿Seguro que deseas eliminar la bolsa "${b.nombre}"?`)) {
            try {
              await Com.borrarBolsa(b.id);
              mostrarMsg("bolsa-msg", "Bolsa eliminada con éxito.");
              pintarBolsas();
            } catch (err) {
              mostrarMsg("bolsa-msg", "ERROR: " + err.message, true);
            }
          }
        });

        contenedor.appendChild(card);
      });
    } catch (e) {
      mostrarMsg("bolsa-msg", "ERROR al cargar bolsas: " + e.message, true);
    }
  }

  // — 2. MÓDULO: DESCUBRIR CAFÉ (Filtros Santo Amaro) —
  function configurarFiltrosCatalogo() {
    const pillContainers = [
      "filter-pills-cafeina",
      "filter-pills-consumo",
      "filter-pills-cafetera",
      "filter-pills-sabor",
      "filter-pills-intensidad",
    ];

    pillContainers.forEach((id) => {
      const el = $(id);
      if (!el) return;
      const pills = el.querySelectorAll(".pill-btn");
      pills.forEach((pill) => {
        pill.addEventListener("click", () => {
          pills.forEach((p) => p.classList.remove("active"));
          pill.classList.add("active");
          pintarCatalogo();
        });
      });
    });
  }

  function leerFiltrosCatalogo() {
    const obtenerActivo = (id) => {
      const el = $(id);
      if (!el) return "";
      const active = el.querySelector(".pill-btn.active");
      return active ? active.getAttribute("data-val") || "" : "";
    };

    return {
      cafeina: obtenerActivo("filter-pills-cafeina"),
      tipoConsumo: obtenerActivo("filter-pills-consumo"),
      cafetera: obtenerActivo("filter-pills-cafetera"),
      perfilSabor: obtenerActivo("filter-pills-sabor"),
      intensidad: obtenerActivo("filter-pills-intensidad"),
    };
  }

  async function pintarCatalogo() {
    try {
      const criterios = leerFiltrosCatalogo();
      const cafes = await Com.descubrirCatalogo(criterios);
      const contenedor = $("grid-catalogo");
      if (!contenedor) return;

      if (!cafes || cafes.length === 0) {
        contenedor.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-state-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <p>No se encontraron cafés con estos filtros. Prueba otra combinación de opciones.</p>
          </div>
        `;
        return;
      }

      contenedor.innerHTML = "";

      cafes.forEach((c) => {
        const card = document.createElement("div");
        card.className = "item-card";
        card.innerHTML = `
          <div>
            <div class="item-card-header">
              <div>
                <h4 class="item-title">${escapeHTML(c.nombre)}</h4>
                <span class="item-subtitle">${escapeHTML(c.origen)} · ${escapeHTML(c.tostador)}</span>
              </div>
              <span class="badge badge-sca">★ ${c.puntuacionSca} SCA</span>
            </div>

            <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin: 0.75rem 0;">
              <span class="badge ${c.cafeina === "descafeinado" ? "badge-depleted" : "badge-active"}">
                ${c.cafeina === "descafeinado" ? "Descafeinado" : "Normal"}
              </span>
              <span class="badge badge-method">${escapeHTML(c.perfilSabor)}</span>
              <span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-muted); border: 1px solid var(--border);">
                Intensidad ${escapeHTML(c.intensidad)}
              </span>
            </div>

            <p style="font-size: 0.88rem; color: var(--text-main); line-height: 1.5; margin-bottom: 0.75rem;">
              ${escapeHTML(c.descripcion)}
            </p>

            <div class="item-notes" style="margin-bottom: 1rem;">
              <strong>Notas:</strong> ${escapeHTML(c.notasSabor)}
            </div>
          </div>

          <div class="item-footer" style="padding-top: 1rem; border-top: 1px solid var(--border);">
            <button type="button" class="btn btn-primary btn-block btn-importar-cafe" data-id="${c.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 0.4rem;">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Añadir a mi despensa (250g)
            </button>
          </div>
        `;

        card.querySelector(".btn-importar-cafe").addEventListener("click", async () => {
          try {
            await Com.importarCafeADespensa(c.id, 250);
            mostrarMsg("descubrir-msg", `"${c.nombre}" añadido con éxito a tu despensa.`);
            pintarBolsas();
            $("descubrir-msg").scrollIntoView({ behavior: "smooth", block: "center" });
          } catch (err) {
            mostrarMsg("descubrir-msg", "ERROR al añadir café: " + err.message, true);
          }
        });

        contenedor.appendChild(card);
      });
    } catch (e) {
      console.error("Error al pintar catálogo:", e);
    }
  }

  // — 3. MÓDULO: DIARIO DE EXTRACCIONES & CALCULADORA CONTEXTUAL —
  function configurarCalculadoraRatio() {
    const cafeInput = $("ext-cafe");
    const aguaInput = $("ext-agua");
    const metodoSelect = $("ext-metodo");
    const aguaLabel = $("lbl-ext-agua");
    const mokaContainer = $("moka-dosis-container");
    const ratioDisplay = $("calc-ratio-display");
    const ratioHint = $("calc-ratio-hint");

    function calcular() {
      const cafe = parseFloat(cafeInput.value);
      const agua = parseFloat(aguaInput.value);
      const metodo = (metodoSelect.value || "").toLowerCase();

      if (cafe > 0 && agua > 0) {
        const ratio = (agua / cafe).toFixed(1);
        const ratioNum = parseFloat(ratio);
        ratioDisplay.textContent = "1 : " + ratio;

        let rangoOptimo = "";
        let esOptimo = false;

        if (metodo.includes("espresso")) {
          esOptimo = ratioNum >= 1.8 && ratioNum <= 2.5;
          rangoOptimo = "Rango ideal espresso: 1:1.8 a 1:2.5";
        } else if (metodo.includes("moka") || metodo.includes("italiana")) {
          esOptimo = ratioNum >= 8 && ratioNum <= 10;
          rangoOptimo = "Rango ideal cafetera italiana: 1:8 a 1:10";
        } else {
          esOptimo = ratioNum >= 15 && ratioNum <= 17;
          rangoOptimo = "Rango ideal filtro de especialidad: 1:15 a 1:17";
        }

        if (esOptimo) {
          ratioDisplay.style.color = "var(--success)";
          ratioHint.innerHTML = `<strong style="color: var(--success);">Ratio óptimo validado.</strong> ${rangoOptimo}`;
        } else {
          ratioDisplay.style.color = "var(--accent)";
          ratioHint.textContent = `${cafe}g café / ${agua}g agua · ${rangoOptimo}`;
        }
      } else {
        ratioDisplay.textContent = "1 : --";
        ratioDisplay.style.color = "var(--accent)";
        ratioHint.textContent = "Introduce gramos de café y agua para calcular en tiempo real";
      }
    }

    function actualizarContextoMetodo() {
      const metodo = (metodoSelect.value || "").toLowerCase();

      if (metodo.includes("espresso")) {
        if (aguaLabel) aguaLabel.textContent = "Líquido en taza / Rendimiento (Yield en gramos) *";
        if (aguaInput) aguaInput.placeholder = "36";
        if (mokaContainer) mokaContainer.style.display = "none";
      } else if (metodo.includes("moka") || metodo.includes("italiana")) {
        if (aguaLabel) aguaLabel.textContent = "Capacidad de la cafetera / Agua en base *";
        if (aguaInput) aguaInput.placeholder = "130";
        if (mokaContainer) mokaContainer.style.display = "block";
      } else {
        if (aguaLabel) aguaLabel.textContent = "Agua vertida sobre filtro (g) *";
        if (aguaInput) aguaInput.placeholder = "250";
        if (mokaContainer) mokaContainer.style.display = "none";
      }
      calcular();
    }

    cafeInput.addEventListener("input", calcular);
    aguaInput.addEventListener("input", calcular);
    if (metodoSelect) {
      metodoSelect.addEventListener("change", actualizarContextoMetodo);
    }

    // Píldoras rápidas para cafetera italiana Moka
    const mokaPills = document.querySelectorAll("#pills-moka-dosis .pill-btn");
    mokaPills.forEach((btn) => {
      btn.addEventListener("click", () => {
        const agua = btn.getAttribute("data-agua");
        const cafe = btn.getAttribute("data-cafe");
        if (aguaInput && agua) aguaInput.value = agua;
        if (cafeInput && cafe) cafeInput.value = cafe;
        calcular();
      });
    });

    actualizarContextoMetodo();
  }

  // — Widget de Consumo Semanal (últimos 7 días) —
  async function pintarConsumoSemanal() {
    try {
      const resumen = await Com.consumoSemanal();
      if (!resumen) return;

      const totalGramosEl = $("weekly-total-gramos");
      if (totalGramosEl) {
        totalGramosEl.textContent = (resumen.totalGramos || 0) + "g";
      }

      const barsContainer = $("weekly-chart-bars");
      if (barsContainer && Array.isArray(resumen.dias)) {
        barsContainer.innerHTML = "";

        const maxGramos = Math.max(...resumen.dias.map((d) => d.gramos || 0), 25);
        const hoyIso = new Date().toISOString().slice(0, 10);

        resumen.dias.forEach((dia) => {
          const col = document.createElement("div");
          col.className = "weekly-chart-col";

          const pct = Math.max(0, Math.min(100, Math.round(((dia.gramos || 0) / maxGramos) * 100)));
          const esHoy = dia.fecha === hoyIso;

          col.innerHTML = `
            <span class="weekly-chart-val">${dia.gramos > 0 ? dia.gramos + "g" : ""}</span>
            <div class="weekly-chart-bar-wrap">
              <div class="weekly-chart-bar-fill ${esHoy ? "active-today" : ""}" style="height: ${Math.max(pct, 4)}%;"></div>
            </div>
            <span class="weekly-chart-label" style="${esHoy ? "color: var(--accent); font-weight: 700;" : ""}">${dia.diaSemana}</span>
          `;
          barsContainer.appendChild(col);
        });
      }

      // Reparto por método
      const breakdownContainer = $("weekly-methods-breakdown");
      if (breakdownContainer) {
        breakdownContainer.innerHTML = "";
        const metodos = Object.keys(resumen.porMetodo || {});
        if (metodos.length === 0) {
          breakdownContainer.innerHTML = '<span style="font-size: 0.78rem; color: var(--text-muted);">Sin extracciones registradas esta semana.</span>';
        } else {
          metodos.forEach((m) => {
            const data = resumen.porMetodo[m];
            const pill = document.createElement("span");
            pill.className = "weekly-method-pill";
            pill.innerHTML = `${escapeHTML(m)}: <strong>${data.gramos}g (${data.porcentaje}%)</strong>`;
            breakdownContainer.appendChild(pill);
          });
        }
      }

      // Métricas económicas opcionales (DESACTIVADAS por defecto)
      const economicContainer = $("weekly-economic-summary");
      const activoEconomico = localStorage.getItem("brewlab.metricas_economicas") === "true";
      if (economicContainer) {
        if (activoEconomico && resumen.totalGramos > 0) {
          economicContainer.style.display = "flex";
          const tazas = Math.round(resumen.totalGramos / 15) || 1;
          const costeCasa = (tazas * 0.35).toFixed(2);
          const costeCafeteria = (tazas * 2.5).toFixed(2);
          const ahorro = (tazas * (2.5 - 0.35)).toFixed(2);
          economicContainer.innerHTML = `
            <span>Consumo estimado: <strong>~${tazas} tazas</strong> (${costeCasa} € en BrewLab vs ${costeCafeteria} € en cafetería)</span>
            <span>Ahorro estimado esta semana: <strong>+${ahorro} €</strong></span>
          `;
        } else {
          economicContainer.style.display = "none";
          economicContainer.innerHTML = "";
        }
      }
    } catch (e) {
      console.error("Error al pintar consumo semanal:", e);
    }
  }

  // — Copiar Ficha de Barista estilizada al portapapeles —
  function copiarFichaBarista(e) {
    const puntuacionNum = Number(e.puntuacion) || 0;
    const estrellas = puntuacionNum > 0 ? "★".repeat(puntuacionNum) + ` (${puntuacionNum}/5)` : "Sin valorar";
    const tiempo = e.tiempoSegundos ? `${e.tiempoSegundos}s` : "No registrado";

    const ticket = [
      "☕ BREWLAB · FICHA DE BARISTA",
      "─────────────────────────────",
      `Café: ${e.nombreCafe}`,
      `Origen: ${e.origen}`,
      `Método: ${e.metodo}`,
      `Dosis: ${e.cafeGramos}g café · ${e.aguaGramos}g agua · Ratio 1:${e.ratio}`,
      `Molienda: ${e.molienda || "Media"} · Tiempo: ${tiempo}`,
      `Notas sensoriales: ${e.notasSabor || "Sin notas adicionales"}`,
      `Valoración: ${estrellas}`,
      "─────────────────────────────",
      "Preparado con BrewLab · Procesos-2627",
    ].join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ticket).then(() => {
        mostrarToast("Ficha de barista copiada al portapapeles");
      }).catch(() => {
        mostrarToast("Ficha generada para compartir");
      });
    } else {
      mostrarToast("Ficha generada para compartir");
    }
  }

  // — Listado de Mis Extracciones —
  async function pintarExtracciones() {
    try {
      const extracciones = await Com.listarExtracciones();
      const contenedor = $("lista-extracciones");

      if (!extracciones || extracciones.length === 0) {
        contenedor.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-state-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 3v18"></path>
                <path d="M6 8l6-3 6 3"></path>
                <path d="M6 8l-4 7h8l-4-7z"></path>
                <path d="M18 8l-4 7h8l-4-7z"></path>
                <path d="M4 21h16"></path>
              </svg>
            </div>
            <p>Aún no has registrado extracciones. Prepara una receta arriba.</p>
          </div>
        `;
        return;
      }

      contenedor.innerHTML = "";

      extracciones.forEach((e) => {
        const puntuacionNum = Number(e.puntuacion) || 0;
        const card = document.createElement("div");
        card.className = "item-card";
        card.innerHTML = `
          <div>
            <div class="item-card-header">
              <div>
                <h4 class="item-title">${escapeHTML(e.nombreCafe)}</h4>
                <span class="item-subtitle">${escapeHTML(e.origen)}</span>
              </div>
              <div style="display: flex; gap: 0.4rem; align-items: center;">
                ${puntuacionNum > 0 ? `<span class="badge-rating">★ ${puntuacionNum}.0</span>` : ""}
                <span class="badge ${e.esPublica ? "badge-public" : "badge-private"}">
                  ${e.esPublica ? "Pública" : "Privada"}
                </span>
              </div>
            </div>

            <div style="display: flex; gap: 0.6rem; align-items: center; margin: 0.75rem 0;">
              <span class="badge badge-method">${escapeHTML(e.metodo)}</span>
              <span style="font-family: var(--font-serif); font-size: 1.15rem; font-weight: 700; color: var(--accent);">
                Ratio 1:${e.ratio}
              </span>
            </div>

            <div class="item-meta">
              <p><strong>Dosis:</strong> ${e.cafeGramos}g café / ${e.aguaGramos}g agua</p>
              <p><strong>Molienda:</strong> ${escapeHTML(e.molienda || "Media")} ${e.tiempoSegundos ? `· <strong>Tiempo:</strong> ${e.tiempoSegundos}s` : ""}</p>
            </div>

            ${e.notasSabor ? `<div class="item-notes">“${escapeHTML(e.notasSabor)}”</div>` : ""}
          </div>

          <div class="item-footer">
            <span style="font-size: 0.78rem; color: var(--text-muted);">${formatearFecha(e.creadaEn)}</span>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button type="button" class="btn-compartir-ficha">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                  <polyline points="16 6 12 2 8 6"></polyline>
                  <line x1="12" y1="2" x2="12" y2="15"></line>
                </svg>
                Compartir Ficha
              </button>
              <button type="button" class="btn btn-danger btn-sm btn-borrar-extraccion" data-id="${e.id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Borrar
              </button>
            </div>
          </div>
        `;

        card.querySelector(".btn-compartir-ficha").addEventListener("click", () => {
          copiarFichaBarista(e);
        });

        card.querySelector(".btn-borrar-extraccion").addEventListener("click", async () => {
          if (confirm("¿Deseas eliminar este registro de extracción?")) {
            try {
              await Com.borrarExtraccion(e.id);
              mostrarMsg("ext-msg", "Extracción eliminada con éxito.");
              pintarExtracciones();
              pintarConsumoSemanal();
            } catch (err) {
              mostrarMsg("ext-msg", "ERROR: " + err.message, true);
            }
          }
        });

        contenedor.appendChild(card);
      });
    } catch (e) {
      mostrarMsg("ext-msg", "ERROR al cargar extracciones: " + e.message, true);
    }
  }

  // — 4. MÓDULO: COMUNIDAD DE RECETAS & RECETAS MAESTRAS DE INTERNET —
  function cargarRecetaEnDiario(r) {
    cambiarTab("tab-extracciones");

    const selectMetodo = $("ext-metodo");
    if (selectMetodo) {
      let encontrado = false;
      const metodoLimpio = (r.metodo || "").toLowerCase();
      for (const opt of selectMetodo.options) {
        if (
          opt.value.toLowerCase() === metodoLimpio ||
          opt.text.toLowerCase().includes(metodoLimpio)
        ) {
          selectMetodo.value = opt.value;
          encontrado = true;
          break;
        }
      }
      if (!encontrado && selectMetodo.options.length > 0) {
        selectMetodo.value = selectMetodo.options[0].value;
      }
      selectMetodo.dispatchEvent(new Event("change"));
    }

    if ($("ext-cafe")) $("ext-cafe").value = r.cafeGramos || "";
    if ($("ext-agua")) $("ext-agua").value = r.aguaGramos || "";
    if ($("ext-tiempo") && r.tiempoSegundos) $("ext-tiempo").value = r.tiempoSegundos;
    if ($("ext-molienda") && r.molienda) {
      for (const opt of $("ext-molienda").options) {
        if (opt.value.toLowerCase().includes(r.molienda.toLowerCase())) {
          $("ext-molienda").value = opt.value;
          break;
        }
      }
    }
    if ($("ext-notas") && r.notasSabor) $("ext-notas").value = r.notasSabor;

    $("calc-ratio-display").textContent = "1 : " + r.ratio;
    mostrarMsg("ext-msg", `Receta "${r.nombreCafe}" cargada en tu diario. Selecciona tu bolsa y registra la extracción.`);
    $("form-extraccion").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function pintarComunidad() {
    try {
      const buscar = $("com-buscar") ? $("com-buscar").value.trim() : "";
      const metodo = $("com-metodo") ? $("com-metodo").value.trim() : "";

      const recetas = await Com.listarComunidad({ buscar, metodo, incluirMaestras: true });
      const contenedor = $("muro-comunidad");
      if (!contenedor) return;

      if (!recetas || recetas.length === 0) {
        contenedor.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-state-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <p>No se encontraron recetas públicas con los criterios seleccionados.</p>
          </div>
        `;
        return;
      }

      contenedor.innerHTML = "";

      recetas.forEach((r) => {
        const puntuacionNum = Number(r.puntuacion) || 0;
        const esMaestra = Boolean(r.esMaestra);
        const card = document.createElement("div");
        card.className = "item-card";

        card.innerHTML = `
          <div>
            <div class="item-card-header">
              <div>
                <h4 class="item-title">${escapeHTML(r.nombreCafe)}</h4>
                <span class="item-subtitle">${escapeHTML(r.origen)}</span>
              </div>
              <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
                ${esMaestra ? '<span class="badge badge-master">★ Receta Maestra</span>' : ""}
                ${puntuacionNum > 0 ? `<span class="badge-rating">★ ${puntuacionNum}.0</span>` : ""}
                <span class="badge badge-method">${escapeHTML(r.metodo)}</span>
              </div>
            </div>

            <div style="margin: 0.75rem 0 0.5rem 0;">
              <span style="font-family: var(--font-serif); font-size: 1.35rem; font-weight: 700; color: var(--accent);">
                Ratio 1:${r.ratio}
              </span>
              <span style="font-size: 0.85rem; color: var(--text-muted); margin-left: 0.5rem;">
                (${r.cafeGramos}g café / ${r.aguaGramos}g agua)
              </span>
            </div>

            <div class="item-meta">
              <p><strong>Molienda:</strong> ${escapeHTML(r.molienda || "Media")} ${r.tiempoSegundos ? `· <strong>Tiempo:</strong> ${r.tiempoSegundos}s` : ""}</p>
            </div>

            ${r.notasSabor ? `<div class="item-notes">“${escapeHTML(r.notasSabor)}”</div>` : ""}

            ${r.urlExterna ? `
              <div style="margin: 0.85rem 0 0.25rem 0;">
                <a href="${escapeHTML(r.urlExterna)}" target="_blank" rel="noopener noreferrer" class="link-externo">
                  Ver receta original / vídeo ↗
                </a>
              </div>
            ` : ""}
          </div>

          <div class="item-footer" style="flex-wrap: wrap; gap: 0.5rem;">
            <span style="font-size: 0.82rem; color: var(--text-muted);">
              ${esMaestra ? `Autor: <strong style="color: var(--accent);">${escapeHTML(r.autor || "Maestro Barista")}</strong>` : `Barista: <strong style="color: var(--text-main);">${escapeHTML(r.usuarioEmail ? r.usuarioEmail.split("@")[0] : "Anónimo")}</strong>`}
            </span>
            <button type="button" class="btn-cargar-diario">
              Cargar en mi diario
            </button>
          </div>
        `;

        card.querySelector(".btn-cargar-diario").addEventListener("click", () => {
          cargarRecetaEnDiario(r);
        });

        contenedor.appendChild(card);
      });
    } catch (e) {
      console.error("Error al cargar comunidad:", e);
    }
  }

  // — 5. MÓDULO: ADMINISTRACIÓN Y MÉTRICAS GLOBALES —
  async function pintarAdmin() {
    const sesion = Com.leerSesion();
    if (!sesion || !sesion.usuario || sesion.usuario.rol !== "admin") {
      return;
    }

    try {
      const m = await Com.obtenerMetricas();
      $("metric-cafe-consumido").textContent = (m.totalCafeGramosConsumidos || 0) + "g";
      $("metric-bolsas").textContent = m.totalBolsas || 0;
      $("metric-extracciones").textContent = m.totalExtracciones || 0;
      $("metric-usuarios").textContent = m.totalUsuarios || 0;
      $("metric-metodo-popular").textContent = m.metodoMasPopular || "-";
      $("metric-origen-popular").textContent = m.origenMasConsumido || "-";
      $("metric-promedio-puntuacion").textContent = (m.promedioPuntuacion || 0) + " ★";
    } catch (e) {
      console.error("Error al cargar métricas de admin:", e);
    }

    try {
      const recetas = await Com.listarComunidad({ incluirMaestras: false });
      const contenedor = $("lista-moderacion");

      if (!recetas || recetas.length === 0) {
        contenedor.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No hay recetas de la comunidad registradas para moderar.</p>';
      } else {
        contenedor.innerHTML = "";
        recetas.forEach((r) => {
          const item = document.createElement("div");
          item.className = "item-card";
          item.innerHTML = `
            <div>
              <div class="item-card-header">
                <div>
                  <h4 class="item-title" style="font-size: 1.1rem;">${escapeHTML(r.nombreCafe)}</h4>
                  <span class="item-subtitle">${escapeHTML(r.metodo)} · Ratio 1:${r.ratio}</span>
                </div>
                <span class="badge badge-public">Pública</span>
              </div>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                Autor: <strong>${escapeHTML(r.usuarioEmail)}</strong>
              </p>
            </div>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
              <button type="button" class="btn btn-secondary btn-sm btn-despublicar">Despublicar</button>
              <button type="button" class="btn btn-danger btn-sm btn-eliminar-receta">Eliminar</button>
            </div>
          `;

          item.querySelector(".btn-despublicar").addEventListener("click", async () => {
            try {
              await Com.moderarReceta(r.id, "despublicar");
              mostrarMsg("admin-mod-msg", "Receta despublicada con éxito.");
              pintarAdmin();
              pintarComunidad();
            } catch (err) {
              mostrarMsg("admin-mod-msg", "ERROR: " + err.message, true);
            }
          });

          item.querySelector(".btn-eliminar-receta").addEventListener("click", async () => {
            if (confirm("¿Seguro que deseas eliminar esta receta permanentemente?")) {
              try {
                await Com.moderarReceta(r.id, "eliminar");
                mostrarMsg("admin-mod-msg", "Receta eliminada de la plataforma.");
                pintarAdmin();
                pintarComunidad();
              } catch (err) {
                mostrarMsg("admin-mod-msg", "ERROR: " + err.message, true);
              }
            }
          });

          contenedor.appendChild(item);
        });
      }
    } catch (e) {
      mostrarMsg("admin-mod-msg", "ERROR al cargar moderación: " + e.message, true);
    }

    try {
      const lista = await Com.listarUsuarios();
      const ul = $("lista-usuarios");
      ul.innerHTML = "";
      lista.forEach((u) => {
        const li = document.createElement("li");
        li.className = "user-list-item";
        li.innerHTML = `
          <span>
            <strong style="color: var(--text-title);">${escapeHTML(u.email)}</strong>
            <span class="badge ${u.rol === "admin" ? "badge-public" : "badge-depleted"}" style="margin-left: 0.5rem;">${u.rol}</span>
            <span style="font-size: 0.8rem; color: var(--text-muted);">(${u.estado})</span>
          </span>
          <button type="button" class="btn btn-danger btn-sm btn-borrar-usuario">Eliminar</button>
        `;

        li.querySelector(".btn-borrar-usuario").addEventListener("click", async () => {
          if (confirm(`¿Seguro que deseas eliminar al usuario ${u.email}?`)) {
            try {
              await Com.borrarUsuario(u.email);
              mostrarMsg("admin-msg", "Usuario eliminado: " + u.email);
              pintarAdmin();
              pintarEstado();
            } catch (err) {
              mostrarMsg("admin-msg", "ERROR: " + err.message, true);
            }
          }
        });

        ul.appendChild(li);
      });
      mostrarMsg("admin-msg", "");
    } catch (e) {
      mostrarMsg("admin-msg", "ERROR: " + e.message, true);
    }
  }

  // — Inicialización y Event Listeners —
  async function inicializar() {
    await pintarEstado();
    configurarTabs();
    configurarPillsMetodos();
    configurarFiltrosCatalogo();
    configurarCalculadoraRatio();

    // Checkbox de métricas económicas
    const chkEconomico = $("chk-metricas-economicas");
    if (chkEconomico) {
      chkEconomico.checked = localStorage.getItem("brewlab.metricas_economicas") === "true";
      chkEconomico.addEventListener("change", () => {
        localStorage.setItem("brewlab.metricas_economicas", chkEconomico.checked ? "true" : "false");
        pintarConsumoSemanal();
      });
    }

    // Recoger el código de un solo uso si volvemos de GitHub (?oauth_code=...)
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_error")) {
      mostrarMsg("log-msg", "Error de autenticación con GitHub: " + params.get("oauth_error"), true);
    }
    if (params.get("oauth_code")) {
      const codigo = params.get("oauth_code");
      window.history.replaceState({}, "", window.location.pathname); // limpiar la URL ya
      try {
        await Com.canjearCodigoOAuth(codigo);
      } catch {
        mostrarMsg("log-msg", "Error de autenticación con GitHub: código inválido o expirado", true);
      }
    }

    // Revalidación de sesión guardada
    if (Com.leerSesion()) {
      try {
        await Com.me();
      } catch {
        // Token inválido o expirado
      }
    }

    pintarSesion();
  }

  // Formulario Registro Local
  $("form-registro").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const email = $("reg-email").value;
      const pass = $("reg-pass").value;
      const nombre = $("reg-nombre").value;
      const creado = await Com.registro(email, pass, nombre);
      mostrarMsg("reg-msg", "Cuenta creada como pendiente: " + creado.email + ". Revisa tu correo para activarla.");
      $("form-registro").reset();
    } catch (e) {
      mostrarMsg("reg-msg", "ERROR: " + e.message, true);
    }
    pintarEstado();
  });

  // Formulario Login Local
  $("form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const email = $("log-email").value;
      const pass = $("log-pass").value;
      const sesion = await Com.login(email, pass);
      mostrarMsg("log-msg", "Sesión iniciada con éxito.");
      $("form-login").reset();
      pintarSesion();
    } catch (e) {
      mostrarMsg("log-msg", "ERROR: " + e.message, true);
    }
    pintarEstado();
  });

  // Botón Cerrar Sesión
  $("btn-logout").addEventListener("click", async () => {
    await Com.logout();
    mostrarMsg("log-msg", "");
    pintarSesion();
    pintarEstado();
  });

  // Formulario Añadir Bolsa
  $("form-bolsa").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const datos = {
        nombre: $("bolsa-nombre").value,
        origen: $("bolsa-origen").value,
        tostador: $("bolsa-tostador").value,
        variedad: $("bolsa-variedad").value,
        proceso: $("bolsa-proceso").value,
        gramosIniciales: Number($("bolsa-gramos").value),
      };
      await Com.crearBolsa(datos);
      mostrarMsg("bolsa-msg", "Bolsa añadida a tu despensa.");
      $("form-bolsa").reset();
      pintarBolsas();
    } catch (e) {
      mostrarMsg("bolsa-msg", "ERROR: " + e.message, true);
    }
  });

  // Formulario Registrar Extracción
  $("form-extraccion").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const datos = {
        bolsaId: $("ext-bolsa").value,
        metodo: $("ext-metodo").value,
        cafeGramos: Number($("ext-cafe").value),
        aguaGramos: Number($("ext-agua").value),
        tiempoSegundos: Number($("ext-tiempo").value) || 0,
        molienda: $("ext-molienda").value,
        notasSabor: $("ext-notas").value,
        puntuacion: Number($("ext-puntuacion").value) || 0,
        esPublica: $("ext-publica").checked,
      };

      const res = await Com.crearExtraccion(datos);
      mostrarMsg("ext-msg", `Extracción registrada con éxito (Ratio 1:${res.extraccion.ratio}).`);

      // Limpiar formulario y resetear display de ratio
      $("form-extraccion").reset();
      $("calc-ratio-display").textContent = "1 : --";
      $("calc-ratio-hint").textContent = "Introduce gramos de café y agua para calcular en tiempo real";

      // Refrescar vistas
      pintarExtracciones();
      pintarConsumoSemanal();
      pintarBolsas();
      if (datos.esPublica) {
        pintarComunidad();
      }
      pintarAdmin();
    } catch (e) {
      mostrarMsg("ext-msg", "ERROR: " + e.message, true);
    }
  });

  // Filtros de Comunidad
  $("btn-com-buscar").addEventListener("click", () => {
    pintarComunidad();
  });

  $("btn-com-limpiar").addEventListener("click", () => {
    if ($("com-buscar")) $("com-buscar").value = "";
    if ($("com-metodo")) $("com-metodo").value = "";
    const pills = document.querySelectorAll("#pills-metodos-comunidad .pill-btn");
    pills.forEach((p, idx) => {
      p.classList.toggle("active", idx === 0);
    });
    pintarComunidad();
  });

  // Borrar mi propia cuenta
  $("btn-borrar-cuenta").addEventListener("click", async () => {
    const sesion = Com.leerSesion();
    if (!sesion || !sesion.usuario) {
      return;
    }
    if (confirm("¿Estás seguro de que deseas eliminar tu cuenta permanentemente? Esta acción es irreversible.")) {
      try {
        await Com.borrarUsuario(sesion.usuario.email);
        Com.limpiarSesion();
        mostrarMsg("cuenta-msg", "Cuenta eliminada permanentemente.");
        pintarSesion();
        pintarEstado();
      } catch (e) {
        mostrarMsg("cuenta-msg", "ERROR: " + e.message, true);
      }
    }
  });

  // Helpers de formato y seguridad
  function escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatearFecha(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return iso;
    }
  }

  // Arrancar
  inicializar();
})();
