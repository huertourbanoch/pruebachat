let currentUserId = null;
let currentUserName = null;
let currentChatId = null;

let currentMessagesRef = null;
let currentChatsRef = null;
let currentListeningChatId = null;
let previousListeningChatId = null;

let userChatsListener = null;
let messagesListener = null;

let debugMode = false;

let lastRenderedMessages = new Set();
let renderPending = false;
let pendingMessages = [];

const chatList = document.getElementById('chat-list');
const newChatBtn = document.getElementById('new-chat-btn');
const newChatModal = document.getElementById('new-chat-modal');
const newChatForm = document.getElementById('new-chat-form');
const closeModal = document.querySelector('#new-chat-modal .close');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const currentChatName = document.getElementById('current-chat-name');

const chatInfoModal = document.getElementById('chat-info-modal');
const chatInfoModalClose = document.querySelector('#chat-info-modal .close');
const addUserForm = document.getElementById('add-user-form');

// Función de depuración con stack trace
function debugLog(message) {
  if (!debugMode) return;
  
  console.log(`[DEBUG] ${message}`);
  
  // Capturar y mostrar la pila de llamadas
  try {
    throw new Error("Stack trace");
  } catch (e) {
    console.log(e.stack.split("\n").slice(2, 5).join("\n"));
  }
}

/**
 * Inicializa el chat para el usuario actual
 * @param {string} userId - ID del usuario
 * @param {string} displayName - Nombre del usuario
 */
function initChat(userId, displayName) {
    console.log(`Inicializando chat para: ${displayName} (${userId})`);
    
    // Hacer un reset completo primero
    cleanupEverything();
    
    currentUserId = userId;
    currentUserName = displayName;
    
    setupUIListeners();
    setupChatListListener();
}

/**
 * Limpia todos los listeners de Firebase y reinicia el estado de la aplicación
 */
function cleanupEverything() {
    console.log("Limpiando estado anterior del chat");
    
    // Limpiar todos los listeners de Firebase
    if (database && database.ref) {
        database.ref().off();
    }
    
    // Resetear referencias y listeners
    if (userChatsListener) {
        if (currentChatsRef) {
            currentChatsRef.off('value', userChatsListener);
        }
        
        if (currentUserId) {
            database.ref(`userChats/${currentUserId}`).off();
        }
    }
    
    if (messagesListener) {
        if (currentMessagesRef) {
            currentMessagesRef.off('value', messagesListener);
        }
        
        if (currentListeningChatId) {
            database.ref(`messages/${currentListeningChatId}`).off();
        }
    }
    
    // Resetear variables
    messagesListener = null;
    userChatsListener = null;
    currentMessagesRef = null;
    currentChatsRef = null;
    currentListeningChatId = null;
    previousListeningChatId = null;
    
    lastRenderedMessages = new Set();
    renderPending = false;
    pendingMessages = [];
    
    // Limpiar UI
    chatList.innerHTML = '';
    messagesContainer.innerHTML = '';
    currentChatName.textContent = '';
    
    currentChatId = null;

    messageInput.disabled = true;
    messageForm.querySelector('button').disabled = true;
    
    debugLog("FIN reseteo completo de Firebase");
}

/**
 * Gestiona la visualización y ocultación de modales
 * @param {HTMLElement} modal - El modal a mostrar/ocultar
 * @param {boolean} show - true para mostrar, false para ocultar
 */
function toggleModal(modal, show) {
    if (modal) {
        modal.style.display = show ? 'block' : 'none';
    }
}

/**
 * Configura todos los listeners de eventos de la UI
 */
function setupUIListeners() {
    // Eliminar listeners existentes primero para evitar duplicados
    newChatBtn.removeEventListener('click', () => toggleModal(newChatModal, true));
    closeModal.removeEventListener('click', () => toggleModal(newChatModal, false));
    chatInfoModalClose.removeEventListener('click', () => toggleModal(chatInfoModal, false));
    newChatForm.removeEventListener('submit', handleNewChatSubmit);
    messageForm.removeEventListener('submit', handleMessageSubmit);
    addUserForm.removeEventListener('submit', handleAddUserSubmit);
    
    // Configurar nuevos listeners
    newChatBtn.addEventListener('click', () => {
        toggleModal(newChatModal, true);
        loadUsersForNewChat();
    });
    
    closeModal.addEventListener('click', () => toggleModal(newChatModal, false));
    chatInfoModalClose.addEventListener('click', () => toggleModal(chatInfoModal, false));
    
    newChatForm.addEventListener('submit', handleNewChatSubmit);
    messageForm.addEventListener('submit', handleMessageSubmit);
    addUserForm.addEventListener('submit', handleAddUserSubmit);

    // Listener para cerrar modales al hacer clic fuera de ellos
    window.addEventListener('click', (e) => {
        if (e.target === newChatModal) {
            toggleModal(newChatModal, false);
        }
        if (e.target === chatInfoModal) {
            toggleModal(chatInfoModal, false);
        }
    });
}

/**
 * Maneja el envío del formulario para crear un nuevo chat
 */
function handleNewChatSubmit(e) {
    e.preventDefault();
    
    const chatName = document.getElementById('chat-name').value;
    const selectedUsers = Array.from(document.querySelectorAll('#user-selection input:checked'))
        .map(input => input.value);
    
    if (selectedUsers.length === 0) {
        alert('Por favor, selecciona al menos un usuario para chatear');
        return;
    }
    
    const submitButton = newChatForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    
    createNewChat(chatName, selectedUsers)
        .then(() => {
            newChatForm.reset();
            toggleModal(newChatModal, false);
            submitButton.disabled = false;
        })
        .catch((error) => {
            console.error('Error al crear chat:', error);
            submitButton.disabled = false;
        });
}

/**
 * Maneja el envío del formulario para añadir usuarios a un chat existente
 */
function handleAddUserSubmit(e) {
    e.preventDefault();
    
    const selectedUsers = Array.from(document.querySelectorAll('#add-user-selection input:checked'))
        .map(input => input.value);
        
    if (selectedUsers.length === 0) {
        alert('Por favor, selecciona al menos un usuario para añadir');
        return;
    }
    
    const chatId = addUserForm.dataset.chatId;
    addUsersToChat(chatId, selectedUsers);
}

/**
 * Maneja el envío de un nuevo mensaje
 */
function handleMessageSubmit(e) {
    e.preventDefault();
    
    debugLog(`INICIO handleMessageSubmit`);
    
    if (!currentChatId || !messageInput.value.trim()) {
        debugLog(`No hay chat seleccionado o mensaje vacío`);
        return;
    }
    
    const messageText = messageInput.value.trim();
    messageInput.value = '';
    
    // Prevenir doble-envío
    const submitButton = messageForm.querySelector('button');
    submitButton.disabled = true;
    
    debugLog(`Enviando mensaje: "${messageText.substring(0, 20)}..."`);
    
    database.ref(`messages/${currentChatId}`).push({
        text: messageText,
        senderId: currentUserId,
        senderName: currentUserName,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    })
    .then(() => {
        debugLog(`Mensaje enviado con éxito`);
        console.log("Mensaje enviado con éxito");
        
        setTimeout(() => {
            submitButton.disabled = false;
        }, 500);
    })
    .catch((error) => {
        console.error('Error al enviar mensaje:', error);
        debugLog(`Error al enviar mensaje: ${error.message}`);
        submitButton.disabled = false;
    });
    
    debugLog(`FIN handleMessageSubmit`);
}

/**
 * Crea un nuevo chat con los usuarios seleccionados
 */
async function createNewChat(chatName, selectedUsers) {
    console.log(`Creando nuevo chat: ${chatName} con ${selectedUsers.length} usuarios`);
    
    try {
        const newChatRef = database.ref('chats').push();
        const chatId = newChatRef.key;
        
        await newChatRef.set({
            name: chatName,
            createdBy: currentUserId,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        const updates = {};
        
        updates[`chatParticipants/${chatId}/${currentUserId}`] = true;
        updates[`userChats/${currentUserId}/${chatId}`] = true;
        
        selectedUsers.forEach(userId => {
            updates[`chatParticipants/${chatId}/${userId}`] = true;
            updates[`userChats/${userId}/${chatId}`] = true;
        });
        
        await database.ref().update(updates);
        console.log(`Chat creado exitosamente: ${chatId}`);
        
    } catch (error) {
        console.error('Error en createNewChat:', error);
        throw error;
    }
}

/**
 * Carga los usuarios disponibles para un nuevo chat
 */
function loadUsersForNewChat() {
    const userSelectionDiv = document.getElementById('user-selection') || document.createElement('div');
    userSelectionDiv.id = 'user-selection';
    userSelectionDiv.innerHTML = '<p>Cargando usuarios...</p>';
    
    if (!document.getElementById('user-selection')) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.appendChild(userSelectionDiv);
        
        newChatForm.insertBefore(formGroup, newChatForm.querySelector('button'));
    }
    
    database.ref('users').once('value')
        .then((snapshot) => {
            const users = snapshot.val() || {};
            userSelectionDiv.innerHTML = '<p>Selecciona usuarios para chatear:</p>';
            
            let usersAdded = 0;
            
            Object.keys(users).forEach((userId) => {
                if (userId !== currentUserId) {
                    const user = users[userId];
                    const userCheckbox = document.createElement('div');
                    userCheckbox.className = 'user-checkbox';
                    userCheckbox.innerHTML = `
                        <label>
                            <input type="checkbox" value="${userId}">
                            ${user.name} (${user.email})
                        </label>
                    `;
                    userSelectionDiv.appendChild(userCheckbox);
                    usersAdded++;
                }
            });
            
            if (usersAdded === 0) {
                userSelectionDiv.innerHTML = '<p>No hay otros usuarios disponibles</p>';
            }
        })
        .catch(error => {
            console.error("Error al cargar usuarios:", error);
            userSelectionDiv.innerHTML = '<p>Error al cargar usuarios</p>';
        });
}

/**
 * Configura el listener para la lista de chats del usuario
 */
function setupChatListListener() {
    console.log("Configurando listener para lista de chats");
    
    if (userChatsListener) {
        if (currentChatsRef) {
            console.log(`Desconectando listener de lista de chats para usuario: ${currentUserId}`);
            currentChatsRef.off('value', userChatsListener);
        } else {
            console.log("Intentando desconectar listener de chats usando .ref()");
            database.ref().off('value', userChatsListener);
        }
        userChatsListener = null;
    }
    
    currentChatsRef = database.ref(`userChats/${currentUserId}`);
    
    userChatsListener = currentChatsRef.on('value', async (snapshot) => {
        console.log("Recibida actualización de lista de chats");
        
        try {
            const userChats = snapshot.val() || {};
            
            chatList.innerHTML = '';
            
            if (Object.keys(userChats).length === 0) {
                const noChatItem = document.createElement('div');
                noChatItem.className = 'chat-item';
                noChatItem.innerHTML = '<p>No tienes conversaciones</p>';
                chatList.appendChild(noChatItem);
                return;
            }
            
            const chatsData = new Map();
            
            const chatPromises = Object.keys(userChats).map(async (chatId) => {
                try {
                    const chatSnapshot = await database.ref(`chats/${chatId}`).once('value');
                    const chatData = chatSnapshot.val();
                    
                    if (chatData) {
                        chatsData.set(chatId, chatData);
                    }
                } catch (error) {
                    console.error(`Error al obtener datos del chat ${chatId}:`, error);
                }
            });
            
            await Promise.all(chatPromises);
            
            renderChatList(chatsData);
        } catch (error) {
            console.error("Error en el listener de lista de chats:", error);
        }
    });
}

/**
 * Configura el listener para los mensajes de un chat específico
 */
function setupMessagesListener(chatId) {
    console.log(`Configurando listener para mensajes del chat: ${chatId}`);
    
    previousListeningChatId = currentListeningChatId;
    
    if (currentListeningChatId === chatId && messagesListener) {
        console.log(`Ya estamos escuchando este chat, no es necesario reconfigurarlo`);
        return;
    }
    
    // Eliminar listener anterior si existe
    if (messagesListener) {
        console.log(`Eliminando listener anterior del chat: ${previousListeningChatId}`);
        
        if (currentMessagesRef) {
            try {
                currentMessagesRef.off('value', messagesListener);
            } catch (e) {
                console.error("Error al eliminar listener específico:", e);
            }
        }

        if (previousListeningChatId) {
            try {
                database.ref(`messages/${previousListeningChatId}`).off('value', messagesListener);
            } catch (e) {
                console.error("Error al eliminar listener por chatId:", e);
            }
        }

        if (previousListeningChatId) {
            try {
                database.ref(`messages/${previousListeningChatId}`).off();
                console.log(`Eliminados TODOS los listeners de chat: ${previousListeningChatId}`);
            } catch (e) {
                console.error("Error al eliminar todos los listeners:", e);
            }
        }
        
        messagesListener = null;
        currentMessagesRef = null;
    }
    
    // Resetear el conjunto de mensajes renderizados si cambiamos de chat
    if (currentListeningChatId !== chatId) {
        lastRenderedMessages = new Set();
    }

    currentListeningChatId = chatId;
    
    currentMessagesRef = database.ref(`messages/${chatId}`);
    
    // Control de frecuencia de actualización
    let lastUpdateTime = 0;
    let processingUpdate = false;
    
    messagesListener = currentMessagesRef.on('value', (snapshot) => {
        const now = Date.now();
        
        if (now - lastUpdateTime < 300 && processingUpdate) {
            console.log("Ignorando actualización (demasiado cercana a la anterior)");
            return;
        }
        
        lastUpdateTime = now;
        processingUpdate = true;
        
        console.log("Recibida actualización de mensajes");
        
        const messages = snapshot.val() || {};
        
        if (Object.keys(messages).length === 0) {
            messagesContainer.innerHTML = '';
            const noMessagesEl = document.createElement('div');
            noMessagesEl.className = 'no-messages';
            noMessagesEl.textContent = 'No hay mensajes. ¡Sé el primero en escribir!';
            messagesContainer.appendChild(noMessagesEl);
        } else {
            const messagesArray = Object.keys(messages)
                .sort((a, b) => messages[a].timestamp - messages[b].timestamp)
                .map(msgId => ({ id: msgId, message: messages[msgId] }));
            
            renderMessages(messagesArray);
        }

        setTimeout(() => {
            processingUpdate = false;
        }, 300);
    }, (error) => {
        console.error(`Error en el listener de mensajes: ${error.message}`);
        processingUpdate = false;
    });
    
    console.log(`Nuevo listener configurado exitosamente para chat: ${chatId}`);
}

/**
 * Crea un elemento DOM para un mensaje
 */
function createMessageElement(message, messageId) {
    if (messageId) {
        lastRenderedMessages.add(messageId);
    }
    
    const isCurrentUser = message.senderId === currentUserId;
    
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isCurrentUser ? 'sent' : 'received'}`;
    messageEl.classList.add('new');
    
    if (messageId) {
        messageEl.dataset.messageId = messageId;
    }
    
    const date = new Date(message.timestamp);
    const formattedTime = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    messageEl.innerHTML = `
        <div class="message-bubble">${message.text}</div>
        <div class="message-info">
            ${isCurrentUser ? '' : message.senderName + ' - '}${formattedTime}
        </div>
    `;
    
    setTimeout(() => {
        messageEl.classList.remove('new');
    }, 300);
    
    return messageEl;
}

/**
 * Renderiza un array de mensajes en el contenedor
 */
function renderMessages(messages) {
    if (renderPending) {
        pendingMessages = [...pendingMessages, ...messages];
        return;
    }
    
    renderPending = true;

    requestAnimationFrame(() => {
        messagesContainer.innerHTML = '';
        
        if (messages.length === 0) {
            const noMessagesEl = document.createElement('div');
            noMessagesEl.className = 'no-messages';
            noMessagesEl.textContent = 'No hay mensajes. ¡Sé el primero en escribir!';
            messagesContainer.appendChild(noMessagesEl);
        } else {
            const fragment = document.createDocumentFragment();
            
            messages.forEach((msgData) => {
                const messageEl = createMessageElement(msgData.message, msgData.id);
                fragment.appendChild(messageEl);
            });
            
            messagesContainer.appendChild(fragment);
        }
        
        ensureScrollToBottom();
        
        renderPending = false;
        
        if (pendingMessages.length > 0) {
            const nextBatch = [...pendingMessages];
            pendingMessages = [];
            renderMessages(nextBatch);
        }
    });
}

/**
 * Asegura que el scroll del contenedor de mensajes esté al final
 */
function ensureScrollToBottom() {
    if (!messagesContainer || !messagesContainer.lastElementChild) return;

    setTimeout(() => {
        const scrollPosition = messagesContainer.scrollTop + messagesContainer.clientHeight;
        const scrollThreshold = messagesContainer.scrollHeight - 100;
        
        const lastMessage = messagesContainer.lastElementChild;
        const isOurMessage = lastMessage.classList.contains('sent');
        
        if (scrollPosition >= scrollThreshold || isOurMessage) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            setTimeout(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }, 100);
        }
    }, 50);
}

/**
 * Renderiza la lista de chats del usuario
 */
function renderChatList(chatsData) {
    console.log(`Renderizando ${chatsData.size} chats`);
    
    chatList.innerHTML = '';
    
    const sortedChats = Array.from(chatsData.entries())
        .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    
    sortedChats.forEach(([chatId, chatData]) => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = chatId;
        
        if (currentChatId === chatId) {
            chatItem.classList.add('active');
        }

        const isCreator = chatData.createdBy === currentUserId;
        
        const deleteButton = isCreator ? 
            `<button class="delete-chat-btn" title="Eliminar conversación">×</button>` : '';
            
        const infoButton = `<button class="info-chat-btn" title="Ver información"><i class="fas fa-info-circle"></i></button>`;
        
        chatItem.innerHTML = `
            <div class="chat-header">
                <h3>${chatData.name}</h3>
                <div class="chat-actions">
                    ${infoButton}
                    ${deleteButton}
                </div>
            </div>
            <p>Toca para abrir</p>
        `;
        
        chatItem.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-chat-btn') || 
                e.target.closest('.delete-chat-btn')) {
                e.stopPropagation();
                confirmDeleteChat(chatId, chatData.name);
                return;
            }
            
            if (e.target.classList.contains('info-chat-btn') || 
                e.target.closest('.info-chat-btn')) {
                e.stopPropagation();
                showChatInfo(chatId, chatData);
                return;
            }
            
            selectChat(chatId, chatData.name);
        });
        
        chatList.appendChild(chatItem);
    });
}

/**
 * Selecciona un chat para mostrar sus mensajes
 */
function selectChat(chatId, chatName) {
    debugLog(`INICIO selectChat: ${chatName} (${chatId})`);
    
    if (currentChatId === chatId) {
        debugLog(`Ya estamos en este chat, no hacemos nada`);
        return;
    }

    currentChatId = chatId;
    currentChatName.textContent = chatName;

    document.querySelectorAll('.chat-item').forEach((item) => {
        item.classList.remove('active');
    });
    
    const selectedChat = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
    if (selectedChat) {
        selectedChat.classList.add('active');
    }
    
    messageInput.disabled = false;
    messageForm.querySelector('button').disabled = false;
    messagesContainer.innerHTML = '';
    
    const noChat = document.querySelector('.no-chat-selected');
    if (noChat) {
        noChat.remove();
    }
    
    debugLog(`Llamando a setupMessagesListener desde selectChat`);
    setupMessagesListener(chatId);
    
    debugLog(`FIN selectChat: ${chatName} (${chatId})`);
}

/**
 * Muestra información detallada de un chat
 */
async function showChatInfo(chatId, chatData) {
    console.log(`Mostrando información del chat: ${chatData.name} (${chatId})`);
    
    addUserForm.dataset.chatId = chatId;

    document.getElementById('info-chat-name').textContent = chatData.name;

    let creationDate = 'Desconocida';
    if (chatData.createdAt) {
        const date = new Date(chatData.createdAt);
        creationDate = date.toLocaleString();
    }
    document.getElementById('info-chat-date').textContent = creationDate;
    
    try {
        const creatorSnapshot = await database.ref(`users/${chatData.createdBy}`).once('value');
        const creatorData = creatorSnapshot.val() || {};
        document.getElementById('info-chat-creator').textContent = creatorData.name || 'Usuario desconocido';
    } catch (error) {
        console.error('Error al obtener datos del creador:', error);
        document.getElementById('info-chat-creator').textContent = 'No disponible';
    }
    
    loadChatParticipants(chatId);
    loadAvailableUsersForChat(chatId);

    toggleModal(chatInfoModal, true);
}

/**
 * Carga los participantes de un chat
 */
async function loadChatParticipants(chatId) {
    const participantsList = document.getElementById('participants-list');
    participantsList.innerHTML = '<li>Cargando participantes...</li>';
    
    try {
        const participantsSnapshot = await database.ref(`chatParticipants/${chatId}`).once('value');
        const participants = participantsSnapshot.val() || {};
        
        if (Object.keys(participants).length === 0) {
            participantsList.innerHTML = '<li>No hay participantes</li>';
            return;
        }
        
        const participantPromises = Object.keys(participants).map(async (userId) => {
            const userSnapshot = await database.ref(`users/${userId}`).once('value');
            return {
                id: userId,
                data: userSnapshot.val() || { name: 'Usuario desconocido' }
            };
        });
        
        const participantsData = await Promise.all(participantPromises);
        
        participantsList.innerHTML = '';
        participantsData.forEach(participant => {
            const listItem = document.createElement('li');
            listItem.textContent = participant.data.name;
            
            if (participant.id === currentUserId) {
                listItem.className = 'current-user';
                listItem.textContent += ' (Tú)';
            }
            
            participantsList.appendChild(listItem);
        });
    } catch (error) {
        console.error('Error al cargar participantes:', error);
        participantsList.innerHTML = '<li>Error al cargar participantes</li>';
    }
}

/**
 * Carga usuarios disponibles para añadir a un chat
 */
async function loadAvailableUsersForChat(chatId) {
    const userSelectionDiv = document.getElementById('add-user-selection');
    userSelectionDiv.innerHTML = '<p>Cargando usuarios disponibles...</p>';
    
    try {
        const usersSnapshot = await database.ref('users').once('value');
        const users = usersSnapshot.val() || {};
        
        const participantsSnapshot = await database.ref(`chatParticipants/${chatId}`).once('value');
        const participants = participantsSnapshot.val() || {};
        
        const availableUsers = Object.keys(users).filter(userId => !participants[userId]);

        if (availableUsers.length === 0) {
            userSelectionDiv.innerHTML = '<p>No hay más usuarios disponibles para añadir</p>';
            addUserForm.querySelector('button').disabled = true;
            return;
        }
        
        userSelectionDiv.innerHTML = '<p>Selecciona usuarios para añadir:</p>';
        addUserForm.querySelector('button').disabled = false;
        
        availableUsers.forEach(userId => {
            const user = users[userId];
            const userCheckbox = document.createElement('div');
            userCheckbox.className = 'user-checkbox';
            userCheckbox.innerHTML = `
                <label>
                    <input type="checkbox" value="${userId}">
                    ${user.name} (${user.email || 'Sin email'})
                </label>
            `;
            userSelectionDiv.appendChild(userCheckbox);
        });
    } catch (error) {
        console.error('Error al cargar usuarios disponibles:', error);
        userSelectionDiv.innerHTML = '<p>Error al cargar usuarios disponibles</p>';
    }
}

/**
 * Añade usuarios a un chat existente
 */
async function addUsersToChat(chatId, userIds) {
    console.log(`Añadiendo ${userIds.length} usuarios al chat ${chatId}`);
    
    try {
        const updates = {};

        userIds.forEach(userId => {
            updates[`chatParticipants/${chatId}/${userId}`] = true;
            updates[`userChats/${userId}/${chatId}`] = true;
        });

        await database.ref().update(updates);

        loadChatParticipants(chatId);
        loadAvailableUsersForChat(chatId);
        
        alert('Usuarios añadidos exitosamente');
    } catch (error) {
        console.error('Error al añadir usuarios:', error);
        alert('Error al añadir usuarios. Por favor, inténtalo de nuevo.');
    }
}

/**
 * Confirma la eliminación de un chat
 */
function confirmDeleteChat(chatId, chatName) {
    console.log(`Confirmando eliminación del chat: ${chatName} (${chatId})`);
    
    const confirmed = confirm(`¿Estás seguro de que quieres eliminar la conversación "${chatName}"? Esta acción no se puede deshacer.`);
    
    if (confirmed) {
        deleteChat(chatId);
    }
}

/**
 * Elimina un chat y todas sus referencias
 */
async function deleteChat(chatId) {
    console.log(`Eliminando chat: ${chatId}`);
    
    try {
        const participantsSnapshot = await database.ref(`chatParticipants/${chatId}`).once('value');
        const participants = participantsSnapshot.val() || {};
        
        const updates = {};
        
        Object.keys(participants).forEach(userId => {
            updates[`userChats/${userId}/${chatId}`] = null;
        });
        
        updates[`chats/${chatId}`] = null;
        updates[`chatParticipants/${chatId}`] = null;
        updates[`messages/${chatId}`] = null;
        
        await database.ref().update(updates);
        
        console.log(`Chat ${chatId} eliminado con éxito`);
        
        if (currentChatId === chatId) {
            currentChatId = null;
            currentChatName.textContent = '';
            messagesContainer.innerHTML = '';
            messageInput.disabled = true;
            messageForm.querySelector('button').disabled = true;
            
            const noChat = document.createElement('div');
            noChat.className = 'no-chat-selected';
            noChat.textContent = 'Selecciona un chat para empezar a conversar';
            messagesContainer.appendChild(noChat);
        }
    } catch (error) {
        console.error('Error al eliminar chat:', error);
        alert('Hubo un error al eliminar la conversación. Por favor, inténtalo de nuevo.');
    }
}

// Evento para limpiar todo antes de cerrar la página
window.addEventListener('beforeunload', function() {
    cleanupEverything();
});

// Exponer la función de inicialización al ámbito global
window.initChat = initChat;