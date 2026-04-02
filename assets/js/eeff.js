// ============================================================
// eeff.js — Estados Financieros (EEFF)
// Minimercado Control-Total | JVSoftware
// Calcula: ventas totales, costo real, utilidad bruta,
// y genera reportes filtrables por mes/rango de fechas.
// ============================================================

import { obtenerVentasPorRango, obtenerTodos } from "./db.js";

// ============================================================
// INICIALIZACIÓN
// ============================================================
async function iniciarEEFF() {
  _configurarFiltroFechas();
  await cargarResumenMesActual();
  console.log("✅ EEFF inicializado.");
}

// ============================================================
// CONFIGURAR CONTROLES DE FILTRO DE FECHAS
// ============================================================
function _configurarFiltroFechas() {
  const selectMes = document.getElementById("eeff-filtro-mes");
  const selectAnio = document.getElementById("eeff-filtro-anio");
  const btnFiltrar = document.getElementById("eeff-btn-filtrar");

  // --- Llena el selector de años (año actual y 2 anteriores) ---
  if (selectAnio) {
    const anioActual = new Date().getFullYear();
    for (let a = anioActual; a >= anioActual - 2; a--) {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = a;
      if (a === anioActual) opt.selected = true;
      selectAnio.appendChild(opt);
    }
  }

  // --- Establece el mes actual como seleccionado ---
  if (selectMes) {
    selectMes.value = String(new Date().getMonth() + 1).padStart(2, "0");
  }

  if (btnFiltrar) {
    btnFiltrar.addEventListener("click", async () => {
      const mes = selectMes?.value;
      const anio = selectAnio?.value;
      if (mes && anio) {
        await cargarReportePorMes(Number(anio), Number(mes));
      }
    });
  }
}

// ============================================================
// REPORTE DEL MES ACTUAL (carga por defecto)
// ============================================================
async function cargarResumenMesActual() {
  const hoy = new Date();
  await cargarReportePorMes(hoy.getFullYear(), hoy.getMonth() + 1);
}

// ============================================================
// REPORTE POR MES ESPECÍFICO
// ============================================================
async function cargarReportePorMes(anio, mes) {
  // --- Construye el rango del mes completo en ISO ---
  const inicio = new Date(anio, mes - 1, 1).toISOString();
  const fin = new Date(anio, mes, 0, 23, 59, 59).toISOString(); // Último día del mes

  const ventas = await obtenerVentasPorRango(inicio, fin);
  const resumen = _calcularResumen(ventas);

  _renderizarTarjetasResumen(resumen);
  _renderizarTablaVentas(ventas);
  _renderizarGraficoVentasDiarias(ventas, anio, mes);

  // --- Actualiza el título del reporte ---
  const titulo = document.getElementById("eeff-titulo-periodo");
  if (titulo) {
    const nombreMes = new Date(anio, mes - 1).toLocaleString("es-BO", {
      month: "long",
      year: "numeric",
    });
    titulo.textContent = `Reporte: ${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)}`;
  }
}

// ============================================================
// CÁLCULO DEL RESUMEN FINANCIERO
// ============================================================
function _calcularResumen(ventas) {
  let totalVentas = 0;
  let totalCosto = 0;
  let totalTransacciones = ventas.length;
  let totalContado = 0;
  let totalFiado = 0;

  ventas.forEach((venta) => {
    totalVentas += venta.total;
    if (venta.tipo === "fiado") totalFiado += venta.total;
    else totalContado += venta.total;

    // --- Suma el costo real de cada ítem vendido ---
    if (venta.items && Array.isArray(venta.items)) {
      venta.items.forEach((item) => {
        totalCosto += (item.precio_costo || 0) * item.cantidad;
      });
    }
  });

  const utilidadBruta = totalVentas - totalCosto;
  const margenBruto = totalVentas > 0 ? (utilidadBruta / totalVentas) * 100 : 0;

  return {
    totalVentas,
    totalCosto,
    utilidadBruta,
    margenBruto,
    totalTransacciones,
    totalContado,
    totalFiado,
    ticketPromedio: totalTransacciones > 0 ? totalVentas / totalTransacciones : 0,
  };
}

// ============================================================
// TARJETAS DE RESUMEN EN EL DASHBOARD
// ============================================================
function _renderizarTarjetasResumen(resumen) {
  const mapa = {
    "eeff-total-ventas": `Bs. ${resumen.totalVentas.toFixed(2)}`,
    "eeff-total-costo": `Bs. ${resumen.totalCosto.toFixed(2)}`,
    "eeff-utilidad-bruta": `Bs. ${resumen.utilidadBruta.toFixed(2)}`,
    "eeff-margen-bruto": `${resumen.margenBruto.toFixed(1)}%`,
    "eeff-transacciones": resumen.totalTransacciones,
    "eeff-ticket-promedio": `Bs. ${resumen.ticketPromedio.toFixed(2)}`,
    "eeff-total-contado": `Bs. ${resumen.totalContado.toFixed(2)}`,
    "eeff-total-fiado": `Bs. ${resumen.totalFiado.toFixed(2)}`,
  };

  Object.entries(mapa).forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = valor;
      // --- Colorea la utilidad bruta según sea positiva o negativa ---
      if (id === "eeff-utilidad-bruta") {
        el.className = resumen.utilidadBruta >= 0 ? "valor-positivo" : "valor-negativo";
      }
    }
  });
}

// ============================================================
// TABLA DETALLADA DE VENTAS DEL PERÍODO
// ============================================================
function _renderizarTablaVentas(ventas) {
  const tbody = document.getElementById("eeff-tabla-ventas-body");
  if (!tbody) return;

  if (!ventas.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="tabla-vacia">Sin ventas en este período</td></tr>`;
    return;
  }

  // --- Ordena por fecha descendente (más reciente primero) ---
  const ventasOrdenadas = [...ventas].sort(
    (a, b) => new Date(b.fecha) - new Date(a.fecha)
  );

  tbody.innerHTML = ventasOrdenadas
    .map((v) => {
      const costo = v.items?.reduce(
        (acc, item) => acc + (item.precio_costo || 0) * item.cantidad,
        0
      ) ?? 0;
      const utilidad = v.total - costo;

      return `
        <tr>
          <td>${new Date(v.fecha).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}</td>
          <td>${v.cajero}</td>
          <td><span class="tag-tipo tag-${v.tipo}">${v.tipo === "fiado" ? "Fiado" : "Contado"}</span></td>
          <td>Bs. ${v.total.toFixed(2)}</td>
          <td>Bs. ${costo.toFixed(2)}</td>
          <td class="${utilidad >= 0 ? "valor-positivo" : "valor-negativo"}">
            Bs. ${utilidad.toFixed(2)}
          </td>
        </tr>`;
    })
    .join("");
}

// ============================================================
// GRÁFICO DE VENTAS DIARIAS (Canvas nativo)
// Dibuja barras simples con Canvas API sin librerías externas.
// ============================================================
function _renderizarGraficoVentasDiarias(ventas, anio, mes) {
  const canvas = document.getElementById("eeff-grafico-ventas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const diasEnMes = new Date(anio, mes, 0).getDate();

  // --- Agrupa ventas por día ---
  const ventasPorDia = Array(diasEnMes).fill(0);
  ventas.forEach((v) => {
    const dia = new Date(v.fecha).getDate() - 1;
    ventasPorDia[dia] += v.total;
  });

  const maxVenta = Math.max(...ventasPorDia, 1);
  const ancho = canvas.width;
  const alto = canvas.height;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const areaAncho = ancho - padding.left - padding.right;
  const areaAlto = alto - padding.top - padding.bottom;
  const anchoBarra = Math.floor(areaAncho / diasEnMes) - 2;

  // --- Limpia el canvas ---
  ctx.clearRect(0, 0, ancho, alto);

  // --- Fondo ---
  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-superficie")
    .trim() || "#1e1e2e";
  ctx.fillRect(0, 0, ancho, alto);

  // --- Líneas horizontales de referencia ---
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (areaAlto / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(ancho - padding.right, y);
    ctx.stroke();

    // --- Etiqueta del eje Y ---
    const valor = maxVenta - (maxVenta / 4) * i;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${valor.toFixed(0)}`, padding.left - 6, y + 4);
  }

  // --- Barras de ventas ---
  ventasPorDia.forEach((venta, i) => {
    const altoBarra = (venta / maxVenta) * areaAlto;
    const x = padding.left + i * (anchoBarra + 2);
    const y = padding.top + areaAlto - altoBarra;

    // --- Color según si hubo ventas o no ---
    ctx.fillStyle = venta > 0
      ? getComputedStyle(document.documentElement).getPropertyValue("--color-primario").trim() || "#4ade80"
      : "rgba(255,255,255,0.05)";

    ctx.fillRect(x, y, anchoBarra, altoBarra);

    // --- Etiqueta del día (cada 5 días para no saturar) ---
    if ((i + 1) % 5 === 0 || i === 0 || i === diasEnMes - 1) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(i + 1, x + anchoBarra / 2, alto - padding.bottom + 14);
    }
  });

  // --- Etiqueta eje X ---
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("Días del mes", ancho / 2, alto - 4);
}

// ============================================================
// RESUMEN GLOBAL DE FIADOS PENDIENTES
// Para el dashboard principal.
// ============================================================
async function calcularTotalFiadosPendientes() {
  const clientes = await obtenerTodos("clientes");
  return clientes.reduce((acc, c) => acc + (c.saldo_pendiente || 0), 0);
}

// ============================================================
// REPORTE DE CIERRE DIARIO (para impresión)
// ============================================================
async function generarReporteCierre() {
  const hoy = new Date();
  const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
  const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59).toISOString();

  const ventas = await obtenerVentasPorRango(inicioDia, finDia);
  const resumen = _calcularResumen(ventas);

  const ventasPorCajero = {};
  ventas.forEach((v) => {
    if (!ventasPorCajero[v.cajero]) {
      ventasPorCajero[v.cajero] = { ventas: 0, total: 0 };
    }
    ventasPorCajero[v.cajero].ventas += 1;
    ventasPorCajero[v.cajero].total += v.total;
  });

  const filasResumenCajeros = Object.entries(ventasPorCajero)
    .map(([cajero, datos]) =>
      `<tr>
        <td>${cajero}</td>
        <td>${datos.ventas}</td>
        <td>Bs. ${datos.total.toFixed(2)}</td>
      </tr>`
    )
    .join("");

  const ventanaImpresion = window.open("", "_blank", "width=500,height=700");
  if (!ventanaImpresion) return;

  ventanaImpresion.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>Cierre de Caja — ${hoy.toLocaleDateString("es-BO")}</title>
      <link rel="stylesheet" href="/assets/css/print.css">
    </head>
    <body onload="window.print(); window.close();">
      <div class="reporte-cierre">
        <h2>Cierre de Caja</h2>
        <p>${hoy.toLocaleDateString("es-BO", { dateStyle: "full" })}</p>
        <hr/>
        <table>
          <tr><td>Total ventas</td><td>Bs. ${resumen.totalVentas.toFixed(2)}</td></tr>
          <tr><td>Costo total</td><td>Bs. ${resumen.totalCosto.toFixed(2)}</td></tr>
          <tr><td><strong>Utilidad bruta</strong></td><td><strong>Bs. ${resumen.utilidadBruta.toFixed(2)}</strong></td></tr>
          <tr><td>Margen bruto</td><td>${resumen.margenBruto.toFixed(1)}%</td></tr>
          <tr><td>Transacciones</td><td>${resumen.totalTransacciones}</td></tr>
          <tr><td>Ticket promedio</td><td>Bs. ${resumen.ticketPromedio.toFixed(2)}</td></tr>
          <tr><td>Contado</td><td>Bs. ${resumen.totalContado.toFixed(2)}</td></tr>
          <tr><td>Fiado</td><td>Bs. ${resumen.totalFiado.toFixed(2)}</td></tr>
        </table>
        <hr/>
        <h3>Por cajero</h3>
        <table>
          <thead><tr><th>Cajero</th><th>Ventas</th><th>Total</th></tr></thead>
          <tbody>${filasResumenCajeros || "<tr><td colspan='3'>Sin datos</td></tr>"}</tbody>
        </table>
        <p class="reporte-pie">Generado por Minimercado Control-Total · JVSoftware</p>
      </div>
    </body>
    </html>
  `);
  ventanaImpresion.document.close();
}

// ============================================================
// EXPORTACIONES
// ============================================================
export {
  iniciarEEFF,
  cargarResumenMesActual,
  cargarReportePorMes,
  calcularTotalFiadosPendientes,
  generarReporteCierre,
};