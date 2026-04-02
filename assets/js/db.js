// ============================================================
// db.js — Motor de Base de Datos Local (IndexedDB)
// Minimercado Control-Total | JVSoftware
// Contiene: Inicialización, esquema y operaciones CRUD
// para los 6 object stores del sistema.
// ============================================================

const DB_NOMBRE = "MinimercadoDB";
const DB_VERSION = 2; // ← Incrementado para forzar onupgradeneeded

// --- Referencia global a la conexión abierta ---
let db;

// ============================================================
// INICIALIZACIÓN — Abre o crea la base de datos
// ============================================================
function inicializarDB() {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(DB_NOMBRE, DB_VERSION);

    // --- Se ejecuta solo cuando se crea o actualiza la versión ---
    solicitud.onupgradeneeded = (evento) => {
      const db = evento.target.result;

      // --- Store: productos ---
      if (!db.objectStoreNames.contains("productos")) {
        const storeProductos = db.createObjectStore("productos", {
          keyPath: "id",
          autoIncrement: true,
        });
        storeProductos.createIndex("codigo_barra", "codigo_barra", { unique: true });
        storeProductos.createIndex("nombre", "nombre", { unique: false });
        storeProductos.createIndex("categoria", "categoria", { unique: false });
        storeProductos.createIndex("proveedor_id", "proveedor_id", { unique: false });
        storeProductos.createIndex("vencimiento", "vencimiento", { unique: false });
      }

      // --- Store: ventas ---
      if (!db.objectStoreNames.contains("ventas")) {
        const storeVentas = db.createObjectStore("ventas", {
          keyPath: "id",
          autoIncrement: true,
        });
        storeVentas.createIndex("fecha", "fecha", { unique: false });
        storeVentas.createIndex("cajero", "cajero", { unique: false });
        storeVentas.createIndex("tipo", "tipo", { unique: false });
        storeVentas.createIndex("cliente_id", "cliente_id", { unique: false });
      }

      // --- Store: clientes ---
      if (!db.objectStoreNames.contains("clientes")) {
        const storeClientes = db.createObjectStore("clientes", {
          keyPath: "id",
          autoIncrement: true,
        });
        storeClientes.createIndex("nombre", "nombre", { unique: false });
        storeClientes.createIndex("telefono", "telefono", { unique: false });
      }

      // --- Store: creditos ---
      if (!db.objectStoreNames.contains("creditos")) {
        const storeCreditos = db.createObjectStore("creditos", {
          keyPath: "id",
          autoIncrement: true,
        });
        storeCreditos.createIndex("cliente_id", "cliente_id", { unique: false });
        storeCreditos.createIndex("fecha", "fecha", { unique: false });
        storeCreditos.createIndex("tipo", "tipo", { unique: false });
        storeCreditos.createIndex("venta_id", "venta_id", { unique: false });
      }

      // --- Store: proveedores ---
      if (!db.objectStoreNames.contains("proveedores")) {
        const storeProveedores = db.createObjectStore("proveedores", {
          keyPath: "id",
          autoIncrement: true,
        });
        storeProveedores.createIndex("nombre", "nombre", { unique: false });
      }

      // --- Store: cajeros ---
      // Registro de cajeros para gestión de turnos
      if (!db.objectStoreNames.contains("cajeros")) {
        const storeCajeros = db.createObjectStore("cajeros", {
          keyPath: "id",
          autoIncrement: true,
        });
        storeCajeros.createIndex("nombre", "nombre", { unique: false });
      }

      console.log("✅ Esquema de MinimercadoDB v2 creado correctamente.");
    };

    solicitud.onsuccess = (evento) => {
      db = evento.target.result;
      console.log("✅ MinimercadoDB conectada.");
      resolve(db);
    };

    solicitud.onerror = (evento) => {
      console.error("❌ Error al abrir MinimercadoDB:", evento.target.error);
      reject(evento.target.error);
    };
  });
}

// ============================================================
// HELPER INTERNO — Devuelve una transacción lista para usar
// ============================================================
function _getStore(nombreStore, modo = "readonly") {
  const transaccion = db.transaction(nombreStore, modo);
  return transaccion.objectStore(nombreStore);
}

// ============================================================
// CRUD GENÉRICO
// ============================================================

function agregar(nombreStore, datos) {
  return new Promise((resolve, reject) => {
    const store = _getStore(nombreStore, "readwrite");
    const solicitud = store.add(datos);
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function obtenerPorId(nombreStore, id) {
  return new Promise((resolve, reject) => {
    const store = _getStore(nombreStore);
    const solicitud = store.get(id);
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function obtenerTodos(nombreStore) {
  return new Promise((resolve, reject) => {
    const store = _getStore(nombreStore);
    const solicitud = store.getAll();
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function actualizar(nombreStore, datos) {
  return new Promise((resolve, reject) => {
    const store = _getStore(nombreStore, "readwrite");
    const solicitud = store.put(datos);
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function eliminar(nombreStore, id) {
  return new Promise((resolve, reject) => {
    const store = _getStore(nombreStore, "readwrite");
    const solicitud = store.delete(id);
    solicitud.onsuccess = () => resolve(true);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

// ============================================================
// CONSULTAS ESPECÍFICAS POR ÍNDICE
// ============================================================

function buscarProductoPorCodigo(codigoBarra) {
  return new Promise((resolve, reject) => {
    const store = _getStore("productos");
    const indice = store.index("codigo_barra");
    const solicitud = indice.get(codigoBarra);
    solicitud.onsuccess = () => resolve(solicitud.result || null);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function buscarProductosPorNombre(texto) {
  return new Promise((resolve, reject) => {
    const store = _getStore("productos");
    const resultados = [];
    const solicitud = store.openCursor();
    const textoBusqueda = texto.toLowerCase();

    solicitud.onsuccess = (evento) => {
      const cursor = evento.target.result;
      if (cursor) {
        if (cursor.value.nombre.toLowerCase().includes(textoBusqueda)) {
          resultados.push(cursor.value);
        }
        cursor.continue();
      } else {
        resolve(resultados);
      }
    };
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function obtenerProductosPorVencer(diasMargen = 30) {
  return new Promise((resolve, reject) => {
    const store = _getStore("productos");
    const resultados = [];
    const hoy = new Date();
    const limite = new Date();
    limite.setDate(hoy.getDate() + diasMargen);

    const solicitud = store.openCursor();
    solicitud.onsuccess = (evento) => {
      const cursor = evento.target.result;
      if (cursor) {
        const producto = cursor.value;
        if (producto.vencimiento) {
          const fechaVenc = new Date(producto.vencimiento);
          if (fechaVenc <= limite) {
            const diasRestantes = Math.ceil(
              (fechaVenc - hoy) / (1000 * 60 * 60 * 24)
            );
            resultados.push({ ...producto, diasRestantes });
          }
        }
        cursor.continue();
      } else {
        resultados.sort((a, b) => a.diasRestantes - b.diasRestantes);
        resolve(resultados);
      }
    };
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function obtenerVentasPorRango(fechaInicio, fechaFin) {
  return new Promise((resolve, reject) => {
    const store = _getStore("ventas");
    const resultados = [];
    const rango = IDBKeyRange.bound(fechaInicio, fechaFin);
    const indice = store.index("fecha");
    const solicitud = indice.openCursor(rango);

    solicitud.onsuccess = (evento) => {
      const cursor = evento.target.result;
      if (cursor) {
        resultados.push(cursor.value);
        cursor.continue();
      } else {
        resolve(resultados);
      }
    };
    solicitud.onerror = () => reject(solicitud.error);
  });
}

function obtenerCreditosPorCliente(clienteId) {
  return new Promise((resolve, reject) => {
    const store = _getStore("creditos");
    const indice = store.index("cliente_id");
    const solicitud = indice.getAll(clienteId);
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

async function reducirStock(productoId, cantidad) {
  const producto = await obtenerPorId("productos", productoId);
  if (!producto) throw new Error("Producto no encontrado");
  if (producto.stock < cantidad) throw new Error("Stock insuficiente");
  producto.stock -= cantidad;
  await actualizar("productos", producto);
  return producto.stock;
}

// ============================================================
// EXPORTAR TODA LA BASE DE DATOS (para backup.js)
// ============================================================
async function exportarDB() {
  const stores = ["productos", "ventas", "clientes", "creditos", "proveedores", "cajeros"];
  const snapshot = {};

  for (const nombre of stores) {
    snapshot[nombre] = await obtenerTodos(nombre);
  }

  snapshot._meta = {
    exportado_en: new Date().toISOString(),
    version: DB_VERSION,
  };

  return snapshot;
}

// ============================================================
// EXPORTACIONES
// ============================================================
export {
  inicializarDB,
  agregar,
  obtenerPorId,
  obtenerTodos,
  actualizar,
  eliminar,
  buscarProductoPorCodigo,
  buscarProductosPorNombre,
  obtenerProductosPorVencer,
  obtenerVentasPorRango,
  obtenerCreditosPorCliente,
  reducirStock,
  exportarDB,
};