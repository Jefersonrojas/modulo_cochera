const StorageService = (() => {
    const STORAGE_KEY = 'cochera_vehiculos';

    function obtenerTodos() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    }

    function guardarTodos(vehiculos) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(vehiculos));
    }

    function siguienteId() {
        const todos = obtenerTodos();
        if (todos.length === 0) return 1;
        return Math.max(...todos.map(v => v.id)) + 1;
    }

    return { obtenerTodos, guardarTodos, siguienteId };
})();

const VehicleService = (() => {
    const TARIFAS = {
        auto: 5,
        moto: 3,
        camioneta: 7,
    };

    function crearVehiculo(placa, tipo) {
        return {
            id: StorageService.siguienteId(),
            placa: placa.toUpperCase().trim(),
            tipo: tipo,
            horaIngreso: new Date().toISOString(),
            horaSalida: null,
            estado: 'dentro',
            totalPagado: 0,
        };
    }

    function registrarIngreso(placa, tipo) {
        const placaNorm = placa.toUpperCase().trim();
        const todos = StorageService.obtenerTodos();

        const activo = todos.find(
            v => v.placa === placaNorm && v.estado === 'dentro'
        );

        if (activo) {
            return {
                ok: false,
                mensaje: `La placa ${placaNorm} ya está registrada en la cochera.`,
            };
        }

        const nuevo = crearVehiculo(placaNorm, tipo);
        todos.push(nuevo);
        StorageService.guardarTodos(todos);

        return { ok: true, mensaje: 'Vehículo registrado correctamente.', vehiculo: nuevo };
    }

    function calcularMonto(horaIngreso, horaSalida, tipo) {
        const msIngreso = new Date(horaIngreso).getTime();
        const msSalida = new Date(horaSalida).getTime();

        const diferenciaHoras = Math.ceil((msSalida - msIngreso) / (1000 * 60 * 60));
        const horasEfectivas = Math.max(diferenciaHoras, 1);

        const tarifa = TARIFAS[tipo] || 5;
        const monto = horasEfectivas * tarifa;

        return { horas: horasEfectivas, monto };
    }

    function registrarSalida(id) {
        const todos = StorageService.obtenerTodos();
        const indice = todos.findIndex(v => v.id === id);

        if (indice === -1) return { ok: false, mensaje: 'Vehículo no encontrado.' };

        const vehiculo = todos[indice];
        if (vehiculo.estado === 'salida') {
            return { ok: false, mensaje: 'El vehículo ya tiene salida registrada.' };
        }

        const horaSalidaISO = new Date().toISOString();
        const { horas, monto } = calcularMonto(vehiculo.horaIngreso, horaSalidaISO, vehiculo.tipo);

        vehiculo.horaSalida = horaSalidaISO;
        vehiculo.estado = 'salida';
        vehiculo.totalPagado = monto;

        StorageService.guardarTodos(todos);

        return { ok: true, vehiculo, horas, monto };
    }

    function obtenerEstadisticas() {
        const todos = StorageService.obtenerTodos();
        const dentro = todos.filter(v => v.estado === 'dentro').length;
        const salida = todos.filter(v => v.estado === 'salida').length;
        return { dentro, salida, total: todos.length };
    }

    function limpiarHistorial() {
        const activos = StorageService.obtenerTodos().filter(v => v.estado === 'dentro');
        StorageService.guardarTodos(activos);
    }

    return { registrarIngreso, registrarSalida, calcularMonto, obtenerEstadisticas, limpiarHistorial };
})();

const UIRenderer = (() => {
    const ICONOS_TIPO = { auto: '🚗', moto: '🏍️', camioneta: '🚐' };

    function formatearFecha(isoString) {
        if (!isoString) return '—';
        const fecha = new Date(isoString);
        return fecha.toLocaleDateString('es-PE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function crearFilaHtml(v) {
        const estadoClass = v.estado === 'dentro' ? 'estado-chip--dentro' : 'estado-chip--salida';
        const estadoLabel = v.estado === 'dentro' ? '🟢 Dentro' : '🔴 Salida';

        const tipoHtml = `
      <span class="tipo-chip">
        ${ICONOS_TIPO[v.tipo] || '🚗'} ${v.tipo.charAt(0).toUpperCase() + v.tipo.slice(1)}
      </span>`;

        const totalHtml = v.totalPagado > 0
            ? `<span class="td-total">S/ ${v.totalPagado.toFixed(2)}</span>`
            : '<span style="color:var(--clr-text-muted)">—</span>';

        const accionHtml = v.estado === 'dentro'
            ? `<button class="btn btn--danger btn--sm js-btn-salida" data-id="${v.id}" title="Registrar salida del vehículo">
           🚪 Salida
         </button>`
            : '<span class="form-hint" style="text-align:center">Completo</span>';

        return `
      <tr data-id="${v.id}" data-estado="${v.estado}">
        <td class="td-id">#${v.id}</td>
        <td class="td-placa">${v.placa}</td>
        <td>${tipoHtml}</td>
        <td style="color:var(--clr-text-secondary)">${formatearFecha(v.horaIngreso)}</td>
        <td><span class="estado-chip ${estadoClass}">${estadoLabel}</span></td>
        <td>${totalHtml}</td>
        <td>${accionHtml}</td>
      </tr>`;
    }

    function renderizarTabla(vehiculos) {
        const $tbody = $('#tabla-body');
        const $vacio = $('#estado-vacio');

        $tbody.empty();

        if (vehiculos.length === 0) {
            $vacio.addClass('visible');
            return;
        }

        $vacio.removeClass('visible');

        [...vehiculos].reverse().forEach(v => {
            $tbody.append(crearFilaHtml(v));
        });
    }

    function actualizarEstadisticas() {
        const stats = VehicleService.obtenerEstadisticas();
        $('#count-dentro').text(stats.dentro);
        $('#count-salida').text(stats.salida);
    }

    function mostrarModalSalida(vehiculo, horas, monto) {
        const icono = ICONOS_TIPO[vehiculo.tipo] || '🚗';

        const html = `
      <div class="comprobante-fila">
        <span class="comprobante-label">Placa</span>
        <span class="comprobante-valor td-placa">${vehiculo.placa}</span>
      </div>
      <div class="comprobante-fila">
        <span class="comprobante-label">Tipo</span>
        <span class="comprobante-valor">${icono} ${vehiculo.tipo}</span>
      </div>
      <div class="comprobante-fila">
        <span class="comprobante-label">Hora de Ingreso</span>
        <span class="comprobante-valor">${formatearFecha(vehiculo.horaIngreso)}</span>
      </div>
      <div class="comprobante-fila">
        <span class="comprobante-label">Hora de Salida</span>
        <span class="comprobante-valor">${formatearFecha(vehiculo.horaSalida)}</span>
      </div>
      <div class="comprobante-fila">
        <span class="comprobante-label">Tiempo Estacionado</span>
        <span class="comprobante-valor">${horas} hora${horas !== 1 ? 's' : ''}</span>
      </div>
      <div class="comprobante-total">
        <p class="comprobante-total-label">Total a Pagar</p>
        <p class="comprobante-total-monto">S/ ${monto.toFixed(2)}</p>
      </div>`;

        $('#modal-body').html(html);
        $('#modal-confirmar').data('id', vehiculo.id);
        $('#modal-overlay').addClass('visible');
    }

    function cerrarModal() {
        $('#modal-overlay').removeClass('visible');
        $('#modal-body').empty();
    }

    function mostrarToast(mensaje, tipo = 'success', duracion = 3500) {
        const iconos = { success: '✅', error: '❌', warning: '⚠️' };
        const $toast = $(`
      <div class="toast toast--${tipo}" role="alert">
        <span>${iconos[tipo] || '📢'}</span>
        <span>${mensaje}</span>
      </div>`);

        $('#toast-container').append($toast);

        setTimeout(() => {
            $toast.css('animation', 'toastSlideOut .3s ease forwards');
            setTimeout(() => $toast.remove(), 300);
        }, duracion);
    }

    function setError(idError, mensaje) {
        $(`#${idError}`).text(mensaje);
    }

    return {
        renderizarTabla,
        actualizarEstadisticas,
        mostrarModalSalida,
        cerrarModal,
        mostrarToast,
        setError,
    };
})();

const ParkingApp = (() => {
    let filtroActivo = 'todos';
    let terminoBusq = '';

    function obtenerVehiculosFiltrados() {
        let todos = StorageService.obtenerTodos();

        if (filtroActivo !== 'todos') {
            todos = todos.filter(v => v.estado === filtroActivo);
        }

        if (terminoBusq.trim() !== '') {
            const busq = terminoBusq.toUpperCase().trim();
            todos = todos.filter(v => v.placa.includes(busq));
        }

        return todos;
    }

    function refrescarVista() {
        UIRenderer.renderizarTabla(obtenerVehiculosFiltrados());
        UIRenderer.actualizarEstadisticas();
    }

    function validarFormulario() {
        let valido = true;

        UIRenderer.setError('error-placa', '');
        UIRenderer.setError('error-tipo', '');

        const placa = $('#input-placa').val().trim();
        const tipo = $('input[name="tipo"]:checked').val();

        if (!placa) {
            UIRenderer.setError('error-placa', 'La placa es obligatoria.');
            valido = false;
        } else if (placa.length < 5) {
            UIRenderer.setError('error-placa', 'La placa debe tener al menos 5 caracteres.');
            valido = false;
        }

        if (!tipo) {
            UIRenderer.setError('error-tipo', 'Selecciona el tipo de vehículo.');
            valido = false;
        }

        return valido;
    }

    function onSubmitIngreso(event) {
        event.preventDefault();

        if (!validarFormulario()) return;

        const placa = $('#input-placa').val().trim();
        const tipo = $('input[name="tipo"]:checked').val();

        const resultado = VehicleService.registrarIngreso(placa, tipo);

        if (!resultado.ok) {
            UIRenderer.setError('error-placa', resultado.mensaje);
            UIRenderer.mostrarToast(resultado.mensaje, 'error');
            return;
        }

        $('#form-ingreso')[0].reset();
        $('#input-placa').val('');
        $('#tipo-auto').prop('checked', true);

        UIRenderer.mostrarToast(`Vehículo ${placa.toUpperCase()} registrado correctamente.`, 'success');
        refrescarVista();
    }

    function onClickSalida(event) {
        const id = parseInt($(event.currentTarget).data('id'), 10);

        const todos = StorageService.obtenerTodos();
        const vehiculo = todos.find(v => v.id === id);

        if (!vehiculo) {
            UIRenderer.mostrarToast('Vehículo no encontrado.', 'error');
            return;
        }

        const ahoraISO = new Date().toISOString();
        const { horas, monto } = VehicleService.calcularMonto(
            vehiculo.horaIngreso,
            ahoraISO,
            vehiculo.tipo
        );

        const previewVehiculo = { ...vehiculo, horaSalida: ahoraISO };
        UIRenderer.mostrarModalSalida(previewVehiculo, horas, monto);
    }

    function onConfirmarSalida() {
        const id = parseInt($('#modal-confirmar').data('id'), 10);

        const resultado = VehicleService.registrarSalida(id);

        if (!resultado.ok) {
            UIRenderer.mostrarToast(resultado.mensaje, 'error');
            UIRenderer.cerrarModal();
            return;
        }

        UIRenderer.cerrarModal();
        UIRenderer.mostrarToast(
            `Salida de ${resultado.vehiculo.placa} registrada. Total: S/ ${resultado.monto.toFixed(2)}`,
            'success',
            5000
        );
        refrescarVista();
    }

    function onClickFiltro(event) {
        const $btn = $(event.currentTarget);
        filtroActivo = $btn.data('filtro');

        $('.filtro-btn').removeClass('filtro-btn--active');
        $btn.addClass('filtro-btn--active');

        refrescarVista();
    }

    function onBuscarPlaca() {
        terminoBusq = $('#buscador').val();
        refrescarVista();
    }

    function onLimpiarHistorial() {
        const stats = VehicleService.obtenerEstadisticas();

        if (stats.salida === 0) {
            UIRenderer.mostrarToast('No hay historial de salidas para limpiar.', 'warning');
            return;
        }

        if (!window.confirm(`¿Eliminar el historial de ${stats.salida} vehículo(s) con salida registrada?`)) {
            return;
        }

        VehicleService.limpiarHistorial();
        UIRenderer.mostrarToast('Historial de salidas eliminado.', 'success');
        refrescarVista();
    }

    function onCerrarModal(event) {
        if ($(event.target).is('#modal-overlay') || $(event.target).is('#modal-close')) {
            UIRenderer.cerrarModal();
        }
    }

    function init() {
        $('#form-ingreso').on('submit', onSubmitIngreso);
        $('#tabla-body').on('click', '.js-btn-salida', onClickSalida);
        $('#modal-confirmar').on('click', onConfirmarSalida);
        $('#modal-overlay, #modal-close').on('click', onCerrarModal);

        $(document).on('keydown', e => {
            if (e.key === 'Escape') UIRenderer.cerrarModal();
        });

        $('.filtro-btn').on('click', onClickFiltro);
        $('#buscador').on('input', onBuscarPlaca);
        $('#btn-limpiar-historial').on('click', onLimpiarHistorial);

        $('#input-placa').on('input', function () {
            const pos = this.selectionStart;
            const upper = $(this).val().toUpperCase();
            $(this).val(upper);
            this.setSelectionRange(pos, pos);
        });

        refrescarVista();
    }

    return { init };
})();

$(document).ready(() => {
    ParkingApp.init();
});
