// ============================================================
// pos.js — Punto de Venta (POS)
// Minimercado Control-Total | JVSoftware
// Maneja: búsqueda por texto, escáner USB, cámara con
// BarcodeDetector, carrito de venta, cobro y registro en DB.
// ============================================================

import {
  buscarProductoPorCodigo,
  buscarProductosPorNombre,
  agregar,
  obtenerTodos,
  reducirStock,
  actualizar,
  obtenerPorId,
} from "./db.js";
import { getCajeroActivo } from "./cajero.js";

// ============================================================
// ESTADO GLOBAL DEL CARRITO
// ============================================================
let carrito = []; // Array de { producto, cantidad, subtotal }
let streamCamara = null; // Referencia al stream activo de la cámara
let escaneando = false; // Evita lecturas duplicadas de BarcodeDetector

// ============================================================
// INICIALIZACIÓN
// Enlaza eventos a los elementos del DOM del POS.
// ============================================================
function iniciarPOS() {
  const inputBusqueda = document.getElementById("pos-busqueda");
  const btnCamara = document.getElementById("pos-btn-camara");
  const btnCobrar = document.getElementById("pos-btn-cobrar");
  const btnLimpiar = document.getElementById("pos-btn-limpiar");

  if (!inputBusqueda) return;

  // --- Escáner USB: el dispositivo envía el código + Enter ---
  // Se detecta por la velocidad de escritura (< 50ms entre chars)
  let bufferEscaner = "";
  let timerEscaner = null;

  inputBusqueda.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      // --- Si viene del escáner USB, el buffer ya está completo ---
      const codigo = inputBusqueda.value.trim();
      if (codigo) _procesarCodigoBarra(codigo);
      inputBusqueda.value = "";
      e.preventDefault();
      return;
    }
  });

  // --- Búsqueda manual por texto (con debounce de 300ms) ---
  let timerBusqueda = null;
  inputBusqueda.addEventListener("input", () => {
    clearTimeout(timerBusqueda);
    const texto = inputBusqueda.value.trim();
    if (texto.length < 2) {
      _ocultarSugerencias();
      return;
    }
    timerBusqueda = setTimeout(() => _buscarPorTexto(texto), 300);
  });

  // --- Botón de cámara ---
  if (btnCamara) btnCamara.addEventListener("click", _abrirModalCamara);

  // --- Botón cobrar ---
  if (btnCobrar) btnCobrar.addEventListener("click", _abrirModalCobro);

  // --- Botón limpiar carrito ---
  if (btnLimpiar) btnLimpiar.addEventListener("click", limpiarCarrito);

  console.log("✅ POS inicializado.");
}

// ============================================================
// BÚSQUEDA POR TEXTO
// Muestra sugerencias debajo del input.
// ============================================================
async function _buscarPorTexto(texto) {
  const resultados = await buscarProductosPorNombre(texto);
  _renderizarSugerencias(resultados);
}

function _renderizarSugerencias(productos) {
  let lista = document.getElementById("pos-sugerencias");

  if (!lista) {
    lista = document.createElement("ul");
    lista.id = "pos-sugerencias";
    lista.className = "pos-sugerencias";
    document.getElementById("pos-busqueda").insertAdjacentElement("afterend", lista);
  }

  if (!productos.length) {
    lista.innerHTML = `<li class="pos-sugerencia-vacia">Sin resultados</li>`;
    return;
  }

  lista.innerHTML = productos
    .slice(0, 8) // Máximo 8 sugerencias visibles
    .map(
      (p) => `
      <li class="pos-sugerencia-item" data-id="${p.id}">
        <span class="sug-nombre">${p.nombre}</span>
        <span class="sug-precio">Bs. ${p.precio_venta.toFixed(2)}</span>
        <span class="sug-stock ${p.stock <= 0 ? "stock-agotado" : ""}">
          ${p.stock <= 0 ? "Sin stock" : `Stock: ${p.stock}`}
        </span>
      </li>`
    )
    .join("");

  lista.querySelectorAll(".pos-sugerencia-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const producto = await obtenerPorId("productos", Number(item.dataset.id));
      if (producto) agregarAlCarrito(producto);
      _ocultarSugerencias();
      document.getElementById("pos-busqueda").value = "";
    });
  });
}

function _ocultarSugerencias() {
  const lista = document.getElementById("pos-sugerencias");
  if (lista) lista.remove();
}

// ============================================================
// PROCESAMIENTO DE CÓDIGO DE BARRA
// Usado tanto por escáner USB como por cámara.
// ============================================================
async function _procesarCodigoBarra(codigo) {
  const producto = await buscarProductoPorCodigo(codigo);

  if (producto) {
    agregarAlCarrito(producto);
  } else {
    // --- Producto no encontrado: ofrece registrarlo ---
    _mostrarModalProductoNuevo(codigo);
  }
}

// ============================================================
// MÓDULO DE CÁMARA — NATIVO (BarcodeDetector API)
// Sin librerías externas. Solo Chrome/Edge modernos.
// ============================================================
async function _abrirModalCamara() {
  // Comprobar soporte nativo
  if (!window.BarcodeDetector) {
    alert("Para usar el escáner, el sitio debe estar en un servidor seguro (HTTPS) o habilitar las funciones experimentales en Chrome.");
    return;
  }

  _cerrarModalCamara(); // Limpiar si había uno abierto

  const modal = document.createElement("div");
  modal.id = "modal-camara";
  modal.className = "modal-camara-overlay";
  modal.innerHTML = `
    <div class="modal-camara-caja">
      <div class="modal-camara-header">
        <h3>Escanear con cámara</h3>
        <button id="btn-cerrar-camara" class="btn-cerrar-camara">✕</button>
      </div>
      <div class="modal-camara-visor">
        <video id="camara-video" autoplay playsinline muted style="width:100%; height:auto;"></video>
        <div class="camara-mira"></div>
      </div>
      <p class="camara-instruccion">Apunta al código de barras</p>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("btn-cerrar-camara").addEventListener("click", _cerrarModalCamara);

  await _iniciarStreamNativo();
}

async function _iniciarStreamNativo() {
  try {
    // Pedimos la cámara de forma genérica para evitar errores de ID en Windows
    streamCamara = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    const video = document.getElementById("camara-video");
    if (video) {
      video.srcObject = streamCamara;
      // Esperamos a que el video esté listo para empezar a detectar
      video.onloadedmetadata = () => {
        _iniciarDeteccionNativa(video);
      };
    }
  } catch (error) {
    console.error("Error cámara nativa:", error);
    alert("No se pudo acceder a la cámara. Revisa los permisos.");
    _cerrarModalCamara();
  }
}

function _iniciarDeteccionNativa(video) {
  const detector = new BarcodeDetector({
    formats: ["ean_13", "ean_8", "code_128", "qr_code", "upc_a"]
  });

  escaneando = true;

  const renderLoop = async () => {
    if (!escaneando || !video) return;

    try {
      const barcodes = await detector.detect(video);
      if (barcodes.length > 0) {
        const codigo = barcodes[0].rawValue;
        console.log("Código detectado nativamente:", codigo);
        
        escaneando = false; 
        _cerrarModalCamara();
        _procesarCodigoBarra(codigo); // Tu función que busca en IndexedDB
        return; 
      }
    } catch (e) {
      // Errores temporales de frames vacíos
    }
    
    if (escaneando) {
      requestAnimationFrame(renderLoop);
    }
  };

  requestAnimationFrame(renderLoop);
}

function _cerrarModalCamara() {
  escaneando = false;
  if (streamCamara) {
    streamCamara.getTracks().forEach(track => track.stop());
    streamCamara = null;
  }
  const modal = document.getElementById("modal-camara");
  if (modal) modal.remove();
}

// ============================================================
// MODAL PRODUCTO NUEVO
// Aparece cuando se escanea un código no registrado.
// ============================================================
function _mostrarModalProductoNuevo(codigoBarra) {
  const modal = document.createElement("div");
  modal.id = "modal-producto-nuevo";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-caja">
      <h3>Producto no encontrado</h3>
      <p>Código: <strong>${codigoBarra}</strong></p>
      <p>¿Deseas registrar este producto?</p>
      <div class="modal-acciones">
        <button id="btn-registrar-nuevo" class="btn-primario">Registrar producto</button>
        <button id="btn-cancelar-nuevo" class="btn-secundario">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById("btn-registrar-nuevo").addEventListener("click", () => {
    modal.remove();
    // --- Redirige al formulario de inventario con el código prellenado ---
    window.location.href = `inventario.html?codigo=${codigoBarra}&nuevo=1`;
  });

  document.getElementById("btn-cancelar-nuevo").addEventListener("click", () => {
    modal.remove();
  });
}

// ============================================================
// GESTIÓN DEL CARRITO
// ============================================================

// --- Agrega un producto al carrito o incrementa su cantidad ---
function agregarAlCarrito(producto) {
  if (producto.stock <= 0) {
    _mostrarToast(`⚠️ ${producto.nombre} sin stock`, "advertencia");
    return;
  }

  const itemExistente = carrito.find((item) => item.producto.id === producto.id);

  if (itemExistente) {
    if (itemExistente.cantidad >= producto.stock) {
      _mostrarToast(`⚠️ Stock máximo alcanzado`, "advertencia");
      return;
    }
    itemExistente.cantidad += 1;
    itemExistente.subtotal = itemExistente.cantidad * producto.precio_venta;
  } else {
    carrito.push({
      producto,
      cantidad: 1,
      subtotal: producto.precio_venta,
    });
  }

  _renderizarCarrito();
}

// --- Cambia la cantidad de un item en el carrito ---
function cambiarCantidad(productoId, nuevaCantidad) {
  const item = carrito.find((i) => i.producto.id === productoId);
  if (!item) return;

  if (nuevaCantidad <= 0) {
    quitarDelCarrito(productoId);
    return;
  }

  if (nuevaCantidad > item.producto.stock) {
    _mostrarToast("⚠️ No hay suficiente stock", "advertencia");
    return;
  }

  item.cantidad = nuevaCantidad;
  item.subtotal = nuevaCantidad * item.producto.precio_venta;
  _renderizarCarrito();
}

// --- Elimina un item del carrito ---
function quitarDelCarrito(productoId) {
  carrito = carrito.filter((item) => item.producto.id !== productoId);
  _renderizarCarrito();
}

// --- Vacía todo el carrito ---
function limpiarCarrito() {
  carrito = [];
  _renderizarCarrito();
}

// --- Calcula el total del carrito ---
function calcularTotal() {
  return carrito.reduce((acc, item) => acc + item.subtotal, 0);
}

// ============================================================
// RENDERIZADO DEL CARRITO EN EL DOM
// ============================================================
function _renderizarCarrito() {
  const contenedor = document.getElementById("pos-carrito");
  const totalEl = document.getElementById("pos-total");
  const btnCobrar = document.getElementById("pos-btn-cobrar");

  if (!contenedor) return;

  if (!carrito.length) {
    contenedor.innerHTML = `
      <div class="carrito-vacio">
        <p>Escanea o busca un producto para comenzar</p>
      </div>`;
    if (totalEl) totalEl.textContent = "Bs. 0.00";
    if (btnCobrar) btnCobrar.disabled = true;
    return;
  }

  contenedor.innerHTML = carrito
    .map(
      (item) => `
      <div class="carrito-item" data-id="${item.producto.id}">
        <div class="carrito-item-info">
          <span class="carrito-nombre">${item.producto.nombre}</span>
          <span class="carrito-precio-unit">Bs. ${item.producto.precio_venta.toFixed(2)} c/u</span>
        </div>
        <div class="carrito-item-controles">
          <button class="btn-cantidad btn-restar" data-id="${item.producto.id}">−</button>
          <input
            type="number"
            class="carrito-cantidad-input"
            value="${item.cantidad}"
            min="1"
            max="${item.producto.stock}"
            data-id="${item.producto.id}"
          />
          <button class="btn-cantidad btn-sumar" data-id="${item.producto.id}">+</button>
        </div>
        <div class="carrito-item-subtotal">
          <span>Bs. ${item.subtotal.toFixed(2)}</span>
          <button class="btn-quitar-item" data-id="${item.producto.id}">🗑</button>
        </div>
      </div>`
    )
    .join("");

  // --- Enlaza controles de cantidad ---
  contenedor.querySelectorAll(".btn-restar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const item = carrito.find((i) => i.producto.id === id);
      if (item) cambiarCantidad(id, item.cantidad - 1);
    });
  });

  contenedor.querySelectorAll(".btn-sumar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const item = carrito.find((i) => i.producto.id === id);
      if (item) cambiarCantidad(id, item.cantidad + 1);
    });
  });

  contenedor.querySelectorAll(".carrito-cantidad-input").forEach((input) => {
    input.addEventListener("change", () => {
      cambiarCantidad(Number(input.dataset.id), Number(input.value));
    });
  });

  contenedor.querySelectorAll(".btn-quitar-item").forEach((btn) => {
    btn.addEventListener("click", () => quitarDelCarrito(Number(btn.dataset.id)));
  });

  // --- Actualiza el total ---
  const total = calcularTotal();
  if (totalEl) totalEl.textContent = `Bs. ${total.toFixed(2)}`;
  if (btnCobrar) btnCobrar.disabled = false;
}

// ============================================================
// MODAL DE COBRO
// ============================================================
function _abrirModalCobro() {
  if (!carrito.length) return;

  const total = calcularTotal();
  const clientes = []; // Se carga dinámicamente para fiados

  const modal = document.createElement("div");
  modal.id = "modal-cobro";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-caja modal-cobro">
      <h3>Cobrar venta</h3>
      <div class="cobro-total">
        <span>Total:</span>
        <strong>Bs. ${total.toFixed(2)}</strong>
      </div>

      <div class="cobro-tipo">
        <label>
          <input type="radio" name="tipo-venta" value="contado" checked />
          Al contado
        </label>
        <label>
          <input type="radio" name="tipo-venta" value="fiado" />
          Fiado (crédito)
        </label>
      </div>

      <div id="cobro-fiado-panel" class="cobro-fiado-panel" style="display:none;">
        <select id="cobro-cliente-select">
          <option value="">Seleccionar cliente...</option>
        </select>
        <button id="btn-nuevo-cliente-cobro" class="btn-link">+ Nuevo cliente</button>
      </div>

      <div id="cobro-contado-panel" class="cobro-contado-panel">
        <label>Monto recibido (Bs.)</label>
        <input type="number" id="cobro-monto-recibido" placeholder="0.00" min="${total}" step="0.50" />
        <div class="cobro-cambio" id="cobro-cambio-panel" style="display:none;">
          Cambio: <strong id="cobro-cambio-valor">Bs. 0.00</strong>
        </div>
      </div>

      <div class="modal-acciones">
        <button id="btn-confirmar-cobro" class="btn-primario">Confirmar venta</button>
        <button id="btn-cancelar-cobro" class="btn-secundario">Cancelar</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  _cargarClientesEnSelect();
  _bindEventosCobro(total);
}

async function _cargarClientesEnSelect() {
  const clientes = await obtenerTodos("clientes");
  const select = document.getElementById("cobro-cliente-select");
  if (!select) return;

  clientes.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = `${c.nombre} (Deuda: Bs. ${c.saldo_pendiente?.toFixed(2) ?? "0.00"})`;
    select.appendChild(option);
  });
}

function _bindEventosCobro(total) {
  const modal = document.getElementById("modal-cobro");

  // --- Toggle contado/fiado ---
  modal.querySelectorAll('input[name="tipo-venta"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const esFiado = radio.value === "fiado";
      document.getElementById("cobro-fiado-panel").style.display = esFiado ? "block" : "none";
      document.getElementById("cobro-contado-panel").style.display = esFiado ? "none" : "block";
    });
  });

  // --- Cálculo de cambio en tiempo real ---
  const inputMonto = document.getElementById("cobro-monto-recibido");
  if (inputMonto) {
    inputMonto.addEventListener("input", () => {
      const recibido = parseFloat(inputMonto.value) || 0;
      const cambio = recibido - total;
      const panelCambio = document.getElementById("cobro-cambio-panel");
      const valorCambio = document.getElementById("cobro-cambio-valor");

      if (recibido >= total) {
        panelCambio.style.display = "block";
        valorCambio.textContent = `Bs. ${cambio.toFixed(2)}`;
      } else {
        panelCambio.style.display = "none";
      }
    });
  }

  // --- Confirmar venta ---
  document.getElementById("btn-confirmar-cobro").addEventListener("click", async () => {
    const tipoVenta = modal.querySelector('input[name="tipo-venta"]:checked').value;

    if (tipoVenta === "fiado") {
      const clienteId = document.getElementById("cobro-cliente-select").value;
      if (!clienteId) {
        alert("Selecciona un cliente para el fiado.");
        return;
      }
      await _registrarVenta(tipoVenta, Number(clienteId));
    } else {
      const recibido = parseFloat(document.getElementById("cobro-monto-recibido").value) || 0;
      if (recibido < total) {
        alert("El monto recibido es menor al total.");
        return;
      }
      await _registrarVenta(tipoVenta, null);
    }

    modal.remove();
  });

  document.getElementById("btn-cancelar-cobro").addEventListener("click", () => {
    modal.remove();
  });
}

// ============================================================
// REGISTRAR VENTA EN INDEXEDDB
// ============================================================
async function _registrarVenta(tipo, clienteId) {
  const cajero = getCajeroActivo();
  const ahora = new Date().toISOString();

  // --- Construye el objeto de venta ---
  const venta = {
    fecha: ahora,
    items: carrito.map((item) => ({
      producto_id: item.producto.id,
      nombre: item.producto.nombre,
      cantidad: item.cantidad,
      precio_venta: item.producto.precio_venta,
      precio_costo: item.producto.precio_costo,
      subtotal: item.subtotal,
    })),
    total: calcularTotal(),
    cajero: cajero ? cajero.nombre : "Sin cajero",
    tipo,
    cliente_id: clienteId || null,
  };

  const ventaId = await agregar("ventas", venta);

  // --- Reduce stock de cada producto vendido ---
  for (const item of carrito) {
    await reducirStock(item.producto.id, item.cantidad);
  }

  // --- Si es fiado, registra el crédito y actualiza saldo del cliente ---
  if (tipo === "fiado" && clienteId) {
    await agregar("creditos", {
      cliente_id: clienteId,
      monto: venta.total,
      fecha: ahora,
      tipo: "cargo",
      venta_id: ventaId,
    });

    const cliente = await obtenerPorId("clientes", clienteId);
    if (cliente) {
      cliente.saldo_pendiente = (cliente.saldo_pendiente || 0) + venta.total;
      await actualizar("clientes", cliente);
    }
  }

  limpiarCarrito();
  _mostrarToast(`✅ Venta registrada — Bs. ${venta.total.toFixed(2)}`, "exito");
  console.log(`✅ Venta #${ventaId} registrada.`);

  // --- Imprime el recibo automáticamente (opcional) ---
  _generarRecibo(venta, ventaId);
}

// ============================================================
// GENERACIÓN DE RECIBO PARA IMPRESIÓN
// ============================================================
function _generarRecibo(venta, ventaId) {
  const ventanaImpresion = window.open("", "_blank", "width=400,height=600");
  if (!ventanaImpresion) return;

  const itemsHTML = venta.items
    .map(
      (item) =>
        `<tr>
          <td>${item.nombre}</td>
          <td style="text-align:center">${item.cantidad}</td>
          <td style="text-align:right">Bs. ${item.precio_venta.toFixed(2)}</td>
          <td style="text-align:right">Bs. ${item.subtotal.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  ventanaImpresion.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Recibo #${ventaId}</title>
      <link rel="stylesheet" href="/assets/css/print.css">
    </head>
    <body onload="window.print(); window.close();">
      <div class="recibo">
        <h2>Minimercado</h2>
        <p>Fecha: ${new Date(venta.fecha).toLocaleString("es-BO")}</p>
        <p>Cajero: ${venta.cajero}</p>
        <p>Tipo: ${venta.tipo === "fiado" ? "Fiado" : "Contado"}</p>
        <hr/>
        <table>
          <thead>
            <tr>
              <th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsHTML}</tbody>
        </table>
        <hr/>
        <div class="recibo-total">
          <strong>TOTAL: Bs. ${venta.total.toFixed(2)}</strong>
        </div>
        <p class="recibo-pie">¡Gracias por su compra!</p>
      </div>
    </body>
    </html>
  `);
  ventanaImpresion.document.close();
}

// ============================================================
// TOAST DE NOTIFICACIÓN
// ============================================================
function _mostrarToast(mensaje, tipo = "info") {
  const toast = document.createElement("div");
  toast.className = `pos-toast pos-toast--${tipo}`;
  toast.textContent = mensaje;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("pos-toast--salir"), 2500);
  setTimeout(() => toast.remove(), 3200);
}

// ============================================================
// EXPORTACIONES
// ============================================================
export {
  iniciarPOS,
  agregarAlCarrito,
  quitarDelCarrito,
  limpiarCarrito,
  calcularTotal,
};