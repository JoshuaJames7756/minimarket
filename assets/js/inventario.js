// ============================================================
// inventario.js — Gestión de Inventario y Caducidad
// Minimercado Control-Total | JVSoftware
// Maneja: tabla de productos, alertas de vencimiento,
// formulario de alta/edición y gestión de proveedores.
// ============================================================

import {
  obtenerTodos,
  obtenerPorId,
  agregar,
  actualizar,
  eliminar,
  obtenerProductosPorVencer,
  buscarProductosPorNombre,
} from "./db.js";

// ============================================================
// INICIALIZACIÓN
// ============================================================
async function iniciarInventario() {
  // --- Detecta si viene de un redirect del POS con código nuevo ---
  const params = new URLSearchParams(window.location.search);
  const codigoNuevo = params.get("codigo");
  const esNuevo = params.get("nuevo");

  await _renderizarTablaProductos();
  await _renderizarAlertasVencimiento();
  await _cargarProveedoresEnSelect();
  _bindEventosInventario();

  // --- Si viene del POS, abre el formulario con código prellenado ---
  if (codigoNuevo && esNuevo) {
    abrirFormularioProducto(null, codigoNuevo);
  }

  console.log("✅ Inventario inicializado.");
}

// ============================================================
// TABLA PRINCIPAL DE PRODUCTOS
// ============================================================
async function _renderizarTablaProductos(filtro = "") {
  const contenedor = document.getElementById("inventario-tabla-body");
  if (!contenedor) return;

  let productos = filtro
    ? await buscarProductosPorNombre(filtro)
    : await obtenerTodos("productos");

  if (!productos.length) {
    contenedor.innerHTML = `
      <tr>
        <td colspan="8" class="tabla-vacia">
          No hay productos registrados.
          <button onclick="abrirFormularioProducto()" class="btn-link">Agregar el primero</button>
        </td>
      </tr>`;
    return;
  }

  const hoy = new Date();

  contenedor.innerHTML = productos
    .map((p) => {
      // --- Determina clase de alerta según vencimiento ---
      let claseVenc = "";
      let labelVenc = p.vencimiento || "—";
      if (p.vencimiento) {
        const fechaVenc = new Date(p.vencimiento);
        const diasRestantes = Math.ceil((fechaVenc - hoy) / (1000 * 60 * 60 * 24));
        if (diasRestantes < 0) claseVenc = "venc-expirado";
        else if (diasRestantes <= 15) claseVenc = "venc-critico";
        else if (diasRestantes <= 30) claseVenc = "venc-advertencia";
        labelVenc = `${p.vencimiento} <small>(${diasRestantes}d)</small>`;
      }

      // --- Clase de stock bajo ---
      const claseStock = p.stock <= 0 ? "stock-agotado" : p.stock <= 5 ? "stock-bajo" : "";

      return `
        <tr data-id="${p.id}">
          <td>${p.codigo_barra || "—"}</td>
          <td>${p.nombre}</td>
          <td>${p.categoria || "—"}</td>
          <td class="${claseStock}">${p.stock}</td>
          <td>Bs. ${p.precio_venta?.toFixed(2) ?? "—"}</td>
          <td>Bs. ${p.precio_costo?.toFixed(2) ?? "—"}</td>
          <td class="${claseVenc}">${labelVenc}</td>
          <td class="tabla-acciones">
            <button class="btn-editar-producto" data-id="${p.id}" title="Editar">✏️</button>
            <button class="btn-eliminar-producto" data-id="${p.id}" title="Eliminar">🗑️</button>
          </td>
        </tr>`;
    })
    .join("");

  // --- Enlaza botones de la tabla ---
  contenedor.querySelectorAll(".btn-editar-producto").forEach((btn) => {
    btn.addEventListener("click", () => abrirFormularioProducto(Number(btn.dataset.id)));
  });

  contenedor.querySelectorAll(".btn-eliminar-producto").forEach((btn) => {
    btn.addEventListener("click", () => _confirmarEliminacion(Number(btn.dataset.id)));
  });
}

// ============================================================
// ALERTAS DE VENCIMIENTO (Panel lateral o superior)
// ============================================================
async function _renderizarAlertasVencimiento() {
  const contenedor = document.getElementById("inventario-alertas");
  if (!contenedor) return;

  const porVencer = await obtenerProductosPorVencer(30);

  if (!porVencer.length) {
    contenedor.innerHTML = `<p class="alertas-ok">✅ Sin productos por vencer en 30 días</p>`;
    return;
  }

  contenedor.innerHTML = porVencer
    .map((p) => {
      const clase =
        p.diasRestantes < 0
          ? "alerta-expirado"
          : p.diasRestantes <= 15
          ? "alerta-critico"
          : "alerta-advertencia";

      const label =
        p.diasRestantes < 0
          ? `Expirado hace ${Math.abs(p.diasRestantes)} días`
          : p.diasRestantes === 0
          ? "Vence HOY"
          : `Vence en ${p.diasRestantes} días`;

      return `
        <div class="alerta-item ${clase}">
          <span class="alerta-nombre">${p.nombre}</span>
          <span class="alerta-dias">${label}</span>
          <span class="alerta-stock">Stock: ${p.stock}</span>
        </div>`;
    })
    .join("");
}

// ============================================================
// FORMULARIO DE PRODUCTO (Alta y Edición)
// ============================================================
async function abrirFormularioProducto(productoId = null, codigoPrellenado = "") {
  let producto = null;
  if (productoId) {
    producto = await obtenerPorId("productos", productoId);
  }

  const proveedores = await obtenerTodos("proveedores");
  const opcionesProveedores = proveedores
    .map(
      (prov) =>
        `<option value="${prov.id}" ${producto?.proveedor_id === prov.id ? "selected" : ""}>
          ${prov.nombre}
        </option>`
    )
    .join("");

  const modal = document.createElement("div");
  modal.id = "modal-producto";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-caja modal-producto">
      <h3>${producto ? "Editar producto" : "Nuevo producto"}</h3>
      <form id="form-producto" novalidate>

        <div class="form-fila">
          <label>Código de barras</label>
          <input type="text" name="codigo_barra" value="${producto?.codigo_barra ?? codigoPrellenado}" placeholder="Escanea o escribe el código" />
        </div>

        <div class="form-fila">
          <label>Nombre del producto *</label>
          <input type="text" name="nombre" value="${producto?.nombre ?? ""}" required placeholder="Ej: Aceite Don Maximo 1L" />
        </div>

        <div class="form-fila">
          <label>Categoría</label>
          <input type="text" name="categoria" value="${producto?.categoria ?? ""}" placeholder="Ej: Aceites, Lácteos, Snacks..." />
        </div>

        <div class="form-fila doble">
          <div>
            <label>Precio de venta (Bs.) *</label>
            <input type="number" name="precio_venta" value="${producto?.precio_venta ?? ""}" min="0" step="0.50" required />
          </div>
          <div>
            <label>Precio de costo (Bs.)</label>
            <input type="number" name="precio_costo" value="${producto?.precio_costo ?? ""}" min="0" step="0.50" />
          </div>
        </div>

        <div class="form-fila doble">
          <div>
            <label>Stock actual *</label>
            <input type="number" name="stock" value="${producto?.stock ?? 0}" min="0" required />
          </div>
          <div>
            <label>Fecha de vencimiento</label>
            <input type="date" name="vencimiento" value="${producto?.vencimiento ?? ""}" />
          </div>
        </div>

        <div class="form-fila">
          <label>Proveedor</label>
          <select name="proveedor_id">
            <option value="">Sin proveedor</option>
            ${opcionesProveedores}
          </select>
        </div>

        <div class="modal-acciones">
          <button type="submit" class="btn-primario">
            ${producto ? "Guardar cambios" : "Registrar producto"}
          </button>
          <button type="button" id="btn-cancelar-producto" class="btn-secundario">Cancelar</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById("btn-cancelar-producto").addEventListener("click", () => {
    modal.remove();
  });

  document.getElementById("form-producto").addEventListener("submit", async (e) => {
    e.preventDefault();
    await _guardarProducto(e.target, producto?.id);
    modal.remove();
  });
}

// ============================================================
// GUARDAR PRODUCTO (Alta o Edición)
// ============================================================
async function _guardarProducto(form, productoId = null) {
  const datos = {
    codigo_barra: form.codigo_barra.value.trim() || null,
    nombre: form.nombre.value.trim(),
    categoria: form.categoria.value.trim() || null,
    precio_venta: parseFloat(form.precio_venta.value) || 0,
    precio_costo: parseFloat(form.precio_costo.value) || 0,
    stock: parseInt(form.stock.value) || 0,
    vencimiento: form.vencimiento.value || null,
    proveedor_id: form.proveedor_id.value ? Number(form.proveedor_id.value) : null,
  };

  if (!datos.nombre) {
    alert("El nombre del producto es obligatorio.");
    return;
  }

  if (productoId) {
    await actualizar("productos", { ...datos, id: productoId });
    console.log(`✅ Producto #${productoId} actualizado.`);
  } else {
    const nuevoId = await agregar("productos", datos);
    console.log(`✅ Producto #${nuevoId} registrado.`);
  }

  // --- Refresca la tabla ---
  await _renderizarTablaProductos();
  await _renderizarAlertasVencimiento();
}

// ============================================================
// CONFIRMACIÓN DE ELIMINACIÓN
// ============================================================
async function _confirmarEliminacion(productoId) {
  const producto = await obtenerPorId("productos", productoId);
  if (!producto) return;

  const confirmado = confirm(`¿Eliminar "${producto.nombre}"?\nEsta acción no se puede deshacer.`);
  if (!confirmado) return;

  await eliminar("productos", productoId);
  await _renderizarTablaProductos();
  await _renderizarAlertasVencimiento();
}

// ============================================================
// GESTIÓN DE PROVEEDORES
// ============================================================
async function iniciarProveedores() {
  const contenedor = document.getElementById("proveedores-lista");
  if (!contenedor) return;

  const proveedores = await obtenerTodos("proveedores");

  if (!proveedores.length) {
    contenedor.innerHTML = `<p class="tabla-vacia">No hay proveedores registrados.</p>`;
    return;
  }

  contenedor.innerHTML = proveedores
    .map(
      (p) => `
      <div class="proveedor-item" data-id="${p.id}">
        <div class="proveedor-info">
          <strong>${p.nombre}</strong>
          <span>${p.telefono || "Sin teléfono"}</span>
        </div>
        <div class="proveedor-acciones">
          <button class="btn-editar-proveedor" data-id="${p.id}">✏️</button>
          <button class="btn-eliminar-proveedor" data-id="${p.id}">🗑️</button>
        </div>
      </div>`
    )
    .join("");

  contenedor.querySelectorAll(".btn-eliminar-proveedor").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await eliminar("proveedores", Number(btn.dataset.id));
      await iniciarProveedores();
    });
  });
}

// ============================================================
// EVENTOS GLOBALES DEL MÓDULO
// ============================================================
function _bindEventosInventario() {
  // --- Buscador de inventario ---
  const inputFiltro = document.getElementById("inventario-busqueda");
  if (inputFiltro) {
    let timer = null;
    inputFiltro.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => _renderizarTablaProductos(inputFiltro.value.trim()), 300);
    });
  }

  // --- Botón agregar nuevo producto ---
  const btnNuevo = document.getElementById("btn-nuevo-producto");
  if (btnNuevo) btnNuevo.addEventListener("click", () => abrirFormularioProducto());

  // --- Formulario nuevo proveedor ---
  const formProveedor = document.getElementById("form-nuevo-proveedor");
  if (formProveedor) {
    formProveedor.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = formProveedor.nombre.value.trim();
      const telefono = formProveedor.telefono?.value.trim() || "";
      if (!nombre) return;
      await agregar("proveedores", { nombre, telefono, productos: [] });
      formProveedor.reset();
      await iniciarProveedores();
      await _cargarProveedoresEnSelect();
    });
  }
}

// --- Actualiza el select de proveedores en el formulario de producto ---
async function _cargarProveedoresEnSelect() {
  // Recargado dinámicamente en abrirFormularioProducto()
  // Este método puede usarse para refrescar selects externos si es necesario
}

// ============================================================
// EXPORTACIONES
// ============================================================
export {
  iniciarInventario,
  iniciarProveedores,
  abrirFormularioProducto,
};