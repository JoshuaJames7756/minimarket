// ============================================================
// cajero.js — Gestión de Turno y Sesión del Cajero
// Minimercado Control-Total | JVSoftware
// ============================================================

import { obtenerTodos, agregar, eliminar } from "./db.js";

const CLAVE_CAJERO = "cajero_activo";

function getCajeroActivo() {
  const datos = sessionStorage.getItem(CLAVE_CAJERO);
  return datos ? JSON.parse(datos) : null;
}

function setCajeroActivo(cajero) {
  sessionStorage.setItem(CLAVE_CAJERO, JSON.stringify(cajero));
}

function cerrarSesionCajero() {
  sessionStorage.removeItem(CLAVE_CAJERO);
}

// ============================================================
// INICIALIZACIÓN — Retorna Promise que resuelve cuando
// hay un cajero activo (ya sea existente o recién elegido).
// ============================================================
function iniciarGestionCajero() {
  // --- Si ya hay sesión, resuelve inmediatamente ---
  if (getCajeroActivo()) return Promise.resolve();

  // --- Si no hay sesión, muestra el modal y espera la selección ---
  return mostrarModalCajero();
}

// ============================================================
// MODAL DE SELECCIÓN
// Retorna una Promise que resuelve cuando el usuario elige.
// ============================================================
async function mostrarModalCajero() {
  const cajeros = await obtenerTodos("cajeros");

  const opcionesHTML = cajeros.length
    ? cajeros.map((c) => `
        <button class="cajero-opcion" data-id="${c.id}" data-nombre="${c.nombre}">
          <span class="cajero-inicial">${c.nombre.charAt(0).toUpperCase()}</span>
          <span class="cajero-nombre">${c.nombre}</span>
        </button>`
      ).join("")
    : `<p class="cajero-vacio">No hay cajeros registrados. Agrega uno abajo.</p>`;

  const modal = document.createElement("div");
  modal.id = "modal-cajero";
  modal.className = "modal-cajero-overlay";
  modal.innerHTML = `
    <div class="modal-cajero-caja">
      <div class="modal-cajero-header">
        <h2>¿Quién atiende hoy?</h2>
        <p>Selecciona tu nombre para iniciar el turno</p>
      </div>
      <div class="cajero-lista" id="cajero-lista">${opcionesHTML}</div>
      <div class="cajero-nuevo">
        <input type="text" id="input-nuevo-cajero" placeholder="Nuevo cajero..." maxlength="40" />
        <button id="btn-agregar-cajero">Agregar</button>
      </div>
      <div class="cajero-gestionar">
        <button id="btn-gestionar-cajeros" class="btn-link">Gestionar cajeros</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // --- Retorna Promise que resuelve cuando el cajero queda guardado ---
  return new Promise((resolve) => {
    _bindEventosModal(resolve);
  });
}

// ============================================================
// EVENTOS DEL MODAL
// Recibe el resolve() de la Promise para dispararlo al elegir.
// ============================================================
function _bindEventosModal(resolve) {
  const modal = document.getElementById("modal-cajero");

  const _confirmar = (cajero) => {
    setCajeroActivo(cajero);
    _cerrarModal();
    _mostrarBienvenida(cajero.nombre);
    resolve(); // ← Aquí resuelve la Promise, arrancar() continúa
  };

  // --- Seleccionar cajero existente ---
  modal.querySelectorAll(".cajero-opcion").forEach((btn) => {
    btn.addEventListener("click", () => {
      _confirmar({ id: btn.dataset.id, nombre: btn.dataset.nombre });
    });
  });

  // --- Agregar nuevo cajero ---
  document.getElementById("btn-agregar-cajero").addEventListener("click", async () => {
    const input = document.getElementById("input-nuevo-cajero");
    const nombre = input.value.trim();
    if (!nombre) return;
    const id = await agregar("cajeros", { nombre });
    _confirmar({ id, nombre });
  });

  // --- Agregar con Enter ---
  document.getElementById("input-nuevo-cajero").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("btn-agregar-cajero").click();
  });

  // --- Panel de gestión ---
  document.getElementById("btn-gestionar-cajeros").addEventListener("click", () => {
    _mostrarPanelGestion(resolve);
  });
}

// ============================================================
// PANEL DE GESTIÓN — Eliminar cajeros
// ============================================================
async function _mostrarPanelGestion(resolve) {
  const cajeros = await obtenerTodos("cajeros");
  const lista = document.getElementById("cajero-lista");

  lista.innerHTML = `
    <button class="btn-volver-cajeros" id="btn-volver-lista">← Volver</button>
    ${cajeros.length
      ? cajeros.map((c) => `
          <div class="cajero-gestion-fila">
            <span>${c.nombre}</span>
            <button class="btn-eliminar-cajero" data-id="${c.id}">Eliminar</button>
          </div>`
        ).join("")
      : `<p class="cajero-vacio">No hay cajeros registrados.</p>`
    }
  `;

  // --- Botón volver — recarga la lista de selección ---
document.getElementById("btn-volver-lista").addEventListener("click", async () => {
  const cajeros = await obtenerTodos("cajeros");
  lista.innerHTML = cajeros.length
    ? cajeros.map((c) => `
        <button class="cajero-opcion" data-id="${c.id}" data-nombre="${c.nombre}">
          <span class="cajero-inicial">${c.nombre.charAt(0).toUpperCase()}</span>
          <span class="cajero-nombre">${c.nombre}</span>
        </button>`
      ).join("")
    : `<p class="cajero-vacio">No hay cajeros registrados. Agrega uno abajo.</p>`;

  lista.querySelectorAll(".cajero-opcion").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cajero = { id: btn.dataset.id, nombre: btn.dataset.nombre };
      setCajeroActivo(cajero);
      // ← Llama directamente sin _confirmar
      const modal = document.getElementById("modal-cajero");
      if (modal) modal.remove();
      _mostrarBienvenida(cajero.nombre);
      resolve();
    });
  });
});

  // --- Eliminar cajero ---
  lista.querySelectorAll(".btn-eliminar-cajero").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await eliminar("cajeros", Number(btn.dataset.id));
      _mostrarPanelGestion(resolve);
    });
  });
}
export {
  iniciarGestionCajero,
  getCajeroActivo,
  cerrarSesionCajero,
  mostrarModalCajero,
};