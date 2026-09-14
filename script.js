(() => {
  'use strict';

  const STORAGE_KEY = 'rift_conversations_v1';
  const API_ENDPOINT = '/api/chat';

  /** ---------- State ---------- */
  let conversations = [];   // [{ id, title, messages: [{role, content}], createdAt }]
  let activeId = null;
  let isSending = false;
  let pendingDeleteId = null;

  /** ---------- DOM refs ---------- */
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const sidebarOpenBtn = document.getElementById('sidebarOpenBtn');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const chatList = document.getElementById('chatList');
  const chatTitle = document.getElementById('chatTitle');
  const welcome = document.getElementById('welcome');
  const messagesEl = document.getElementById('messages');
  const suggestionGrid = document.getElementById('suggestionGrid');
  const composerInput = document.getElementById('composerInput');
  const sendBtn = document.getElementById('sendBtn');
  const chatArea = document.getElementById('chatArea');

  const modalOverlay = document.getElementById('modalOverlay');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalConfirmBtn = document.getElementById('modalConfirmBtn');

  /** ---------- Persistence ---------- */
  function loadConversations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      conversations = raw ? JSON.parse(raw) : [];
    } catch (e) {
      conversations = [];
    }
  }

  function saveConversations() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (e) {
      // localStorage might be full or unavailable; fail silently
      console.warn('Could not save conversations', e);
    }
  }

  /** ---------- Helpers ---------- */
  function getActiveConversation() {
    return conversations.find(c => c.id === activeId) || null;
  }

  function createConversation() {
    const convo = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      title: 'New chat',
      messages: [],
      createdAt: Date.now()
    };
    conversations.unshift(convo);
    activeId = convo.id;
    saveConversations();
    return convo;
  }

  function deleteConversation(id) {
    conversations = conversations.filter(c => c.id !== id);
    if (activeId === id) {
      activeId = null;
    }
    saveConversations();
    render();
  }

  function titleFromMessage(text) {
    const clean = text.trim().replace(/\s+/g, ' ');
    if (clean.length <= 40) return clean;
    return clean.slice(0, 40).trim() + '…';
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Very small, safe markdown-ish renderer:
   * - fenced code blocks ```lang\ncode```
   * - inline code `code`
   * - **bold**
   * Everything is HTML-escaped first so no injection is possible.
   */
  function renderMarkdownLite(raw) {
    const escaped = escapeHtml(raw);

    // Fenced code blocks first (so their content isn't touched by other rules)
    const codeBlocks = [];
    let withoutFences = escaped.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(code.replace(/\n$/, ''));
      return `@@CODEBLOCK${idx}@@`;
    });

    // Inline code
    withoutFences = withoutFences.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold **text**
    withoutFences = withoutFences.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Restore code blocks as <pre><code>
    withoutFences = withoutFences.replace(/@@CODEBLOCK(\d+)@@/g, (match, idx) => {
      const code = codeBlocks[Number(idx)];
      return `<pre><code>${code}</code></pre>`;
    });

    return withoutFences;
  }

  /** ---------- Rendering ---------- */
  function render() {
    renderSidebar();
    renderChatArea();
  }

  function renderSidebar() {
    chatList.innerHTML = '';
    conversations.forEach(convo => {
      const item = document.createElement('div');
      item.className = 'chat-item' + (convo.id === activeId ? ' active' : '');
      item.dataset.id = convo.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'chat-item-title';
      titleSpan.textContent = convo.title || 'New chat';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'chat-item-delete';
      deleteBtn.setAttribute('aria-label', 'Delete chat');
      deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>';

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteModal(convo.id);
      });

      item.addEventListener('click', () => {
        switchConversation(convo.id);
      });

      item.appendChild(titleSpan);
      item.appendChild(deleteBtn);
      chatList.appendChild(item);
    });
  }

  function renderChatArea() {
    const convo = getActiveConversation();

    if (!convo || convo.messages.length === 0) {
      welcome.classList.remove('hidden');
      messagesEl.classList.remove('visible');
      messagesEl.innerHTML = '';
      chatTitle.textContent = 'Rift';
      return;
    }

    welcome.classList.add('hidden');
    messagesEl.classList.add('visible');
    chatTitle.textContent = convo.title || 'New chat';

    messagesEl.innerHTML = '';
    convo.messages.forEach(msg => {
      messagesEl.appendChild(buildMessageRow(msg));
    });
    scrollToBottom();
  }

  function buildMessageRow(msg) {
    const row = document.createElement('div');
    row.className = 'msg-row ' + msg.role + (msg.isError ? ' msg-error' : '');

    if (msg.role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = 'R';
      row.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    if (msg.role === 'assistant') {
      bubble.innerHTML = renderMarkdownLite(msg.content);
    } else {
      bubble.textContent = msg.content;
    }

    row.appendChild(bubble);
    return row;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
    });
  }

  function showTypingIndicator() {
    const row = document.createElement('div');
    row.className = 'msg-row assistant';
    row.id = 'typingRow';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'R';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';

    row.appendChild(avatar);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const row = document.getElementById('typingRow');
    if (row) row.remove();
  }

  /** ---------- Conversation actions ---------- */
  function switchConversation(id) {
    activeId = id;
    render();
    closeSidebarOnMobile();
  }

  function startNewChat() {
    activeId = null;
    render();
    closeSidebarOnMobile();
    composerInput.focus();
  }

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    let convo = getActiveConversation();
    if (!convo) {
      convo = createConversation();
    }

    const isFirstMessage = convo.messages.length === 0;

    convo.messages.push({ role: 'user', content: trimmed });
    if (isFirstMessage) {
      convo.title = titleFromMessage(trimmed);
    }
    saveConversations();
    render();

    composerInput.value = '';
    autoResizeTextarea();
    updateSendButtonState();

    isSending = true;
    updateSendButtonState();
    showTypingIndicator();

    try {
      const apiMessages = convo.messages.map(m => ({ role: m.role, content: m.content }));

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages })
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        data = null;
      }

      removeTypingIndicator();

      if (!response.ok || !data || data.error) {
        const friendly = (data && data.error) || 'Something went wrong. Please try again.';
        convo.messages.push({ role: 'assistant', content: friendly, isError: true });
      } else {
        convo.messages.push({ role: 'assistant', content: data.reply || '(empty response)' });
      }
    } catch (networkErr) {
      removeTypingIndicator();
      convo.messages.push({
        role: 'assistant',
        content: "I couldn't reach the server. Check your connection and try again.",
        isError: true
      });
    } finally {
      isSending = false;
      updateSendButtonState();
      saveConversations();
      render();
    }
  }

  /** ---------- Delete modal ---------- */
  function openDeleteModal(id) {
    pendingDeleteId = id;
    modalOverlay.classList.add('visible');
  }

  function closeDeleteModal() {
    pendingDeleteId = null;
    modalOverlay.classList.remove('visible');
  }

  modalCancelBtn.addEventListener('click', closeDeleteModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeDeleteModal();
  });
  modalConfirmBtn.addEventListener('click', () => {
    if (pendingDeleteId) {
      deleteConversation(pendingDeleteId);
    }
    closeDeleteModal();
  });

  /** ---------- Sidebar mobile toggling ---------- */
  function openSidebar() {
    sidebar.classList.add('open');
    scrim.classList.add('visible');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    scrim.classList.remove('visible');
  }

  function closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  }

  sidebarOpenBtn.addEventListener('click', openSidebar);
  sidebarCloseBtn.addEventListener('click', closeSidebar);
  scrim.addEventListener('click', closeSidebar);

  /** ---------- Composer ---------- */
  function autoResizeTextarea() {
    composerInput.style.height = 'auto';
    composerInput.style.height = Math.min(composerInput.scrollHeight, 200) + 'px';
  }

  function updateSendButtonState() {
    const hasText = composerInput.value.trim().length > 0;
    sendBtn.disabled = !hasText || isSending;
  }

  composerInput.addEventListener('input', () => {
    autoResizeTextarea();
    updateSendButtonState();
  });

  composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) {
        sendMessage(composerInput.value);
      }
    }
  });

  sendBtn.addEventListener('click', () => {
    if (!sendBtn.disabled) {
      sendMessage(composerInput.value);
    }
  });

  newChatBtn.addEventListener('click', startNewChat);

  /** ---------- Suggestion cards ---------- */
  suggestionGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.suggestion-card');
    if (!card) return;
    const prompt = card.dataset.prompt;
    if (prompt) {
      sendMessage(prompt);
    }
  });

  /** ---------- Init ---------- */
  function init() {
    loadConversations();
    // Don't auto-select a conversation; show welcome screen by default
    activeId = null;
    render();
    updateSendButtonState();
  }

  init();
})();
