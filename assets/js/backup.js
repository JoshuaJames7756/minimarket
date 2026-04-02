// ============================================================
// backup.js — Sistema de Backup Automático y Manual
// Minimercado Control-Total | JVSoftware
// Exporta toda la base de datos a un archivo .json descargable.
// El backup automático se dispara al hacer cierre de caja.
// ============================================================

import { exportarDB, agregar, eliminar, obtenerTodos } from "./db.js";

// ============================================================
// BACKUP MANUAL
// El usuario lo descarga desde el dashboard cuando quiere.
// ============================================================
async function descargarBackupManual() {
  try {
    _mostrarEstado("Preparando backup...");
    const snapshot = await exportarDB();
    const nombreArchivo = _generarNombreArchivo("backup-manual");
    _descargarJSON(snapshot, nombreArchivo);
    _mostrarEstado("✅ Backup descargado correctamente.", "exito");
    console.log(`✅ Backup manual guardado: ${nombreArchivo}`);
  } catch (error) {
    console.error("❌ Error al generar backup:", error);
    _mostrarEstado("❌ Error al generar el backup. Intenta de nuevo.", "error");
  }
}

// ============================================================
// BACKUP AUTOMÁTICO
// Se llama desde eeff.js al confirmar el cierre de caja.
// No muestra dialogo — descarga silenciosamente.
// ============================================================
async function ejecutarBackupAutomatico() {
  try {
    const snapshot = await exportarDB();
    const nombreArchivo = _generarNombreArchivo("cierre-automatico");
    _descargarJSON(snapshot, nombreArchivo);

    // --- Registra la fecha del último backup en localStorage ---
    localStorage.setItem("ultimo_backup", new Date().toISOString());
    console.log(`✅ Backup automático guardado: ${nombreArchivo}`);
  } catch (error) {
    console.error("❌ Error en backup automático:", error);
  }
}

// ============================================================
// IMPORTAR BACKUP (Restaurar datos)
// Permite restaurar la DB desde un archivo .json previo.
// ============================================================
function iniciarImportacion() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.addEventListener("change", async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;

    const confirmado = confirm(
      "⚠️ ATENCIÓN: Importar un backup reemplazará TODOS los datos actuales.\n\n" +
        "¿Estás seguro de que deseas continuar?"
    );
    if (!confirmado) return;

    try {
      const texto = await archivo.text();
      const datos = JSON.parse(texto);
      await _importarDatos(datos);
      _mostrarEstado("✅ Datos restaurados correctamente. Recarga la página.", "exito");
    } catch (error) {
      console.error("❌ Error al importar:", error);
      _mostrarEstado("❌ El archivo no es válido o está corrupto.", "error");
    }
  });

  input.click();
}

// ============================================================
// IMPORTAR DATOS A INDEXEDDB
// ============================================================
async function _importarDatos(datos) {
  const stores = ["productos", "ventas", "clientes", "creditos", "proveedores"];

  for (const storeName of stores) {
    if (!datos[storeName]) continue;

    // --- Borra los registros actuales del store ---
    const registrosActuales = await obtenerTodos(storeName);
    for (const registro of registrosActuales) {
      await eliminar(storeName, registro.id);
    }

    // --- Importa los nuevos registros ---
    for (const registro of datos[storeName]) {
      await agregar(storeName, registro);
    }
  }

  console.log("✅ Importación completada.");
}

// ============================================================
// INFORMACIÓN DEL ÚLTIMO BACKUP
// Muestra en el dashboard cuándo fue el último backup.
// ============================================================
function mostrarInfoUltimoBackup() {
  const el = document.getElementById("backup-ultimo");
  if (!el) return;

  const ultimoBackup = localStorage.getItem("ultimo_backup");
  if (!ultimoBackup) {
    el.textContent = "Nunca se ha realizado un backup";
    el.className = "backup-info backup-info--alerta";
    return;
  }

  const fecha = new Date(ultimoBackup);
  const ahora = new Date();
  const diasDesde = Math.floor((ahora - fecha) / (1000 * 60 * 60 * 24));

  el.textContent = `Último backup: ${fecha.toLocaleString("es-BO")}`;

  if (diasDesde >= 3) {
    el.className = "backup-info backup-info--alerta";
    el.textContent += ` (hace ${diasDesde} días — ¡Se recomienda hacer uno!)`;
  } else {
    el.className = "backup-info backup-info--ok";
  }
}

// ============================================================
// HELPERS INTERNOS
// ============================================================

// --- Genera un nombre de archivo con fecha y hora ---
function _generarNombreArchivo(prefijo) {
  const ahora = new Date();
  const fecha = ahora.toISOString().slice(0, 10); // YYYY-MM-DD
  const hora = ahora.toTimeString().slice(0, 5).replace(":", "h"); // HHhMM
  return `minimercado-${prefijo}-${fecha}-${hora}.json`;
}

// --- Dispara la descarga del JSON en el navegador ---
function _descargarJSON(datos, nombreArchivo) {
  const json = JSON.stringify(datos, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  // --- Libera la URL del objeto después de la descarga ---
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// --- Muestra un mensaje de estado en el elemento de backup del dashboard ---
function _mostrarEstado(mensaje, tipo = "info") {
  const el = document.getElementById("backup-estado");
  if (!el) return;
  el.textContent = mensaje;
  el.className = `backup-estado backup-estado--${tipo}`;

  // --- Limpia el mensaje después de 5 segundos ---
  setTimeout(() => {
    el.textContent = "";
    el.className = "backup-estado";
  }, 5000);
}

// ============================================================
// INICIALIZACIÓN — Enlaza botones del dashboard
// ============================================================
function iniciarBackup() {
  const btnManual = document.getElementById("btn-backup-manual");
  const btnImportar = document.getElementById("btn-importar-backup");

  if (btnManual) btnManual.addEventListener("click", descargarBackupManual);
  if (btnImportar) btnImportar.addEventListener("click", iniciarImportacion);

  mostrarInfoUltimoBackup();
  console.log("✅ Módulo de backup listo.");
}

// ============================================================
// EXPORTACIONES
// ============================================================
export {
  iniciarBackup,
  descargarBackupManual,
  ejecutarBackupAutomatico,
  iniciarImportacion,
  mostrarInfoUltimoBackup,
};