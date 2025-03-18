document.addEventListener('DOMContentLoaded', function() {
    const menuToggleBtn = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const messagesContainer = document.getElementById('messages-container');
    const chatArea = document.querySelector('.chat-area');
    const messageForm = document.querySelector('.message-form');
    
    function toggleSidebar() {
        sidebar.classList.toggle('active');
        if (sidebarOverlay) {
            sidebarOverlay.classList.toggle('active');
        }
    }
    
    function closeSidebar() {
        sidebar.classList.remove('active');
        if (sidebarOverlay) {
            sidebarOverlay.classList.remove('active');
        }
    }
    
    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', toggleSidebar);
    }
    
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeSidebar);
    }
    
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(item => {
        item.addEventListener('click', function() {
            if (sidebar.classList.contains('active')) {
                closeSidebar();
            }
        });
    });
    
    function isMobileView() {
        return window.innerWidth <= 768;
    }

    function adjustLayout() {
        if (!messagesContainer) return;

        const chatHeader = document.querySelector('.chat-header');
        const messageFormHeight = messageForm ? messageForm.offsetHeight : 0;
        const headerHeight = chatHeader ? chatHeader.offsetHeight : 0;
        
        if (isMobileView()) {
            const viewportHeight = window.visualViewport ? 
                window.visualViewport.height : 
                window.innerHeight;

            if (chatArea) {
                chatArea.style.height = `${viewportHeight}px`;
                chatArea.style.position = 'fixed';
                chatArea.style.top = '0';
                chatArea.style.left = '0';
                chatArea.style.right = '0';
                chatArea.style.bottom = '0';
                chatArea.style.width = '100%';
            }
            
            const safetyMargin = 20;
            const availableHeight = viewportHeight - headerHeight - messageFormHeight - safetyMargin;
            
            messagesContainer.style.height = `${availableHeight}px`;
            messagesContainer.style.maxHeight = `${availableHeight}px`;
            
            if (messageForm) {
                messageForm.style.position = 'fixed';
                messageForm.style.bottom = '0';
                messageForm.style.width = '100%';
                messageForm.style.left = '0';
                messageForm.style.zIndex = '5';
                messageForm.style.backgroundColor = '#2a2a2a';
                messageForm.style.boxShadow = '0 -2px 10px rgba(0, 0, 0, 0.4)';
            }
        } else {
            if (chatArea) {
                chatArea.style.height = '';
                chatArea.style.position = '';
                chatArea.style.top = '';
                chatArea.style.left = '';
                chatArea.style.right = '';
                chatArea.style.bottom = '';
                chatArea.style.width = '';
            }
            
            messagesContainer.style.height = '';
            messagesContainer.style.maxHeight = '';
            messagesContainer.style.flex = '1';
            
            if (messageForm) {
                messageForm.style.position = 'relative';
                messageForm.style.bottom = '';
                messageForm.style.width = '';
                messageForm.style.left = '';
                messageForm.style.zIndex = '';
                messageForm.style.backgroundColor = '';
                messageForm.style.boxShadow = '';
            }
        }
        
        scrollToLatestMessage(false);
    }
    
    function scrollToLatestMessage(smooth = true) {
        if (!messagesContainer) return;
        
        if (!messagesContainer.lastElementChild) {
            return;
        }
        
        requestAnimationFrame(() => {
            const lastMessage = messagesContainer.lastElementChild;
            if (!lastMessage) return;
            
            const lastMessageRect = lastMessage.getBoundingClientRect();
            
            const containerRect = messagesContainer.getBoundingClientRect();
            const isVisible = lastMessageRect.bottom <= containerRect.bottom;
            
            if (!isVisible || smooth) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 100);
            }
        });
    }
    
    const messagesObserver = new MutationObserver(function(mutations) {
        const hasNewMessages = mutations.some(mutation => 
            mutation.type === 'childList' && mutation.addedNodes.length > 0);
        
        if (hasNewMessages) {
            scrollToLatestMessage();
            
            if (isMobileView()) {
                adjustLayout();
            }
        }
    });

    if (messagesContainer) {
        messagesObserver.observe(messagesContainer, { 
            childList: true
        });
    }
    
    adjustLayout();
    
    window.addEventListener('resize', function() {
        adjustLayout();
        
        if (!isMobileView()) {
            closeSidebar();
        }
    });
    
    window.addEventListener('orientationchange', function() {
        setTimeout(adjustLayout, 300);
    });
    
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function() {
            if (isMobileView()) {
                adjustLayout();
                setTimeout(scrollToLatestMessage, 300);
            }
        });
        
        window.visualViewport.addEventListener('scroll', function() {
            if (isMobileView()) {
                adjustLayout();
            }
        });
    }
    
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            if (isMobileView()) {
                document.documentElement.style.fontSize = '16px';
                setTimeout(() => {
                    adjustLayout();
                    scrollToLatestMessage();
                }, 300);
            }
        });
        
        input.addEventListener('blur', function() {
            if (isMobileView()) {
                document.documentElement.style.fontSize = '';
                setTimeout(() => {
                    adjustLayout();
                    scrollToLatestMessage();
                }, 300);
            }
        });
    });
    
    document.addEventListener('scroll', function() {
        if (isMobileView()) {
            document.body.scrollTop = 0;
            document.documentElement.scrollTop = 0;
        }
    });
    
    if (chatArea) {
        chatArea.addEventListener('click', function(event) {
            if ((event.target === chatArea || event.target === messagesContainer) && 
                sidebar.classList.contains('active')) {
                closeSidebar();
            }
        });
    }
    
    window.addEventListener('load', function() {
        setTimeout(() => {
            adjustLayout();
            scrollToLatestMessage();
        }, 500);
    });
    
    document.addEventListener('touchmove', function(event) {
        if (isMobileView() && event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });
    
    const chatListObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                const chatItems = document.querySelectorAll('.chat-item');
                chatItems.forEach(item => {
                    const hasListener = item.getAttribute('data-listener-added');
                    if (!hasListener) {
                        item.addEventListener('click', function() {
                            if (sidebar.classList.contains('active')) {
                                closeSidebar();
                            }
                        });
                        item.setAttribute('data-listener-added', 'true');
                    }
                });
            }
        });
    });

    const chatList = document.querySelector('.chat-list');
    if (chatList) {
        chatList.addEventListener('click', function(event) {
            const chatItem = event.target.closest('.chat-item');
        
            if (chatItem && 
                !event.target.closest('.delete-chat-btn') && 
                !event.target.closest('.info-chat-btn')) {
                
                if (sidebar.classList.contains('active')) {
                    closeSidebar();
                }
            }
        });
    }
    
    const sendButton = messageForm ? messageForm.querySelector('button[type="submit"]') : null;
    if (sendButton) {
        sendButton.addEventListener('click', function() {
            setTimeout(() => {
                scrollToLatestMessage();
            }, 300);
        });
    }
    
    if (isMobileView() && messageForm) {
        const messageInput = messageForm.querySelector('input');
        if (messageInput) {
            messageInput.addEventListener('focus', function() {
                setTimeout(() => {
                    scrollToLatestMessage();
                    if (messageInput) {
                        messageInput.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    }
                }, 500);
            });
        }
    }
});