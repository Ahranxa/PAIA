// Variables globales
let productos = [];
let categorias = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    mostrarFechaActual();

    const usuario = localStorage.getItem('usuario');

    if (usuario) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-header').classList.remove('hidden');
        document.getElementById('app-content').classList.remove('hidden');

        cargarInventario();
        cargarEstadisticas();
        cargarAlertas();
        cargarCategorias();
    }

    // Event listeners
    document.getElementById('form-producto').addEventListener('submit', guardarProducto);
    document.getElementById('form-movimiento').addEventListener('submit', registrarMovimiento);
    document.getElementById('busqueda').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') buscarProductos();
    });
});

// Mostrar fecha actual
function mostrarFechaActual() {
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const fecha = new Date().toLocaleDateString('es-MX', opciones);
    document.getElementById('fecha-actual').textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);
}

// Cargar inventario
async function cargarInventario() {
    try {
        const response = await fetch(`${API_URL}/inventario`);
        productos = await response.json();
        renderizarTabla(productos);
        document.getElementById('loading').classList.add('hidden');
    } catch (error) {
        console.error('Error al cargar inventario:', error);
        document.getElementById('loading').innerHTML = '<p class="text-red-500">Error al cargar el inventario</p>';
    }
}

// Renderizar tabla
function renderizarTabla(datos) {
    const tbody = document.getElementById('tabla-inventario');
    const noResultados = document.getElementById('no-resultados');
    
    tbody.innerHTML = '';
    
    if (datos.length === 0) {
        noResultados.classList.remove('hidden');
        return;
    }
    
    noResultados.classList.add('hidden');
    
    datos.forEach(producto => {
        const stockBajo = producto.stock < producto.stock_minimo;
        const row = document.createElement('tr');
        row.className = stockBajo ? 'bg-red-50' : 'hover:bg-gray-50';
        
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${producto.sku || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <div class="font-medium">${producto.nombre}</div>
                <div class="text-gray-500 text-xs">${producto.descripcion || ''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <span class="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">${producto.categoria}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${stockBajo ? 'text-red-600 font-bold' : 'text-gray-900'}">
                ${producto.stock}
                ${stockBajo ? '<span class="ml-1">⚠️</span>' : ''}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${producto.stock_minimo}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">$${formatoMoneda(producto.precio_compra)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">$${formatoMoneda(producto.precio_venta)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${producto.proveedor || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <div class="flex gap-2">
                    <button onclick="abrirModalMovimiento('${producto.id}')" 
                            class="text-green-600 hover:text-green-800 text-lg" title="Movimiento">📥</button>
                    <button onclick="verHistorial('${producto.id}')" 
                            class="text-blue-600 hover:text-blue-800 text-lg" title="Historial">📋</button>
                    <button onclick="abrirModalEditar('${producto.id}')" 
                            class="text-yellow-600 hover:text-yellow-800 text-lg" title="Editar">✏️</button>
                    <button onclick="eliminarProducto('${producto.id}')" 
                            class="text-red-600 hover:text-red-800 text-lg" title="Eliminar">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Formato de moneda
function formatoMoneda(valor) {
    return parseFloat(valor).toFixed(2);
}

// Cargar estadísticas
async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_URL}/inventario/estadisticas`);
        const stats = await response.json();
        
        document.getElementById('stat-total').textContent = stats.totalProductos;
        document.getElementById('stat-valor').textContent = `$${formatoMoneda(stats.valorTotalInventario)}`;
        document.getElementById('stat-bajo-stock').textContent = stats.productosBajoStock;
        document.getElementById('stat-venta').textContent = `$${formatoMoneda(stats.valorVentaPotencial)}`;
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

// Cargar alertas
async function cargarAlertas() {
    try {
        const response = await fetch(`${API_URL}/inventario/alertas/bajo-stock`);
        const alertas = await response.json();
        
        const alertasSection = document.getElementById('alertas-section');
        const alertasLista = document.getElementById('alertas-lista');
        
        if (alertas.length > 0) {
            alertasSection.classList.remove('hidden');
            alertasLista.innerHTML = alertas.map(p => `
                <div class="flex justify-between items-center bg-white p-3 rounded-lg">
                    <div>
                        <span class="font-medium">${p.nombre}</span>
                        <span class="text-gray-500 ml-2">(${p.sku})</span>
                    </div>
                    <div class="text-right">
                        <span class="text-red-600 font-bold">${p.stock}</span>
                        <span class="text-gray-500"> / ${p.stock_minimo}</span>
                    </div>
                </div>
            `).join('');
        } else {
            alertasSection.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error al cargar alertas:', error);
    }
}

// Buscar productos
async function buscarProductos() {
    const termino = document.getElementById('busqueda').value.trim();
    if (!termino) {
        cargarInventario();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/inventario/buscar/${encodeURIComponent(termino)}`);
        const resultados = await response.json();
        renderizarTabla(resultados);
    } catch (error) {
        console.error('Error al buscar:', error);
    }
}

// Mostrar todos
function mostrarTodos() {
    document.getElementById('busqueda').value = '';
    cargarInventario();
}

// Abrir modal agregar
function abrirModalAgregar() {
    document.getElementById('modal-titulo').textContent = 'Agregar Producto';
    document.getElementById('form-producto').reset();
    document.getElementById('producto-id').value = '';
    actualizarSelectCategorias();
    document.getElementById('modal-producto').classList.remove('hidden');
    document.getElementById('modal-producto').classList.add('flex');
}

// Abrir modal editar
async function abrirModalEditar(id) {
    try {
        const response = await fetch(`${API_URL}/inventario/${id}`);
        const producto = await response.json();
        
        actualizarSelectCategorias();
        
        document.getElementById('modal-titulo').textContent = 'Editar Producto';
        document.getElementById('producto-id').value = producto.id;
        document.getElementById('sku').value = producto.sku || '';
        document.getElementById('nombre').value = producto.nombre;
        document.getElementById('descripcion').value = producto.descripcion || '';
        document.getElementById('categoria').value = producto.categoria;
        document.getElementById('proveedor').value = producto.proveedor || '';
        document.getElementById('stock').value = producto.stock;
        document.getElementById('stock_minimo').value = producto.stock_minimo;
        document.getElementById('precio_compra').value = producto.precio_compra;
        document.getElementById('precio_venta').value = producto.precio_venta;
        
        document.getElementById('modal-producto').classList.remove('hidden');
        document.getElementById('modal-producto').classList.add('flex');
    } catch (error) {
        console.error('Error al cargar producto:', error);
        alert('Error al cargar el producto');
    }
}

// Cerrar modal
function cerrarModal() {
    document.getElementById('modal-producto').classList.add('hidden');
    document.getElementById('modal-producto').classList.remove('flex');
}

// Guardar producto
async function guardarProducto(e) {
    e.preventDefault();
    
    const id = document.getElementById('producto-id').value;
    const producto = {
        sku: document.getElementById('sku').value,
        nombre: document.getElementById('nombre').value,
        descripcion: document.getElementById('descripcion').value,
        categoria: document.getElementById('categoria').value,
        proveedor: document.getElementById('proveedor').value,
        stock: parseInt(document.getElementById('stock').value),
        stock_minimo: parseInt(document.getElementById('stock_minimo').value),
        precio_compra: parseFloat(document.getElementById('precio_compra').value),
        precio_venta: parseFloat(document.getElementById('precio_venta').value)
    };
    
    try {
        const url = id ? `${API_URL}/inventario/${id}` : `${API_URL}/inventario`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(producto)
        });
        
        if (response.ok) {
            cerrarModal();
            cargarInventario();
            cargarEstadisticas();
            cargarAlertas();
            alert(id ? 'Producto actualizado correctamente' : 'Producto agregado correctamente');
        } else {
            throw new Error('Error al guardar producto');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al guardar el producto');
    }
}

// Eliminar producto
async function eliminarProducto(id) {
    if (!confirm('¿Está seguro de eliminar este producto?')) return;
    
    try {
        const response = await fetch(`${API_URL}/inventario/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            cargarInventario();
            cargarEstadisticas();
            cargarAlertas();
            alert('Producto eliminado correctamente');
        } else {
            throw new Error('Error al eliminar producto');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al eliminar el producto');
    }
}

// Abrir modal movimiento
async function abrirModalMovimiento(id) {
    try {
        const response = await fetch(`${API_URL}/inventario/${id}`);
        const producto = await response.json();
        
        document.getElementById('movimiento-producto-id').value = producto.id;
        document.getElementById('movimiento-nombre-producto').textContent = producto.nombre;
        document.getElementById('movimiento-stock-actual').textContent = `Stock actual: ${producto.stock}`;
        document.getElementById('form-movimiento').reset();
        document.getElementById('movimiento-producto-id').value = producto.id;
        
        document.getElementById('modal-movimiento').classList.remove('hidden');
        document.getElementById('modal-movimiento').classList.add('flex');
    } catch (error) {
        console.error('Error al cargar producto:', error);
        alert('Error al cargar el producto');
    }
}

// Cerrar modal movimiento
function cerrarModalMovimiento() {
    document.getElementById('modal-movimiento').classList.add('hidden');
    document.getElementById('modal-movimiento').classList.remove('flex');
}

// Registrar movimiento
async function registrarMovimiento(e) {
    e.preventDefault();
    
    const movimiento = {
        tipo: document.getElementById('movimiento-tipo').value,
        cantidad: parseInt(document.getElementById('movimiento-cantidad').value),
        motivo: document.getElementById('movimiento-motivo').value
    };
    
    const productoId = document.getElementById('movimiento-producto-id').value;
    
    try {
        const response = await fetch(`${API_URL}/inventario/${productoId}/movimiento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(movimiento)
        });
        
        if (response.ok) {
            cerrarModalMovimiento();
            cargarInventario();
            cargarEstadisticas();
            cargarAlertas();
            alert('Movimiento registrado correctamente');
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Error al registrar movimiento');
        }
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Error al registrar el movimiento');
    }
}

// Ver historial
async function verHistorial(id) {
    try {
        const response = await fetch(`${API_URL}/inventario/${id}`);
        const producto = await response.json();
        
        const movimientosResponse = await fetch(`${API_URL}/inventario/${id}/movimientos`);
        const movimientos = await movimientosResponse.json();
        
        document.getElementById('historial-nombre-producto').textContent = producto.nombre;
        
        const historialLista = document.getElementById('historial-lista');
        
        if (movimientos.length === 0) {
            historialLista.innerHTML = '<p class="text-gray-500">No hay movimientos registrados</p>';
        } else {
            historialLista.innerHTML = movimientos.map(m => `
                <div class="p-4 ${m.tipo === 'entrada' ? 'bg-green-50 border-l-4 border-green-500' : 'bg-red-50 border-l-4 border-red-500'} rounded-lg">
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="font-medium ${m.tipo === 'entrada' ? 'text-green-800' : 'text-red-800'}">
                                ${m.tipo === 'entrada' ? 'ENTRADA' : 'SALIDA'}
                            </span>
                            <span class="text-gray-600 ml-2">${m.cantidad} unidades</span>
                        </div>
                        <span class="text-sm text-gray-500">${formatoFecha(m.fecha)}</span>
                    </div>
                    <div class="mt-2 text-sm text-gray-600">
                        Stock: ${m.stock_anterior} → ${m.stock_nuevo}
                    </div>
                    ${m.motivo ? `<div class="mt-1 text-sm text-gray-500">Motivo: ${m.motivo}</div>` : ''}
                </div>
            `).join('');
        }
        
        document.getElementById('modal-historial').classList.remove('hidden');
        document.getElementById('modal-historial').classList.add('flex');
    } catch (error) {
        console.error('Error al cargar historial:', error);
        alert('Error al cargar el historial');
    }
}

// Cerrar modal historial
function cerrarModalHistorial() {
    document.getElementById('modal-historial').classList.add('hidden');
    document.getElementById('modal-historial').classList.remove('flex');
}

// Formato de fecha
function formatoFecha(fecha) {
    return new Date(fecha).toLocaleString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}


// Iniciar sesión
async function iniciarSesion() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        alert('Completa todos los campos');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error);
        }

        localStorage.setItem('usuario', JSON.stringify(data.usuario));

        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-header').classList.remove('hidden');
        document.getElementById('app-content').classList.remove('hidden');

        cargarInventario();
        cargarEstadisticas();
        cargarAlertas();

        alert(`Bienvenido ${data.usuario.nombre}`);

    } catch (error) {
        alert(error.message);
    }
}

function mostrarRegistro() {
    const nombre = prompt('Nombre completo');
    if (!nombre) return;

    const email = prompt('Correo electrónico');
    if (!email) return;

    const password = prompt('Contraseña');
    if (!password) return;

    registrarUsuario(nombre, email, password);
}

async function registrarUsuario(nombre, email, password) {
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                nombre,
                email,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error);
        }

        alert('Usuario registrado correctamente');

    } catch (error) {
        alert(error.message);
    }
}

// Cerrar sesión
function cerrarSesion() {
    localStorage.removeItem('usuario');
    
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-header').classList.add('hidden');
    document.getElementById('app-content').classList.add('hidden');
    
    // Limpiar campos de login
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}

// ============ FUNCIONES DE CATEGORÍAS ============

// Cargar categorías
async function cargarCategorias() {
    try {
        const response = await fetch(`${API_URL}/categorias`);
        categorias = await response.json();
        actualizarSelectCategorias();
    } catch (error) {
        console.error('Error al cargar categorías:', error);
    }
}

// Actualizar select de categorías en formulario de productos
function actualizarSelectCategorias() {
    const select = document.getElementById('categoria');
    const valorActual = select.value;
    
    select.innerHTML = '<option value="">Seleccionar...</option>';
    
    categorias.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.nombre;
        option.textContent = cat.nombre;
        select.appendChild(option);
    });
    
    // Mantener el valor seleccionado si existe
    if (valorActual) {
        select.value = valorActual;
    }
}

// Abrir modal de categorías
function abrirModalCategorias() {
    document.getElementById('modal-categorias').classList.remove('hidden');
    document.getElementById('modal-categorias').classList.add('flex');
    renderizarCategorias();
}

// Cerrar modal de categorías
function cerrarModalCategorias() {
    document.getElementById('modal-categorias').classList.add('hidden');
    document.getElementById('modal-categorias').classList.remove('flex');
    document.getElementById('nueva-categoria-nombre').value = '';
    document.getElementById('nueva-categoria-descripcion').value = '';
}

// Renderizar lista de categorías
function renderizarCategorias() {
    const lista = document.getElementById('categorias-lista');
    
    if (categorias.length === 0) {
        lista.innerHTML = '<p class="text-gray-500 text-center">No hay categorías registradas</p>';
        return;
    }
    
    lista.innerHTML = categorias.map(cat => `
        <div class="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200">
            <div>
                <span class="font-medium text-gray-800">${cat.nombre}</span>
                ${cat.descripcion ? `<span class="text-gray-500 ml-2 text-sm">${cat.descripcion}</span>` : ''}
            </div>
            <div class="flex gap-2">
                <button onclick="editarCategoria('${cat.id}', '${cat.nombre}', '${cat.descripcion || ''}')" 
                        class="text-yellow-600 hover:text-yellow-800 text-lg" title="Editar">✏️</button>
                <button onclick="eliminarCategoria('${cat.id}')" 
                        class="text-red-600 hover:text-red-800 text-lg" title="Eliminar">🗑️</button>
            </div>
        </div>
    `).join('');
}

// Agregar nueva categoría
async function agregarCategoria() {
    const nombre = document.getElementById('nueva-categoria-nombre').value.trim();
    const descripcion = document.getElementById('nueva-categoria-descripcion').value.trim();
    
    if (!nombre) {
        alert('El nombre de la categoría es obligatorio');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/categorias`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, descripcion })
        });
        
        if (response.ok) {
            await cargarCategorias();
            renderizarCategorias();
            document.getElementById('nueva-categoria-nombre').value = '';
            document.getElementById('nueva-categoria-descripcion').value = '';
            alert('Categoría agregada correctamente');
        } else {
            throw new Error('Error al agregar categoría');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al agregar la categoría');
    }
}

// Editar categoría
async function editarCategoria(id, nombreActual, descripcionActual) {
    const nuevoNombre = prompt('Nuevo nombre de la categoría:', nombreActual);
    if (!nuevoNombre) return;
    
    const nuevaDescripcion = prompt('Nueva descripción:', descripcionActual);
    
    try {
        const response = await fetch(`${API_URL}/categorias/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre: nuevoNombre, descripcion: nuevaDescripcion })
        });
        
        if (response.ok) {
            await cargarCategorias();
            renderizarCategorias();
            alert('Categoría actualizada correctamente');
        } else {
            throw new Error('Error al actualizar categoría');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al actualizar la categoría');
    }
}

// Eliminar categoría
async function eliminarCategoria(id) {
    if (!confirm('¿Está seguro de eliminar esta categoría?')) return;
    
    try {
        const response = await fetch(`${API_URL}/categorias/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await cargarCategorias();
            renderizarCategorias();
            alert('Categoría eliminada correctamente');
        } else {
            throw new Error('Error al eliminar categoría');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error al eliminar la categoría');
    }
}