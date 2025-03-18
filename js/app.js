document.addEventListener('DOMContentLoaded', () => {
    console.log('Aplicación de chat inicializada');
    
    if (typeof firebase === 'undefined') {
        console.error('Firebase no está cargado correctamente');
        alert('Error al cargar contenido del servidor. Por favor, verifica tu conexión a internet o intentalo más tarde.');
    }
});