/**
 * 奶油日记 - AI 猫伴聊天模块
 * 支持多会话管理、AI 对话、关键词搜索、对话持久化存储
 */

(function () {
  'use strict';

  // ============================================================
  // 常量
  // ============================================================
  const CHAT_STORAGE_KEY = 'cream_diary_chat_sessions';
  const CHAT_CONFIG_KEY = 'cream_diary_chat_config';
  const MAX_MESSAGES_PER_SESSION = 500;
  const DEFAULT_SYSTEM_PROMPT = `你是一只温柔的奶油色小猫，名叫"奶油"，是用户的AI猫伴。你的性格特点：
- 说话温柔可爱，喜欢用"喵~"、"呢"、"哦"等语气词
- 像猫咪一样时而撒娇、时而傲娇、时而贴心
- 会认真倾听用户的心事，给予温暖的安慰
- 偶尔会讲猫咪相关的趣事
- 回复简洁温暖，2-5句话为宜
- 用"铲屎官"或"主人"来称呼用户
- 可以适当使用emoji卖萌，但不要过度`;

  // ============================================================
  // 状态
  // ============================================================
  let sessions = [];           // 所有会话 [{ id, title, createdAt, updatedAt, messages }]
  let activeSessionId = null;  // 当前活跃会话 ID
  let isStreaming = false;     // 是否正在等待 AI 回复
  let searchHighlight = '';    // 当前搜索关键词高亮

  // ============================================================
  // DOM 引用（延迟初始化）
  // ============================================================
  let els = {};

  function cacheDom() {
    els = {
      // 会话管理
      sessionSelect: document.getElementById('chatSessionSelect'),
      btnNewChat: document.getElementById('btnNewChat'),
      btnDeleteChat: document.getElementById('btnDeleteChat'),
      // 搜索
      searchInput: document.getElementById('chatSearchInput'),
      searchClear: document.getElementById('chatSearchClear'),
      // 消息区
      messages: document.getElementById('chatMessages'),
      chatEmpty: document.getElementById('chatEmpty'),
      // 输入
      chatInput: document.getElementById('chatInput'),
      btnSend: document.getElementById('btnSend'),
      // 设置
      aiToggle: document.getElementById('aiChatToggle'),
      aiProvider: document.getElementById('aiProvider'),
      aiEndpoint: document.getElementById('aiEndpoint'),
      aiApiKey: document.getElementById('aiApiKey'),
      aiModel: document.getElementById('aiModel'),
      aiSystemPrompt: document.getElementById('aiSystemPrompt'),
      // 行
      aiProviderRow: document.getElementById('aiProviderRow'),
      aiEndpointRow: document.getElementById('aiEndpointRow'),
      aiKeyRow: document.getElementById('aiKeyRow'),
      aiModelRow: document.getElementById('aiModelRow'),
      aiSystemPromptRow: document.getElementById('aiSystemPromptRow'),
    };
  }

  // ============================================================
  // 数据持久化
  // ============================================================
  function loadSessions() {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      sessions = raw ? JSON.parse(raw) : [];
    } catch (e) {
      sessions = [];
    }
  }

  function saveSessions() {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(sessions));
    } catch (e) {
      showToast('⚠️ 存储空间不足，请清理旧对话');
    }
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(CHAT_CONFIG_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveConfig(config) {
    try {
      localStorage.setItem(CHAT_CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
      // ignore
    }
  }

  // ============================================================
  // 会话管理
  // ============================================================
  function createSession() {
    const now = Date.now();
    const session = {
      id: 'chat_' + now + '_' + Math.random().toString(36).slice(2, 8),
      title: '新的对话',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    sessions.unshift(session);
    saveSessions();
    return session;
  }

  function getActiveSession() {
    return sessions.find(s => s.id === activeSessionId) || null;
  }

  function setActiveSession(id) {
    activeSessionId = id;
    renderSessionSelect();
    renderMessages();
    updateSendButton();
    // 聚焦输入框
    setTimeout(() => els.chatInput && els.chatInput.focus(), 100);
    saveSessions();
  }

  function deleteSession(id) {
    const idx = sessions.findIndex(s => s.id === id);
    if (idx === -1) return;
    
    sessions.splice(idx, 1);
    saveSessions();

    if (id === activeSessionId) {
      activeSessionId = sessions.length > 0 ? sessions[0].id : null;
    }

    renderSessionSelect();
    renderMessages();
    updateSendButton();

    if (sessions.length === 0) {
      showEmptyState(true);
    }
  }

  function updateSessionTitle(sessionId) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session || session.messages.length === 0) return;

    // 用第一条用户消息作为标题
    const firstUserMsg = session.messages.find(m => m.role === 'user');
    if (firstUserMsg) {
      const title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '…' : '');
      session.title = title;
      saveSessions();
      renderSessionSelect();
    }
  }

  // ============================================================
  // AI 配置
  // ============================================================
  function getAIConfig() {
    const config = loadConfig();
    const provider = els.aiProvider ? els.aiProvider.value : (config.provider || 'deepseek');
    const enabled = els.aiToggle ? els.aiToggle.checked : (config.enabled !== false);

    let endpoint, apiKey, model;

    if (provider === 'openai') {
      endpoint = 'https://api.openai.com/v1/chat/completions';
      model = 'gpt-4o-mini';
    } else if (provider === 'deepseek') {
      endpoint = 'https://api.deepseek.com/v1/chat/completions';
      model = 'deepseek-chat';
    } else {
      endpoint = els.aiEndpoint ? els.aiEndpoint.value.trim() : (config.endpoint || '');
      model = els.aiModel ? els.aiModel.value.trim() : (config.model || 'deepseek-chat');
    }

    apiKey = els.aiApiKey ? els.aiApiKey.value.trim() : (config.apiKey || '');
    const systemPrompt = els.aiSystemPrompt ? els.aiSystemPrompt.value.trim() : (config.systemPrompt || DEFAULT_SYSTEM_PROMPT);

    return { enabled, provider, endpoint, apiKey, model, systemPrompt };
  }

  function applyConfigToUI() {
    const config = loadConfig();
    if (!els.aiToggle) return;

    els.aiToggle.checked = config.enabled !== false;
    els.aiProvider.value = config.provider || 'deepseek';
    els.aiEndpoint.value = config.endpoint || '';
    els.aiApiKey.value = config.apiKey || '';
    els.aiModel.value = config.model || '';
    els.aiSystemPrompt.value = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    toggleAISettingsRows();
  }

  function toggleAISettingsRows() {
    if (!els.aiToggle || !els.aiProviderRow) return;
    const enabled = els.aiToggle.checked;
    const isCustom = els.aiProvider.value === 'custom';

    const rows = [els.aiProviderRow, els.aiEndpointRow, els.aiKeyRow, els.aiModelRow, els.aiSystemPromptRow];
    rows.forEach(row => {
      if (row) row.style.display = enabled ? '' : 'none';
    });

    // 自定义模式才显示 endpoint 和 model 输入框
    if (els.aiEndpointRow) els.aiEndpointRow.style.display = (enabled && isCustom) ? '' : 'none';
    if (els.aiModelRow) els.aiModelRow.style.display = (enabled && isCustom) ? '' : 'none';
  }

  function saveCurrentConfig() {
    const config = {
      enabled: els.aiToggle ? els.aiToggle.checked : true,
      provider: els.aiProvider ? els.aiProvider.value : 'deepseek',
      endpoint: els.aiEndpoint ? els.aiEndpoint.value.trim() : '',
      apiKey: els.aiApiKey ? els.aiApiKey.value.trim() : '',
      model: els.aiModel ? els.aiModel.value.trim() : '',
      systemPrompt: els.aiSystemPrompt ? els.aiSystemPrompt.value.trim() : DEFAULT_SYSTEM_PROMPT,
    };
    saveConfig(config);
  }

  // ============================================================
  // 渲染
  // ============================================================
  function renderSessionSelect() {
    if (!els.sessionSelect) return;
    
    els.sessionSelect.innerHTML = '<option value="">🐱 选择会话…</option>';
    
    sessions.forEach(s => {
      const option = document.createElement('option');
      option.value = s.id;
      option.textContent = s.title || '新的对话';
      if (s.id === activeSessionId) {
        option.selected = true;
      }
      els.sessionSelect.appendChild(option);
    });
  }

  function renderMessages() {
    if (!els.messages || !els.chatEmpty) return;

    const session = getActiveSession();
    
    if (!session || session.messages.length === 0) {
      showEmptyState(true);
      return;
    }

    showEmptyState(false);

    // 过滤搜索高亮
    let messages = session.messages;
    if (searchHighlight) {
      const kw = searchHighlight.toLowerCase();
      messages = messages.filter(m => m.content.toLowerCase().includes(kw));
    }

    // 构建消息HTML
    let html = '';
    messages.forEach((msg, idx) => {
      const content = highlightText(escapeHtml(msg.content), searchHighlight);
      const time = msg.timestamp ? formatTime(msg.timestamp) : '';

      if (msg.role === 'user') {
        html += `
          <div class="chat-msg user">
            <div class="chat-avatar"><img src="assets/icons/猫咪2.png" alt="我" class="chat-avatar-img"></div>
            <div class="chat-bubble">
              <div class="chat-bubble-text">${content}</div>
              <div class="chat-time">${time}</div>
            </div>
          </div>`;
      } else {
        html += `
          <div class="chat-msg assistant">
            <div class="chat-avatar"><img src="assets/icons/猫咪.png" alt="猫伴" class="chat-avatar-img"></div>
            <div class="chat-bubble">
              <div class="chat-bubble-text">${content}</div>
              <div class="chat-time">${time}</div>
            </div>
          </div>`;
      }
    });

    // 流式输出中的临时气泡
    if (isStreaming && activeSessionId) {
      html += `
        <div class="chat-msg assistant chat-typing" id="streamingBubble">
          <div class="chat-avatar"><img src="assets/icons/猫咪.png" alt="猫伴" class="chat-avatar-img"></div>
          <div class="chat-bubble">
            <span class="chat-typing-dot"></span>
            <span class="chat-typing-dot"></span>
            <span class="chat-typing-dot"></span>
          </div>
        </div>`;
    }

    els.messages.innerHTML = html;

    // 如果没有匹配的搜索结果
    if (searchHighlight && messages.length === 0) {
      els.messages.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-icon"><img src="assets/icons/猫咪毛球.png" alt="找不到" class="chat-empty-cat-img"></div>
          <div class="chat-empty-text">没有找到匹配的消息</div>
          <div class="chat-empty-hint">试试其他关键词吧~</div>
        </div>`;
    }

    // 滚动到底部
    scrollToBottom();
  }

  function showEmptyState(show) {
    if (!els.chatEmpty) return;
    if (!els.messages) return;

    if (show) {
      els.chatEmpty.style.display = '';
      if (els.messages.children.length <= 1) {
        // 只保留空状态元素
        els.messages.querySelectorAll('.chat-msg').forEach(el => el.remove());
      }
    } else {
      els.chatEmpty.style.display = 'none';
    }
  }

  function scrollToBottom() {
    if (!els.messages) return;
    requestAnimationFrame(() => {
      els.messages.scrollTop = els.messages.scrollHeight;
    });
  }

  // ============================================================
  // 消息操作
  // ============================================================
  function addMessage(role, content) {
    const session = getActiveSession();
    if (!session) return null;

    const msg = {
      role: role,
      content: content,
      timestamp: Date.now(),
    };

    session.messages.push(msg);
    session.updatedAt = Date.now();

    // 限制消息数量
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
    }

    saveSessions();
    return msg;
  }

  function updateSendButton() {
    if (!els.btnSend || !els.chatInput) return;
    const hasText = els.chatInput.value.trim().length > 0;
    const hasSession = !!getActiveSession();
    const config = getAIConfig();
    els.btnSend.disabled = !hasText || !hasSession || isStreaming || !config.enabled;
  }

  // ============================================================
  // AI 调用
  // ============================================================
  async function sendToAI(userMessage) {
    const config = getAIConfig();

    if (!config.enabled) {
      showToast('🐱 AI 猫伴未启用，请在设置中开启');
      return;
    }

    if (!config.endpoint) {
      showToast('⚠️ 请先在设置中配置 API 地址');
      return;
    }

    if (!config.apiKey) {
      showToast('⚠️ 请先在设置中配置 API Key');
      return;
    }

    // 构建消息历史
    const session = getActiveSession();
    if (!session) return;

    const messages = [
      { role: 'system', content: config.systemPrompt || DEFAULT_SYSTEM_PROMPT },
    ];

    // 加入最近的消息（限制 token 消耗）
    const recentMessages = session.messages.slice(-40);
    recentMessages.forEach(m => {
      messages.push({ role: m.role, content: m.content });
    });

    // 设置流式状态
    isStreaming = true;
    renderMessages();
    updateSendButton();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: messages,
          stream: false,
          max_tokens: 1000,
          temperature: 0.8,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `请求失败 (${response.status})`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error?.message || errJson.message || errMsg;
        } catch (e) {
          // use raw text
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const aiContent = data.choices?.[0]?.message?.content || '喵~ 我好像有点语无伦次了…';

      // 添加 AI 回复
      addMessage('assistant', aiContent);
      
      // 更新会话标题
      updateSessionTitle(activeSessionId);

      isStreaming = false;
      renderMessages();
      renderSessionSelect();
      updateSendButton();

    } catch (err) {
      isStreaming = false;
      
      if (err.name === 'AbortError') {
        showToast('⏰ 请求超时，请检查网络或 API 配置');
      } else {
        showToast('❌ ' + (err.message || 'AI 请求失败'));
      }

      // 移除用户消息（发送失败回滚）
      const session2 = getActiveSession();
      if (session2 && session2.messages.length > 0) {
        const lastMsg = session2.messages[session2.messages.length - 1];
        // 只回滚刚刚添加的用户消息
      }

      renderMessages();
      updateSendButton();
    }
  }

  async function sendMessage(content) {
    if (isStreaming) return;
    if (!content.trim()) return;

    // 确保有活跃会话
    if (!getActiveSession()) {
      const session = createSession();
      setActiveSession(session.id);
    }

    // 添加用户消息
    addMessage('user', content.trim());
    renderMessages();
    renderSessionSelect();
    updateSendButton();

    // 清空输入框
    els.chatInput.value = '';
    updateSendButton();

    // 发送到 AI
    await sendToAI(content.trim());
  }

  // ============================================================
  // 搜索
  // ============================================================
  function performSearch(keyword) {
    searchHighlight = keyword.trim();
    renderMessages();

    if (searchHighlight && els.searchClear) {
      els.searchClear.style.display = '';
    } else if (els.searchClear) {
      els.searchClear.style.display = 'none';
    }

    if (searchHighlight) {
      // 如果跨会话搜索，自动选择第一个有匹配的会话
      const session = getActiveSession();
      if (session) {
        const hasMatch = session.messages.some(m =>
          m.content.toLowerCase().includes(searchHighlight.toLowerCase())
        );
        if (!hasMatch) {
          // 查找其他会话
          for (const s of sessions) {
            const match = s.messages.some(m =>
              m.content.toLowerCase().includes(searchHighlight.toLowerCase())
            );
            if (match) {
              setActiveSession(s.id);
              break;
            }
          }
        }
      }
    }
  }

  function clearSearch() {
    if (els.searchInput) els.searchInput.value = '';
    searchHighlight = '';
    if (els.searchClear) els.searchClear.style.display = 'none';
    renderMessages();
  }

  // ============================================================
  // 工具函数
  // ============================================================
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function highlightText(text, keyword) {
    if (!keyword) return text;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, '<mark class="chat-highlight">$1</mark>');
  }

  function formatTime(timestamp) {
    const d = new Date(timestamp);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  }

  function showToast(message) {
    // 复用 app.js 中的 toast，如果不存在则创建简单提示
    const toast = document.getElementById('toast');
    if (toast) {
      // 触发自定义事件让 app.js 处理
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2500);
    } else {
      // fallback
      const el = document.createElement('div');
      el.style.cssText = `
        position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
        background:rgba(60,50,40,0.95);color:#FFF8F0;padding:12px 24px;
        border-radius:24px;font-size:14px;z-index:9999;white-space:nowrap;
        box-shadow:0 4px 16px rgba(0,0,0,0.2);
      `;
      el.textContent = message;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2500);
    }
  }

  // ============================================================
  // 事件绑定
  // ============================================================
  function bindEvents() {
    if (!els.sessionSelect) return;

    // 会话选择
    els.sessionSelect.addEventListener('change', () => {
      const id = els.sessionSelect.value;
      if (id) {
        setActiveSession(id);
      }
    });

    // 新建会话
    els.btnNewChat.addEventListener('click', () => {
      const session = createSession();
      setActiveSession(session.id);
    });

    // 删除会话
    els.btnDeleteChat.addEventListener('click', () => {
      if (!activeSessionId) {
        showToast('🐱 没有可删除的会话哦~');
        return;
      }
      if (confirm('确定要删除这个对话吗？喵~ 删除后不可恢复哦')) {
        deleteSession(activeSessionId);
      }
    });

    // 搜索输入
    let searchDebounce;
    els.searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        performSearch(els.searchInput.value);
      }, 300);
    });

    // 清除搜索
    els.searchClear.addEventListener('click', clearSearch);

    // 发送按钮
    els.btnSend.addEventListener('click', () => {
      const text = els.chatInput.value;
      sendMessage(text);
    });

    // 回车发送
    els.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = els.chatInput.value;
        sendMessage(text);
      }
    });

    // 输入框内容变化
    els.chatInput.addEventListener('input', updateSendButton);

    // 建议语句点击
    els.messages.addEventListener('click', (e) => {
      const chip = e.target.closest('.chat-suggestion-chip');
      if (chip) {
        const text = chip.dataset.text;
        if (text) {
          sendMessage(text);
        }
      }
    });

    // AI 设置变更
    els.aiToggle.addEventListener('change', () => {
      toggleAISettingsRows();
      saveCurrentConfig();
      updateSendButton();
    });

    els.aiProvider.addEventListener('change', () => {
      toggleAISettingsRows();

      // 切换 provider 时自动填充默认值
      if (els.aiProvider.value === 'deepseek') {
        if (els.aiEndpoint) els.aiEndpoint.value = 'https://api.deepseek.com/v1/chat/completions';
        if (els.aiModel) els.aiModel.value = 'deepseek-chat';
      } else if (els.aiProvider.value === 'openai') {
        if (els.aiEndpoint) els.aiEndpoint.value = 'https://api.openai.com/v1/chat/completions';
        if (els.aiModel) els.aiModel.value = 'gpt-4o-mini';
      } else {
        if (els.aiEndpoint) els.aiEndpoint.value = '';
        if (els.aiModel) els.aiModel.value = '';
      }

      saveCurrentConfig();
    });

    // 所有设置输入变化时自动保存
    [els.aiEndpoint, els.aiApiKey, els.aiModel, els.aiSystemPrompt].forEach(el => {
      if (el) {
        el.addEventListener('change', saveCurrentConfig);
        el.addEventListener('blur', saveCurrentConfig);
      }
    });
  }

  // ============================================================
  // 面板切换回调（由 app.js 调用）
  // ============================================================
  window.onChatPanelActivated = function () {
    cacheDom();
    if (!els.sessionSelect) return; // 还没初始化

    // 确保有活跃会话
    if (sessions.length === 0) {
      const session = createSession();
      setActiveSession(session.id);
    } else if (!getActiveSession()) {
      setActiveSession(sessions[0].id);
    }

    renderSessionSelect();
    renderMessages();
    updateSendButton();
    
    setTimeout(() => els.chatInput && els.chatInput.focus(), 200);
  };

  // ============================================================
  // 初始化
  // ============================================================
  function init() {
    loadSessions();
    cacheDom();

    if (!els.sessionSelect) {
      // DOM 还未渲染完成，等待
      setTimeout(init, 200);
      return;
    }

    applyConfigToUI();
    toggleAISettingsRows();

    if (sessions.length > 0) {
      activeSessionId = sessions[0].id;
    }

    bindEvents();
    renderSessionSelect();
    renderMessages();
    updateSendButton();

    console.log('🐱 AI 猫伴模块初始化完成');
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();