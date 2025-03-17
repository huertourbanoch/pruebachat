const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const loginTab = document.getElementById('login-tab');
const registerTab = document.getElementById('register-tab');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const logoutBtn = document.getElementById('logout-btn');
const userInitial = document.getElementById('user-initial');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');

// Cambiar entre formularios de inicio de sesión y registro
loginTab.addEventListener('click', () => {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
});

registerTab.addEventListener('click', () => {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
});

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    loginError.textContent = '';
    
    auth.signInWithEmailAndPassword(email, password)
        .catch((error) => {
            console.error('Error de inicio de sesión:', error);
            loginError.textContent = 'Error al iniciar sesión: ' + error.message;
        });
});

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    registerError.textContent = '';
    
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            return database.ref('users/' + userCredential.user.uid).set({
                name: name,
                email: email
            });
        })
        .catch((error) => {
            console.error('Error de registro:', error);
            registerError.textContent = 'Error al registrarse: ' + error.message;
        });
});

logoutBtn.addEventListener('click', () => {
    if (typeof cleanupEverything === 'function') {
        cleanupEverything();
    } else if (window.cleanupEverything) {
        window.cleanupEverything();
    }

    auth.signOut().catch((error) => {
        console.error('Error al cerrar sesión:', error);
    });
});


auth.onAuthStateChanged((user) => {
    console.log("Estado de autenticación cambiado:", user ? `Usuario: ${user.uid}` : "No hay usuario");
    
    if (user) {
        authScreen.style.display = 'none';
        chatScreen.style.display = 'flex';

        database.ref('users/' + user.uid).once('value')
            .then((snapshot) => {
                const userData = snapshot.val() || {};
                const displayName = userData.name || 'Usuario';
                
                userName.textContent = displayName;
                userEmail.textContent = user.email;
                userInitial.textContent = displayName.charAt(0).toUpperCase();
                
                console.log("Llamando a initChat desde auth.js");

                if (typeof window.initChat === 'function') {
                    window.initChat(user.uid, displayName);
                } else if (typeof initChat === 'function') {
                    initChat(user.uid, displayName);
                } else {
                    console.error("La función initChat no está disponible");
                }
            })
            .catch(error => {
                console.error("Error al obtener datos del usuario:", error);
            });
    } else {
        authScreen.style.display = 'flex';
        chatScreen.style.display = 'none';
        
        loginForm.reset();
        registerForm.reset();
        loginError.textContent = '';
        registerError.textContent = '';
    }
});