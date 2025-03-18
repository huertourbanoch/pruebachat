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

let lastReadMessages = {};
let unreadCounts = {};
let chatMessageListeners = {};

let typingTimeout = null;
let usersTyping = {};
const TYPING_TIMEOUT = 4000;

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

function debugLog(message) {
  if (!debugMode) return;
  
  console.log(`[DEBUG] ${message}`);
  
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

    cleanupEverything();
    
    currentUserId = userId;
    currentUserName = displayName;

    loadReadStatus();
    
    setupUIListeners();
    setupChatListListener();
}

function cleanupEverything() {
    console.log("Limpiando estado anterior del chat");
    
    if (database && database.ref) {
        database.ref().off();
    }
    
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

    if (currentChatId && currentUserId) {
            database.ref(`typingStatus/${currentChatId}/${currentUserId}`).remove();
        }
        usersTyping = {};
    }
    
    Object.keys(chatMessageListeners).forEach(chatId => {
        database.ref(`messages/${chatId}`).off('child_added', chatMessageListeners[chatId]);
    });
    chatMessageListeners = {};
    
    messagesListener = null;
    userChatsListener = null;
    currentMessagesRef = null;
    currentChatsRef = null;
    currentListeningChatId = null;
    previousListeningChatId = null;
    
    lastRenderedMessages = new Set();
    renderPending = false;
    pendingMessages = [];
    
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

function setupUIListeners() {
    newChatBtn.removeEventListener('click', () => toggleModal(newChatModal, true));
    closeModal.removeEventListener('click', () => toggleModal(newChatModal, false));
    chatInfoModalClose.removeEventListener('click', () => toggleModal(chatInfoModal, false));
    newChatForm.removeEventListener('submit', handleNewChatSubmit);
    messageForm.removeEventListener('submit', handleMessageSubmit);
    addUserForm.removeEventListener('submit', handleAddUserSubmit);
    
    newChatBtn.addEventListener('click', () => {
        toggleModal(newChatModal, true);
        loadUsersForNewChat();
    });
    
    closeModal.addEventListener('click', () => toggleModal(newChatModal, false));
    chatInfoModalClose.addEventListener('click', () => toggleModal(chatInfoModal, false));
    
    newChatForm.addEventListener('submit', handleNewChatSubmit);
    messageForm.addEventListener('submit', handleMessageSubmit);
    addUserForm.addEventListener('submit', handleAddUserSubmit);
    
    // Añadir aquí el listener para detectar cuando el usuario está escribiendo
    messageInput.addEventListener('input', function() {
        if (!currentChatId) return;
        
        updateTypingStatus(true);
        
        // Limpiar timeout anterior si existe
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }
        
        // Configurar nuevo timeout para borrar el estado después de 4 segundos
        typingTimeout = setTimeout(() => {
            updateTypingStatus(false);
        }, TYPING_TIMEOUT);
    });

    window.addEventListener('click', (e) => {
        if (e.target === newChatModal) {
            toggleModal(newChatModal, false);
        }
        if (e.target === chatInfoModal) {
            toggleModal(chatInfoModal, false);
        }
    });
}

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

function handleMessageSubmit(e) {
    e.preventDefault();
    
    debugLog(`INICIO handleMessageSubmit`);

    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
    updateTypingStatus(false);
    
    if (!currentChatId || !messageInput.value.trim()) {
        debugLog(`No hay chat seleccionado o mensaje vacío`);
        return;
    }
    
    const messageText = messageInput.value.trim();
    messageInput.value = '';
    
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
    
    Object.keys(chatMessageListeners).forEach(chatId => {
        database.ref(`messages/${chatId}`).off('child_added', chatMessageListeners[chatId]);
        delete chatMessageListeners[chatId];
    });
    
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
                        
                        setupChatMessageListener(chatId);
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

function setupMessagesListener(chatId) {
    console.log(`Configurando listener para mensajes del chat: ${chatId}`);
    
    previousListeningChatId = currentListeningChatId;
    
    if (currentListeningChatId === chatId && messagesListener) {
        console.log(`Ya estamos escuchando este chat, no es necesario reconfigurarlo`);
        return;
    }
    
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
    
    if (currentListeningChatId !== chatId) {
        lastRenderedMessages = new Set();
    }

    currentListeningChatId = chatId;
    
    currentMessagesRef = database.ref(`messages/${chatId}`);

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
            
            if (currentChatId === chatId) {
                markChatAsRead(chatId);
            } 
            else {
                const unreadCount = calculateUnreadMessages(chatId, messagesArray);
                unreadCounts[chatId] = unreadCount;
                updateUnreadBadge(chatId, unreadCount);
            }
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

function setupChatMessageListener(chatId) {
    if (chatMessageListeners[chatId]) {
        console.log(`Eliminando listener anterior para mensajes de ${chatId}`);
        database.ref(`messages/${chatId}`).off('child_added', chatMessageListeners[chatId]);
        delete chatMessageListeners[chatId];
    }
    
    console.log(`Configurando listener en tiempo real para chat ${chatId}`);
    
    let lastKnownTimestamp = Date.now();
    
    chatMessageListeners[chatId] = function(snapshot) {
        const message = snapshot.val();
        
        if (!message || !message.timestamp) {
            console.log('Mensaje ignorado: datos incompletos', message);
            return;
        }
        
        console.log(`Mensaje recibido en chat ${chatId}:`, 
            message.senderId === currentUserId ? 'Tu mensaje' : 'Mensaje de otro usuario',
            'timestamp:', message.timestamp);
        
        if (chatId !== currentChatId && message.senderId !== currentUserId) {
            const lastReadTime = lastReadMessages[chatId] || 0;
            
            if (message.timestamp > lastReadTime) {
                console.log(`Mensaje no leído detectado en chat ${chatId}`);
                
                unreadCounts[chatId] = (unreadCounts[chatId] || 0) + 1;
                
                updateUnreadBadge(chatId, unreadCounts[chatId]);
                
                saveReadStatus();
            }
        }
    };
    
    database.ref(`messages/${chatId}`)
        .orderByChild('timestamp')
        .startAt(lastKnownTimestamp)
        .on('child_added', chatMessageListeners[chatId]);
}

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
 * Marca todos los mensajes de un chat como leídos
 * @param {string} chatId - ID del chat
 */
function markChatAsRead(chatId) {
    if (!chatId) return;
    
    console.log(`Marcando chat ${chatId} como leído`);
    
    const timestamp = Date.now();
    lastReadMessages[chatId] = timestamp;
    
    unreadCounts[chatId] = 0;
    
    updateUnreadBadge(chatId, 0);
    
    saveReadStatus();
    
    console.log(`Chat ${chatId} marcado como leído en timestamp ${timestamp}`);
}

/**
 * Guarda el estado de lectura en localStorage
 */
function saveReadStatus() {
    if (!currentUserId) return;
    
    localStorage.setItem(`readStatus_${currentUserId}`, JSON.stringify(lastReadMessages));
}

function loadReadStatus() {
    if (!currentUserId) return;
    
    const savedStatus = localStorage.getItem(`readStatus_${currentUserId}`);
    if (savedStatus) {
        lastReadMessages = JSON.parse(savedStatus);
    }
}

/**
 * Calcula el número de mensajes no leídos para un chat
 * @param {string} chatId - ID del chat
 * @param {Array} messages - Array de mensajes
 * @returns {number} - Número de mensajes no leídos
 */
function calculateUnreadMessages(chatId, messages) {
    if (!chatId || !messages || !currentUserId) return 0;
    
    const lastReadTime = lastReadMessages[chatId] || 0;
    
    return messages.filter(msg => {
        return msg.message.senderId !== currentUserId && 
               msg.message.timestamp > lastReadTime;
    }).length;
}

/**
 * Actualiza el badge visual de mensajes no leídos
 * @param {string} chatId - ID del chat
 * @param {number} count - Número de mensajes no leídos
 */
function updateUnreadBadge(chatId, count) {
    console.log(`Actualizando badge para chat ${chatId}: ${count} mensajes no leídos`);
    
    const chatItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
    if (!chatItem) {
        console.log(`No se encontró elemento visual para chat ${chatId}`);
        return;
    }
    
    const existingBadge = chatItem.querySelector('.unread-badge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
    if (count > 0) {
        const nameElement = chatItem.querySelector('.chat-name-container');
        if (nameElement) {
            const badge = document.createElement('div');
            badge.className = 'unread-badge';
            badge.textContent = count > 99 ? '99+' : count;
            nameElement.appendChild(badge);
            console.log(`Badge creado: ${count} mensajes`);
        } else {
            console.log('No se encontró contenedor para el badge');
        }
    }
}

function renderChatList(chatsData) {
    console.log(`Renderizando ${chatsData.size} chats`);
    
    chatList.innerHTML = '';
    
    const sortedChats = Array.from(chatsData.entries())
        .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
    
    const chatPromises = sortedChats.map(async ([chatId, chatData]) => {
        try {
            const messagesSnapshot = await database.ref(`messages/${chatId}`).once('value');
            const messages = messagesSnapshot.val() || {};
            
            const messagesArray = Object.keys(messages)
                .sort((a, b) => messages[a].timestamp - messages[b].timestamp)
                .map(msgId => ({ id: msgId, message: messages[msgId] }));
            
            const unreadCount = calculateUnreadMessages(chatId, messagesArray);
            unreadCounts[chatId] = unreadCount;
            
            return {
                chatId,
                chatData,
                unreadCount
            };
        } catch (error) {
            console.error(`Error al obtener mensajes para ${chatId}:`, error);
            return {
                chatId,
                chatData,
                unreadCount: 0
            };
        }
    });
    
    Promise.all(chatPromises).then(chatsWithUnreadCounts => {
        chatsWithUnreadCounts.forEach(({chatId, chatData, unreadCount}) => {
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
                    <div class="chat-name-container">
                        <h3>${chatData.name}</h3>
                        ${unreadCount > 0 ? `<div class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</div>` : ''}
                    </div>
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

                markChatAsRead(chatId);
            });
            
            chatList.appendChild(chatItem);
        });
    });
}

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
    setupTypingListeners(chatId);
    
    markChatAsRead(chatId);
    
    debugLog(`FIN selectChat: ${chatName} (${chatId})`);
}

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

function confirmDeleteChat(chatId, chatName) {
    console.log(`Confirmando eliminación del chat: ${chatName} (${chatId})`);
    
    const confirmed = confirm(`¿Estás seguro de que quieres eliminar la conversación "${chatName}"? Esta acción no se puede deshacer.`);
    
    if (confirmed) {
        deleteChat(chatId);
    }
}

/**
 * Actualiza el estado de escritura del usuario actual
 * @param {boolean} isTyping - true si está escribiendo, false en caso contrario
 */
function updateTypingStatus(isTyping) {
    if (!currentChatId || !currentUserId) return;
    
    const typingRef = database.ref(`typingStatus/${currentChatId}/${currentUserId}`);
    
    if (isTyping) {
        typingRef.set({
            isTyping: true,
            userName: currentUserName,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    } else {
        typingRef.remove();
    }
}

/**
 * Muestra el indicador de escritura
 * @param {string} userName - Nombre del usuario que está escribiendo
 */
function showTypingIndicator(userName) {
    const typingIndicator = document.getElementById('typing-indicator');
    if (!typingIndicator) return;
    
    typingIndicator.setAttribute('title', `${userName} está escribiendo...`);
    typingIndicator.style.display = 'flex';
    
    // Asegurar que sea visible si hay scroll
    ensureScrollToBottom();
}

/**
 * Oculta el indicador de escritura
 */
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (!typingIndicator) return;
    
    typingIndicator.style.display = 'none';
}

/**
 * Configura los listeners para detectar cuando otros usuarios están escribiendo
 * @param {string} chatId - ID del chat
 */
function setupTypingListeners(chatId) {
    if (!chatId) return;
    
    // Limpiamos listeners anteriores si existen
    database.ref(`typingStatus/${chatId}`).off();
    
    // Escuchar cambios en el estado de escritura
    database.ref(`typingStatus/${chatId}`).on('child_added', snapshot => {
        const userId = snapshot.key;
        const typingData = snapshot.val();
        
        if (userId === currentUserId) return; // Ignoramos nuestro propio estado
        
        usersTyping[userId] = typingData;
        
        // Mostramos el indicador con el nombre del primer usuario encontrado
        // Esto se podría mejorar para mostrar varios usuarios si fuera necesario
        if (Object.keys(usersTyping).length > 0) {
            const firstUser = Object.values(usersTyping)[0];
            showTypingIndicator(firstUser.userName);
        }
    });
    
    database.ref(`typingStatus/${chatId}`).on('child_removed', snapshot => {
        const userId = snapshot.key;
        
        if (userId === currentUserId) return; // Ignoramos nuestro propio estado
        
        delete usersTyping[userId];
        
        if (Object.keys(usersTyping).length === 0) {
            hideTypingIndicator();
        } else {
            // Si todavía hay alguien escribiendo, mostrar su nombre
            const firstUser = Object.values(usersTyping)[0];
            showTypingIndicator(firstUser.userName);
        }
    });
}

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

window.addEventListener('beforeunload', function() {
    cleanupEverything();
});

window.initChat = initChat;