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

function showNoChatSelected() {
    if (!messagesContainer) return;

    if (currentChatName) {
        currentChatName.textContent = "Selecciona una conversación";
    }
    
    messagesContainer.innerHTML = '';
    
    const noChatDiv = document.createElement('div');
    noChatDiv.className = 'no-chat-selected';
    
    const noChatMessage = document.createElement('p');
    noChatMessage.textContent = 'Selecciona una conversación para comenzar a chatear';
    noChatDiv.appendChild(noChatMessage);
    
    messagesContainer.appendChild(noChatDiv);

    if (messageForm) {
        if (messageInput) {
            messageInput.disabled = true;
        }
        
        const sendButton = messageForm.querySelector('button[type="submit"]');
        if (sendButton) {
            sendButton.disabled = true;
        }
    }
}

function initChat(userId, displayName) {
    console.log(`Inicializando chat para: ${displayName} (${userId})`);

    cleanupEverything();
    
    currentUserId = userId;
    currentUserName = displayName;

    loadReadStatus();
    
    setupUIListeners();
    setupChatListListener();

    showNoChatSelected();
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

    showNoChatSelected();
    
    debugLog("FIN reseteo completo de Firebase");
}

function toggleModal(modal, show) {
    if (!modal) return;
    
    if (show) {
        modal.style.display = 'flex'; // Usamos flex en lugar de block
        
        // Añadimos clase para la animación de entrada
        modal.classList.add('modal-active');
        
        // Bloqueamos el scroll del body
        document.body.style.overflow = 'hidden';
        
        // Aseguramos que el contenido del modal esté centrado verticalmente
        setTimeout(() => {
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                // Si el contenido es más alto que la ventana, ajustamos
                if (modalContent.offsetHeight > window.innerHeight * 0.9) {
                    modalContent.style.alignSelf = 'flex-start';
                    modalContent.style.marginTop = '5vh';
                    modalContent.style.marginBottom = '5vh';
                } else {
                    modalContent.style.alignSelf = 'center';
                    modalContent.style.margin = '0';
                }
            }
        }, 10);
    } else {
        // Animación de salida
        modal.classList.remove('modal-active');
        
        // Pequeño retraso para permitir que termine la animación
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 300);
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
                
                if (!currentChatId) {
                    showNoChatSelected();
                }
                
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
            
            if (!currentChatId) {
                showNoChatSelected();
            }
        } catch (error) {
            console.error("Error en el listener de lista de chats:", error);
            
            if (!currentChatId) {
                showNoChatSelected();
            }
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

function calculateUnreadMessages(chatId, messages) {
    if (!chatId || !messages || !currentUserId) return 0;
    
    const lastReadTime = lastReadMessages[chatId] || 0;
    
    return messages.filter(msg => {
        return msg.message.senderId !== currentUserId && 
               msg.message.timestamp > lastReadTime;
    }).length;
}

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
        // Añadimos un indicador de carga mientras obtenemos los datos
        document.getElementById('info-chat-creator').innerHTML = '<span class="loading-indicator">Cargando...</span>';
        
        const creatorSnapshot = await database.ref(`users/${chatData.createdBy}`).once('value');
        const creatorData = creatorSnapshot.val() || {};
        document.getElementById('info-chat-creator').textContent = creatorData.name || 'Usuario desconocido';
    } catch (error) {
        console.error('Error al obtener datos del creador:', error);
        document.getElementById('info-chat-creator').textContent = 'No disponible';
    }
    
    // Mostramos indicadores de carga mientras cargamos los datos
    document.getElementById('participants-list').innerHTML = '<li class="loading-item">Cargando participantes...</li>';
    document.getElementById('add-user-selection').innerHTML = '<p class="loading-text">Cargando usuarios disponibles...</p>';
    
    toggleModal(chatInfoModal, true);
    
    // Cargamos los datos después de mostrar el modal para una mejor experiencia
    loadChatParticipants(chatId);
    loadAvailableUsersForChat(chatId);
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
    userSelectionDiv.innerHTML = '<p class="loading-text">Cargando usuarios disponibles...</p>';
    
    try {
        // Usamos Promise.all con await para cargar los datos en paralelo
        const [usersSnapshot, participantsSnapshot] = await Promise.all([
            database.ref('users').once('value'),
            database.ref(`chatParticipants/${chatId}`).once('value')
        ]);
        
        const users = usersSnapshot.val() || {};
        const participants = participantsSnapshot.val() || {};
        
        const availableUsers = Object.keys(users).filter(userId => !participants[userId]);

        if (availableUsers.length === 0) {
            userSelectionDiv.innerHTML = '<p class="no-users-message">No hay más usuarios disponibles para añadir</p>';
            addUserForm.querySelector('button').disabled = true;
            return;
        }
        
        userSelectionDiv.innerHTML = '<p class="selection-header">Selecciona usuarios para añadir:</p>';
        addUserForm.querySelector('button').disabled = false;
        
        // Crear un fragmento para mejorar rendimiento al agregar muchos elementos
        const fragment = document.createDocumentFragment();
        
        availableUsers.forEach(userId => {
            const user = users[userId];
            const userCheckbox = document.createElement('div');
            userCheckbox.className = 'user-checkbox';
            
            // Mejoramos el formato para mostrar mejor los usuarios
            userCheckbox.innerHTML = `
                <label>
                    <input type="checkbox" value="${userId}">
                    <div class="user-info-container">
                        <div class="user-name">${user.name}</div>
                        <div class="user-email">${user.email || 'Sin email'}</div>
                    </div>
                </label>
            `;
            fragment.appendChild(userCheckbox);
        });
        
        userSelectionDiv.appendChild(fragment);
        
        // Agregamos animación para que aparezcan de forma escalonada
        const checkboxes = userSelectionDiv.querySelectorAll('.user-checkbox');
        checkboxes.forEach((checkbox, index) => {
            checkbox.style.animationDelay = `${index * 0.05}s`;
            checkbox.classList.add('fade-in');
        });
    } catch (error) {
        console.error('Error al cargar usuarios disponibles:', error);
        userSelectionDiv.innerHTML = '<p class="error-message">Error al cargar usuarios disponibles</p>';
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
            
            showNoChatSelected();
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