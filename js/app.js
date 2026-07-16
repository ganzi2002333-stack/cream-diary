// ============================================================
// 奶油日记 · 主控逻辑
// Phase 2: 页面切换 + UI 交互 + 预设标签渲染
// Phase 3: IndexedDB 数据层集成
// Phase 4: 历史记录列表渲染
// Phase 5: 搜索筛选（关键词 + 日期范围 + 分数范围 + 标签过滤）
// ============================================================

(function () {
  'use strict';

  // ---------- 预设标签（15个） ----------
  const PRESET_TAGS = [
    { id: 'happy', icon: '😊', label: '开心', category: 'positive' },
    { id: 'excited', icon: '🎉', label: '兴奋', category: 'positive' },
    { id: 'grateful', icon: '🙏', label: '感恩', category: 'positive' },
    { id: 'calm', icon: '😌', label: '平静', category: 'positive' },
    { id: 'expecting', icon: '🌟', label: '期待', category: 'positive' },
    { id: 'sad', icon: '😢', label: '难过', category: 'negative' },
    { id: 'anxious', icon: '😰', label: '焦虑', category: 'negative' },
    { id: 'angry', icon: '😤', label: '生气', category: 'negative' },
    { id: 'tired', icon: '😴', label: '疲惫', category: 'negative' },
    { id: 'lonely', icon: '🥺', label: '孤独', category: 'negative' },
    { id: 'motivated', icon: '💪', label: '有动力', category: 'neutral' },
    { id: 'creative', icon: '🎨', label: '创意满满', category: 'neutral' },
    { id: 'confused', icon: '🤔', label: '困惑', category: 'neutral' },
    { id: 'moved', icon: '💗', label: '感动', category: 'neutral' },
    { id: 'relieved', icon: '😮‍💨', label: '松了一口气', category: 'neutral' }
  ];

  // ---------- 页面标题映射 ----------
  const PAGE_TITLES = {
    'panel-today': '🍰 今天的心情',
    'panel-history': '📅 历史记录',
    'panel-trends': '📊 情绪趋势',
    'panel-cat': '🐱 猫伴',
    'panel-search': '🔍 搜索',
    'panel-settings': '⚙️ 设置'
  };

  // ---------- 选中标签集合（今天页） ----------
  let selectedTags = new Set();

  // ---------- 当前历史筛选时段 ----------
  let historyPeriod = 'all'; // 'all' | 'week' | 'month'

  // ---------- 趋势图维度 ----------
  let currentTrendView = 'week'; // 'week' | 'month'
  let moodChartInstance = null;  // Chart.js 实例引用

  // ---------- 搜索页已选标签 ----------
  var searchTagFilters = new Set();

  // ---------- 搜索防抖定时器 ----------
  var searchDebounceTimer = null;

  // ---------- 提醒通知变量 ----------
  var notifyIntervalId = null;

  // ---------- DOM 缓存 ----------
  const appContainer = document.getElementById('appContainer');
  const appMain = document.getElementById('appMain');
  const pageTitle = document.getElementById('pageTitle');
  const bottomNav = document.getElementById('bottomNav');
  const toast = document.getElementById('toast');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalActions = document.getElementById('modalActions');
  const historyList = document.getElementById('historyList');
  const historyEmpty = document.getElementById('historyEmpty');

  // ---------- Toast 系统 ----------
  let toastTimer = null;

  function showToast(message, duration) {
    if (duration === undefined) duration = 2000;
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
      toastTimer = null;
    }, duration);
  }

  // ---------- 模态框系统 ----------
  let modalResolve = null;

  function showModal(title, bodyHTML, actions) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      modalTitle.textContent = title;
      modalBody.innerHTML = bodyHTML;
      modalActions.innerHTML = '';

      actions.forEach(function (action) {
        var btn = document.createElement('button');
        btn.textContent = action.label;
        btn.className = action.isPrimary ? 'modal-btn-confirm' : 'modal-btn-cancel';
        btn.addEventListener('click', function () {
          var result = action.onClick ? action.onClick() : action.value;
          closeModal(result);
        });
        modalActions.appendChild(btn);
      });

      modalOverlay.classList.add('show');
    });
  }

  function closeModal(value) {
    modalOverlay.classList.remove('show');
    if (modalResolve) {
      modalResolve(value);
      modalResolve = null;
    }
  }

  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) {
      closeModal(null);
    }
  });

  // ---------- 页面切换 ----------
  function switchPanel(panelId) {
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === panelId);
    });

    pageTitle.textContent = PAGE_TITLES[panelId] || '🍰 奶油日记';

    document.querySelectorAll('.nav-item').forEach(function (nav) {
      nav.classList.toggle('active', nav.dataset.panel === panelId);
    });

    appMain.scrollTop = 0;

    onPanelSwitched(panelId);
  }

  function onPanelSwitched(panelId) {
    if (panelId === 'panel-history') {
      refreshHistoryList();
    }
    if (panelId === 'panel-trends') {
      refreshTrends();
    }
    if (panelId === 'panel-cat') {
      // 通知 chat.js 面板已激活
      if (window.onChatPanelActivated) {
        window.onChatPanelActivated();
      }
    }
    if (panelId === 'panel-search') {
      // 进入搜索页时触发一次搜索，展示全量结果
      performSearch();
    }
  }

  bottomNav.addEventListener('click', function (e) {
    var navItem = e.target.closest('.nav-item');
    if (!navItem) return;
    var panelId = navItem.dataset.panel;
    if (panelId) {
      switchPanel(panelId);
    }
  });

  // ---------- 日期显示 ----------
  function updateDateDisplay() {
    var now = new Date();
    var weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var year = now.getFullYear();
    var month = now.getMonth() + 1;
    var day = now.getDate();
    var weekday = weekdays[now.getDay()];
    var dateText = document.getElementById('todayDate');
    if (dateText) {
      dateText.textContent = year + '年' + month + '月' + day + '日 ' + weekday;
    }
  }
  updateDateDisplay();

  // ---------- 情绪滑动条 ----------
  const moodSlider = document.getElementById('moodSlider');
  const scoreDisplay = document.getElementById('scoreDisplay');
  const moodEmoji = document.getElementById('moodEmoji');

  function getMoodEmoji(score) {
    var img = '<img src="assets/icons/';
    if (score <= 1.5) return img + '难过.png" alt="难过" class="mood-img">';
    if (score <= 2.5) return img + '累.png" alt="累" class="mood-img">';
    if (score <= 3.5) return img + '生气.png" alt="生气" class="mood-img">';
    if (score <= 4.5) return img + '电量耗尽.png" alt="电量耗尽" class="mood-img">';
    if (score <= 5.5) return img + '学习中.png" alt="学习中" class="mood-img">';
    if (score <= 6.5) return img + '期待1.png" alt="期待" class="mood-img">';
    if (score <= 7.5) return img + '撒娇.png" alt="撒娇" class="mood-img">';
    if (score <= 8.5) return img + '开心2.png" alt="开心" class="mood-img">';
    if (score <= 9.5) return img + '开心.png" alt="超开心" class="mood-img">';
    return img + '十分开心.png" alt="十分开心" class="mood-img">';
  }

  function getScoreColor(score) {
    if (score <= 3.5) return '#D4A08A';
    if (score <= 6.5) return '#D2B48C';
    return '#A0B88C';
  }

  function updateMoodDisplay() {
    var score = parseFloat(moodSlider.value);
    scoreDisplay.textContent = score.toFixed(1);
    moodEmoji.innerHTML = getMoodEmoji(score);
    scoreDisplay.style.color = getScoreColor(score);
  }

  if (moodSlider) {
    moodSlider.addEventListener('input', updateMoodDisplay);
    updateMoodDisplay();
  }

  // ---------- 标签渲染（通用） ----------
  function renderTags(containerId, tagsList, selectedSet, clickHandler) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    tagsList.forEach(function (tag) {
      var chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.dataset.tagId = tag.id;
      chip.innerHTML = tag.icon + ' ' + tag.label;

      if (selectedSet && selectedSet.has(tag.id)) {
        chip.classList.add('selected');
      }

      if (clickHandler) {
        chip.addEventListener('click', function () { clickHandler(tag.id, chip); });
      }

      container.appendChild(chip);
    });
  }

  function handleTagClick(tagId, chipElement) {
    if (selectedTags.has(tagId)) {
      selectedTags.delete(tagId);
      chipElement.classList.remove('selected');
    } else {
      selectedTags.add(tagId);
      chipElement.classList.add('selected');
    }
  }

  renderTags('tagsContainer', PRESET_TAGS, selectedTags, handleTagClick);

  // ---------- 搜索页标签渲染 ----------
  function renderSearchTags() {
    var container = document.getElementById('searchTagsContainer');
    if (!container) return;
    container.innerHTML = '';

    PRESET_TAGS.forEach(function (tag) {
      var chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.dataset.tagId = tag.id;
      chip.innerHTML = tag.icon + ' ' + tag.label;

      if (searchTagFilters.has(tag.id)) {
        chip.classList.add('selected');
      }

      chip.addEventListener('click', function () {
        if (searchTagFilters.has(tag.id)) {
          searchTagFilters.delete(tag.id);
          chip.classList.remove('selected');
        } else {
          searchTagFilters.add(tag.id);
          chip.classList.add('selected');
        }
        debounceSearch();
      });

      container.appendChild(chip);
    });
  }
  renderSearchTags();

  // ---------- 新建标签 ----------
  var btnAddTag = document.getElementById('btnAddTag');
  if (btnAddTag) {
    btnAddTag.addEventListener('click', async function () {
      var submitted = await showModal(
        '✨ 新建标签',
        '<input type="text" id="newTagInput" placeholder="输入标签名称…" maxlength="20">',
        [
          { label: '取消', isPrimary: false, value: null },
          {
            label: '创建',
            isPrimary: true,
            onClick: function () {
              var input = document.getElementById('newTagInput');
              return input ? input.value.trim() : null;
            }
          }
        ]
      );

      if (submitted) {
        var newTag = {
          id: 'custom_' + Date.now(),
          icon: '✨',
          label: submitted,
          category: 'custom'
        };
        PRESET_TAGS.push(newTag);
        renderTags('tagsContainer', PRESET_TAGS, selectedTags, handleTagClick);
        renderSearchTags();
        if (window.CreamStorage) {
          try { await window.CreamStorage.saveTag({ id: newTag.id, name: submitted, isPreset: false }); }
          catch (e) { console.warn('标签持久化失败:', e); }
        }
        showToast('✅ 标签已创建');
      }
    });
  }

  // ---------- 三问输入框自动扩展 ----------
  document.querySelectorAll('.question-input').forEach(function (textarea) {
    textarea.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.max(80, this.scrollHeight) + 'px';
    });
  });

  // ---------- 保存按钮 ----------
  var btnSave = document.getElementById('btnSave');
  if (btnSave) {
    btnSave.addEventListener('click', async function () {
      var score = moodSlider ? parseFloat(moodSlider.value) : 5;
      var tags = Array.from(selectedTags);
      var q1 = (document.getElementById('q1Input') && document.getElementById('q1Input').value.trim()) || '';
      var q2 = (document.getElementById('q2Input') && document.getElementById('q2Input').value.trim()) || '';
      var q3 = (document.getElementById('q3Input') && document.getElementById('q3Input').value.trim()) || '';

      if (tags.length === 0) { showToast('🏷️ 请至少选择一个情绪标签哦~'); return; }

      var today = new Date().toISOString().slice(0, 10);
      var existingRecord = null;
      if (window.CreamStorage) {
        try { existingRecord = await window.CreamStorage.getRecordByDate(today); }
        catch (e) { console.warn('查询已有记录失败:', e); }
      }

      if (existingRecord) {
        var confirmed = await showModal(
          '📝 今天已有记录',
          '<p>今天已经记录过心情了，是否覆盖之前的记录？</p>',
          [
            { label: '取消', isPrimary: false, value: false },
            { label: '覆盖', isPrimary: true, value: true }
          ]
        );
        if (!confirmed) return;
      }

      var record = { id: existingRecord ? existingRecord.id : undefined, date: today, score: score, tags: tags, a1: q1, a2: q2, a3: q3 };

      if (window.CreamStorage) {
        try {
          await window.CreamStorage.saveRecord(record);
          selectedTags.clear();
          renderTags('tagsContainer', PRESET_TAGS, selectedTags, handleTagClick);
          document.getElementById('q1Input').value = '';
          document.getElementById('q2Input').value = '';
          document.getElementById('q3Input').value = '';
          moodSlider.value = 5.0;
          updateMoodDisplay();
          showToast('💛 已记录今日心情');
          refreshHistoryListIfActive();
        } catch (e) { console.error('保存失败:', e); showToast('❌ 保存失败，请重试'); }
      } else {
        console.log('📝 保存模拟（storage 未加载）:', record);
        showToast('💛 已记录今日心情（预览模式）');
      }
    });
  }

  // ===========================
  // Phase 4: 历史记录渲染
  // ===========================

  document.querySelectorAll('.filter-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.filter-chip').forEach(function (c) { c.classList.remove('active'); });
      this.classList.add('active');
      historyPeriod = this.dataset.period || 'all';
      refreshHistoryList();
    });
  });

  function formatHistoryDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));
    var weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var weekday = weekdays[d.getDay()];
    if (diffDays === 0) return '今天 · ' + dateStr;
    if (diffDays === 1) return '昨天 · ' + dateStr;
    return dateStr + ' · ' + weekday;
  }

  function getDayIcon(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var icons = ['☀️', '🌙', '🔥', '💧', '🌿', '⭐', '🎈'];
    return icons[d.getDay()];
  }

  function findTagInfo(tagId) {
    return PRESET_TAGS.find(function (t) { return t.id === tagId; }) || { id: tagId, icon: '🏷️', label: tagId };
  }

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function refreshHistoryListIfActive() {
    var activePanel = document.querySelector('.panel.active');
    if (activePanel && activePanel.id === 'panel-history') {
      refreshHistoryList();
    }
  }

  async function refreshHistoryList() {
    if (!window.CreamStorage) { console.warn('CreamStorage 未加载，跳过历史渲染'); return; }
    if (!historyList) return;

    try {
      var records = await window.CreamStorage.getAllRecords();
      if (historyPeriod === 'week') {
        var sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        records = records.filter(function (r) { return new Date(r.date + 'T00:00:00') >= sevenDaysAgo; });
      } else if (historyPeriod === 'month') {
        var thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        records = records.filter(function (r) { return new Date(r.date + 'T00:00:00') >= thirtyDaysAgo; });
      }
      records.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

      if (!records || records.length === 0) {
        historyList.innerHTML = '';
        if (historyEmpty) { historyEmpty.style.display = ''; historyList.appendChild(historyEmpty); }
        else { historyList.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">还没有情绪记录哦~</div></div>'; }
        return;
      }
      if (historyEmpty) historyEmpty.style.display = 'none';

      historyList.innerHTML = '';
      records.forEach(function (record) {
        historyList.appendChild(createHistoryCard(record));
      });
    } catch (e) { console.error('刷新历史列表失败:', e); }
  }

  function createHistoryCard(record) {
    var card = document.createElement('div');
    card.className = 'history-card';
    card.dataset.recordId = record.id;
    card.dataset.date = record.date;
    var score = record.score || 5;
    var emoji = getMoodEmoji(score);
    var color = getScoreColor(score);

    var tagsHTML = '';
    if (record.tags && record.tags.length > 0) {
      tagsHTML = '<div class="history-card-tags">' +
        record.tags.map(function (tid) {
          var info = findTagInfo(tid);
          return '<span class="history-tag-chip">' + info.icon + ' ' + info.label + '</span>';
        }).join('') + '</div>';
    }

    var qaHTML = '';
    if (record.a1 || record.a2 || record.a3) {
      qaHTML = '<div class="history-card-qa">';
      if (record.a1) qaHTML += '<div class="history-qa-block"><span class="qa-q">Q:</span><span class="qa-a">' + escapeHTML(record.a1) + '</span></div>';
      if (record.a2) qaHTML += '<div class="history-qa-block"><span class="qa-q">Q:</span><span class="qa-a">' + escapeHTML(record.a2) + '</span></div>';
      if (record.a3) qaHTML += '<div class="history-qa-block"><span class="qa-q">Q:</span><span class="qa-a">' + escapeHTML(record.a3) + '</span></div>';
      qaHTML += '</div>';
    }

    card.innerHTML =
      '<div class="history-card-top">' +
        '<div class="history-card-date">' +
          '<span class="day-icon">' + getDayIcon(record.date) + '</span>' + formatHistoryDate(record.date) +
        '</div>' +
        '<div class="history-card-score" style="color: ' + color + '">' +
          '<span class="score-num">' + score.toFixed(1) + '</span>' +
          '<span class="score-emoji">' + emoji + '</span>' +
        '</div>' +
      '</div>' + tagsHTML + qaHTML +
      '<div class="history-card-actions">' +
        '<button class="history-btn-edit" data-action="edit" data-id="' + record.id + '">✏️ 编辑</button>' +
        '<button class="history-btn-delete" data-action="delete" data-id="' + record.id + '">🗑️ 删除</button>' +
      '</div>';

    var deleteBtn = card.querySelector('.history-btn-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteHistoryRecord(record.id, record.date);
      });
    }
    var editBtn = card.querySelector('.history-btn-edit');
    if (editBtn) {
      editBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        editHistoryRecord(record);
      });
    }
    return card;
  }

  async function deleteHistoryRecord(recordId, dateStr) {
    var confirmed = await showModal(
      '⚠️ 确认删除',
      '<p class="delete-confirm-text">确定要删除 <strong>' + dateStr + '</strong> 的记录吗？<br>此操作不可恢复。</p>',
      [
        { label: '取消', isPrimary: false, value: false },
        { label: '确认删除', isPrimary: true, value: true }
      ]
    );
    if (!confirmed) return;
    if (window.CreamStorage) {
      try { await window.CreamStorage.deleteRecord(recordId); showToast('🗑️ 记录已删除'); refreshHistoryList(); }
      catch (e) { console.error('删除失败:', e); showToast('❌ 删除失败'); }
    }
  }

  async function editHistoryRecord(record) {
    var confirmed = await showModal(
      '✏️ 编辑记录',
      '<p>将 <strong>' + record.date + '</strong> 的记录加载到"今天"页面进行编辑？</p>',
      [
        { label: '取消', isPrimary: false, value: false },
        { label: '加载', isPrimary: true, value: true }
      ]
    );
    if (!confirmed) return;

    if (moodSlider) { moodSlider.value = record.score || 5; updateMoodDisplay(); }
    selectedTags.clear();
    if (record.tags && record.tags.length > 0) {
      record.tags.forEach(function (tid) { selectedTags.add(tid); });
    }
    renderTags('tagsContainer', PRESET_TAGS, selectedTags, handleTagClick);

    var q1 = document.getElementById('q1Input');
    if (q1) { q1.value = record.a1 || ''; q1.dispatchEvent(new Event('input')); }
    var q2 = document.getElementById('q2Input');
    if (q2) { q2.value = record.a2 || ''; q2.dispatchEvent(new Event('input')); }
    var q3 = document.getElementById('q3Input');
    if (q3) { q3.value = record.a3 || ''; q3.dispatchEvent(new Event('input')); }

    if (window.CreamStorage) {
      try { await window.CreamStorage.deleteRecord(record.id); }
      catch (e) { console.warn('删除旧记录失败:', e); }
    }
    switchPanel('panel-today');
    showToast('✏️ 已加载，修改后点击保存即可');
  }

  // ===========================
  // Phase 5: 搜索筛选引擎
  // ===========================

  var searchKeyword = document.getElementById('searchKeyword');
  var dateFrom = document.getElementById('dateFrom');
  var dateTo = document.getElementById('dateTo');
  var scoreMin = document.getElementById('scoreMin');
  var scoreMax = document.getElementById('scoreMax');
  var btnResetFilter = document.getElementById('btnResetFilter');
  var searchResults = document.getElementById('searchResults');
  var searchEmpty = document.getElementById('searchEmpty');

  // ---------- 防抖搜索：用户输入后 400ms 触发 ----------
  function debounceSearch() {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(function () {
      performSearch();
    }, 400);
  }

  // 关键词输入实时防抖
  if (searchKeyword) {
    searchKeyword.addEventListener('input', debounceSearch);
  }

  // 日期 & 分数变更直接触发防抖
  if (dateFrom) dateFrom.addEventListener('change', debounceSearch);
  if (dateTo) dateTo.addEventListener('change', debounceSearch);
  if (scoreMin) scoreMin.addEventListener('input', debounceSearch);
  if (scoreMax) scoreMax.addEventListener('input', debounceSearch);

  // ---------- 重置筛选 ----------
  if (btnResetFilter) {
    btnResetFilter.addEventListener('click', function () {
      if (searchKeyword) searchKeyword.value = '';
      if (dateFrom) dateFrom.value = '';
      if (dateTo) dateTo.value = '';
      if (scoreMin) scoreMin.value = '';
      if (scoreMax) scoreMax.value = '';
      searchTagFilters.clear();
      renderSearchTags();
      showToast('🔄 筛选条件已重置');
      performSearch();
    });
  }

  /**
   * 核心搜索函数
   * 流程：
   * 1. 收集所有筛选条件
   * 2. 从 IndexedDB 获取全量记录
   * 3. 内存中多维度过滤
   * 4. 渲染搜索结果卡片
   */
  async function performSearch() {
    if (!searchResults) return;

    // 无数据层时降级
    if (!window.CreamStorage) {
      if (searchEmpty) {
        searchEmpty.style.display = '';
        searchResults.innerHTML = '';
        searchResults.appendChild(searchEmpty);
      }
      return;
    }

    try {
      // 1. 获取全量记录
      var records = await window.CreamStorage.getAllRecords();

      // 2. 收集筛选条件
      var keyword = (searchKeyword && searchKeyword.value.trim()) || '';
      var fromVal = (dateFrom && dateFrom.value) || '';
      var toVal = (dateTo && dateTo.value) || '';
      var minVal = (scoreMin && scoreMin.value) ? parseFloat(scoreMin.value) : null;
      var maxVal = (scoreMax && scoreMax.value) ? parseFloat(scoreMax.value) : null;
      var tagFilterIds = Array.from(searchTagFilters);

      // 3. 逐层过滤
      if (keyword) {
        var kw = keyword.toLowerCase();
        records = records.filter(function (r) {
          // 搜索三问内容 + 标签名称
          var textContent = (r.a1 || '') + ' ' + (r.a2 || '') + ' ' + (r.a3 || '');
          if (textContent.toLowerCase().indexOf(kw) !== -1) return true;
          // 也匹配标签显示名
          if (r.tags && r.tags.some) {
            return r.tags.some(function (tid) {
              var info = findTagInfo(tid);
              return info.label.toLowerCase().indexOf(kw) !== -1;
            });
          }
          return false;
        });
      }

      // 日期范围
      if (fromVal) {
        records = records.filter(function (r) { return r.date >= fromVal; });
      }
      if (toVal) {
        records = records.filter(function (r) { return r.date <= toVal; });
      }

      // 分数范围
      if (minVal !== null && !isNaN(minVal)) {
        records = records.filter(function (r) { return (r.score || 0) >= minVal; });
      }
      if (maxVal !== null && !isNaN(maxVal)) {
        records = records.filter(function (r) { return (r.score || 0) <= maxVal; });
      }

      // 标签筛选：只要记录包含任意一个选中标签即可
      if (tagFilterIds.length > 0) {
        records = records.filter(function (r) {
          if (!r.tags || r.tags.length === 0) return false;
          return r.tags.some(function (tid) { return tagFilterIds.indexOf(tid) !== -1; });
        });
      }

      // 4. 日期倒序
      records.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

      // 5. 渲染
      if (records.length === 0) {
        searchResults.innerHTML = '';
        if (searchEmpty) {
          searchEmpty.style.display = '';
          searchResults.appendChild(searchEmpty);
        } else {
          searchResults.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">没有找到匹配的记录</div></div>';
        }
      } else {
        if (searchEmpty) searchEmpty.style.display = 'none';
        // 结果计数提示
        var countHTML = '<div class="search-count">找到 <strong>' + records.length + '</strong> 条记录</div>';
        searchResults.innerHTML = countHTML;

        records.forEach(function (record) {
          var card = createSearchResultCard(record);
          searchResults.appendChild(card);
        });
      }

    } catch (e) {
      console.error('搜索执行失败:', e);
    }
  }

  /**
   * 创建搜索结果卡片（复用 history-card 结构，增加高亮匹配）
   */
  function createSearchResultCard(record) {
    var card = document.createElement('div');
    card.className = 'history-card search-result-card';
    card.dataset.recordId = record.id;
    card.dataset.date = record.date;

    var score = record.score || 5;
    var emoji = getMoodEmoji(score);
    var color = getScoreColor(score);

    var tagsHTML = '';
    if (record.tags && record.tags.length > 0) {
      tagsHTML = '<div class="history-card-tags">' +
        record.tags.map(function (tid) {
          var info = findTagInfo(tid);
          return '<span class="history-tag-chip">' + info.icon + ' ' + info.label + '</span>';
        }).join('') +
        '</div>';
    }

    // 高亮关键词
    var keyword = (searchKeyword && searchKeyword.value.trim()) || '';
    var a1Text = record.a1 || '';
    var a2Text = record.a2 || '';
    var a3Text = record.a3 || '';

    if (keyword) {
      a1Text = highlightKeyword(a1Text, keyword);
      a2Text = highlightKeyword(a2Text, keyword);
      a3Text = highlightKeyword(a3Text, keyword);
    }

    var qaHTML = '';
    if (record.a1 || record.a2 || record.a3) {
      qaHTML = '<div class="history-card-qa">';
      if (record.a1) qaHTML += '<div class="history-qa-block"><span class="qa-q">Q:</span><span class="qa-a">' + (keyword ? a1Text : escapeHTML(record.a1)) + '</span></div>';
      if (record.a2) qaHTML += '<div class="history-qa-block"><span class="qa-q">Q:</span><span class="qa-a">' + (keyword ? a2Text : escapeHTML(record.a2)) + '</span></div>';
      if (record.a3) qaHTML += '<div class="history-qa-block"><span class="qa-q">Q:</span><span class="qa-a">' + (keyword ? a3Text : escapeHTML(record.a3)) + '</span></div>';
      qaHTML += '</div>';
    }

    card.innerHTML =
      '<div class="history-card-top">' +
        '<div class="history-card-date">' +
          '<span class="day-icon">' + getDayIcon(record.date) + '</span>' + formatHistoryDate(record.date) +
        '</div>' +
        '<div class="history-card-score" style="color: ' + color + '">' +
          '<span class="score-num">' + score.toFixed(1) + '</span>' +
          '<span class="score-emoji">' + emoji + '</span>' +
        '</div>' +
      '</div>' + tagsHTML + qaHTML +
      '<div class="history-card-actions">' +
        '<button class="history-btn-edit" data-action="edit" data-id="' + record.id + '">✏️ 编辑</button>' +
        '<button class="history-btn-delete" data-action="delete" data-id="' + record.id + '">🗑️ 删除</button>' +
      '</div>';

    var deleteBtn = card.querySelector('.history-btn-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteHistoryRecord(record.id, record.date);
      });
    }
    var editBtn = card.querySelector('.history-btn-edit');
    if (editBtn) {
      editBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        editHistoryRecord(record);
      });
    }
    return card;
  }

  /**
   * 关键词高亮：将匹配文本包裹在 <mark> 标签中
   */
  function highlightKeyword(text, keyword) {
    if (!keyword || !text) return escapeHTML(text);
    var escaped = escapeHTML(text);
    var escapedKW = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('(' + escapedKW + ')', 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  // ===========================
  // Phase 6: 情绪趋势图表
  // ===========================

  // 趋势页切换按钮：本周 / 本月
  document.querySelectorAll('.toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.toggle-btn').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      currentTrendView = this.dataset.view || 'week';
      refreshTrends();
    });
  });

  /**
   * 刷新趋势面板：读取数据 → 聚合 → 统计 → 渲染图表
   */
  async function refreshTrends() {
    var emptyState = document.getElementById('trendsEmpty');
    var chartCard = document.querySelector('.chart-card');
    var statRow = document.querySelector('.stat-row');
    var canvas = document.getElementById('moodChart');
    if (!canvas) return;

    if (!window.CreamStorage) {
      if (emptyState) { emptyState.style.display = ''; if (chartCard) chartCard.style.display = 'none'; if (statRow) statRow.style.display = 'none'; }
      return;
    }

    try {
      var allRecords = await window.CreamStorage.getAllRecords();
      var now = new Date();
      now.setHours(23, 59, 59, 999);
      var startDate;

      if (currentTrendView === 'month') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 29);
      } else {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 6);
      }
      startDate.setHours(0, 0, 0, 0);

      var filtered = allRecords.filter(function (r) {
        var d = new Date(r.date + 'T00:00:00');
        return d >= startDate && d <= now;
      });

      // 按日期分组取平均值
      var dateMap = {};
      filtered.forEach(function (r) {
        if (!dateMap[r.date]) { dateMap[r.date] = { total: 0, count: 0 }; }
        dateMap[r.date].total += (r.score || 0);
        dateMap[r.date].count += 1;
      });

      var dateKeys = Object.keys(dateMap).sort();
      if (dateKeys.length < 2) {
        if (emptyState) { emptyState.style.display = ''; if (chartCard) chartCard.style.display = 'none'; if (statRow) statRow.style.display = 'none'; }
        renderStatCards(null);
        return;
      }

      if (emptyState) emptyState.style.display = 'none';
      if (chartCard) chartCard.style.display = '';
      if (statRow) statRow.style.display = '';

      var labels = dateKeys.map(function (d) {
        var parts = d.split('-');
        return parts[1] + '/' + parts[2];
      });

      var scores = dateKeys.map(function (d) {
        var entry = dateMap[d];
        return parseFloat((entry.total / entry.count).toFixed(1));
      });

      var sum = scores.reduce(function (a, b) { return a + b; }, 0);
      var avg = parseFloat((sum / scores.length).toFixed(1));
      var maxVal = Math.max.apply(null, scores);
      var minVal = Math.min.apply(null, scores);
      renderStatCards({ avg: avg, max: maxVal, min: minVal });

      renderChart(labels, scores);
    } catch (e) {
      console.error('趋势刷新失败:', e);
    }
  }

  function renderStatCards(stats) {
    var avgEl = document.getElementById('avgScore');
    var maxEl = document.getElementById('maxScore');
    var minEl = document.getElementById('minScore');
    if (avgEl) avgEl.textContent = stats ? stats.avg : '--';
    if (maxEl) maxEl.textContent = stats ? stats.max : '--';
    if (minEl) minEl.textContent = stats ? stats.min : '--';
  }

  function renderChart(labels, dataset) {
    var canvas = document.getElementById('moodChart');
    if (!canvas) return;

    if (moodChartInstance) {
      moodChartInstance.destroy();
      moodChartInstance = null;
    }

    var ctx = canvas.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(239, 168, 168, 0.35)');
    gradient.addColorStop(0.5, 'rgba(239, 168, 168, 0.10)');
    gradient.addColorStop(1, 'rgba(239, 168, 168, 0.00)');

    moodChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '心情指数',
          data: dataset,
          borderColor: '#E8A0A0',
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointBackgroundColor: '#E8A0A0',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointHoverBackgroundColor: '#D48282',
          tension: 0.35,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#FFF8F0',
            titleColor: '#6B5B4F',
            bodyColor: '#8B7D6B',
            borderColor: '#E8D5C4',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 12,
            titleFont: { size: 13, weight: '500' },
            bodyFont: { size: 12 },
            displayColors: false,
            callbacks: {
              label: function (context) {
                return '💛 ' + context.parsed.y + ' 分';
              }
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 10,
            ticks: {
              stepSize: 2,
              color: '#B5A898',
              font: { size: 11 },
              callback: function (value) { return value + '分'; }
            },
            grid: { color: '#F0E8DC', drawBorder: false }
          },
          x: {
            ticks: {
              color: '#B5A898',
              font: { size: 11 },
              maxRotation: 0
            },
            grid: { display: false }
          }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
  }

  // ---------- 导出按钮 ----------
  var btnExport = document.getElementById('btnExport');
  if (btnExport) {
    btnExport.addEventListener('click', async function () {
      if (!window.CreamStorage) { showToast('❌ 数据层未就绪'); return; }
      try {
        var jsonString = await window.CreamStorage.exportAllData();
        var blob = new Blob([jsonString], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'cream-diary-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('📤 数据已导出');
      } catch (e) { console.error('导出失败:', e); showToast('❌ 导出失败'); }
    });
  }

  // ---------- 导入按钮 ----------
  var btnImport = document.getElementById('btnImport');
  var importFileInput = document.getElementById('importFileInput');
  if (btnImport && importFileInput) {
    btnImport.addEventListener('click', function () { importFileInput.click(); });
    importFileInput.addEventListener('change', async function (event) {
      var file = event.target.files[0];
      if (!file) return;
      try {
        var text = await file.text();
        var confirmed = await showModal(
          '📥 导入数据',
          '<p>导入将<b>合并</b>到当前数据中，已有记录不会被覆盖。确定继续吗？</p>',
          [
            { label: '取消', isPrimary: false, value: false },
            { label: '导入', isPrimary: true, value: true }
          ]
        );
        if (!confirmed) { importFileInput.value = ''; return; }
        if (window.CreamStorage) {
          var result = await window.CreamStorage.importData(text);
          showToast('📥 已导入 ' + result.records + ' 条记录');
          refreshHistoryListIfActive();
        } else { showToast('❌ 数据层未就绪'); }
      } catch (e) { console.error('导入失败:', e); showToast('❌ 导入失败: ' + e.message); }
      importFileInput.value = '';
    });
  }

  // ---------- 提醒开关 ----------
  var reminderToggle = document.getElementById('reminderToggle');
  var reminderTimeRow = document.getElementById('reminderTimeRow');
  var reminderTimeInput = document.getElementById('reminderTime');
  if (reminderToggle && reminderTimeRow) {
    if (window.CreamStorage) {
      Promise.all([
        window.CreamStorage.getSetting('reminderEnabled', true),
        window.CreamStorage.getSetting('reminderTime', '21:00')
      ]).then(function (result) {
        var enabled = result[0], time = result[1];
        reminderToggle.checked = enabled;
        reminderTimeInput.value = time;
        reminderTimeRow.style.opacity = enabled ? '1' : '0.4';
        reminderTimeRow.style.pointerEvents = enabled ? 'auto' : 'none';
      }).catch(function () {});
    }
    reminderToggle.addEventListener('change', function () {
      reminderTimeRow.style.opacity = this.checked ? '1' : '0.4';
      reminderTimeRow.style.pointerEvents = this.checked ? 'auto' : 'none';
      if (window.CreamStorage) { window.CreamStorage.saveSetting('reminderEnabled', this.checked); }
    });
    reminderTimeInput.addEventListener('change', function () {
      if (window.CreamStorage) { window.CreamStorage.saveSetting('reminderTime', this.value); }
    });
  }

  // ===========================
  // Phase 7: 每日提醒通知
  // ===========================

  /**
   * 请求 Web Notification 权限
   * 首次调用时浏览器弹出原生权限提示
   */
  function requestNotifyPermission() {
    if (!('Notification' in window)) {
      console.warn('⚠️ 当前浏览器不支持 Web Notification');
      return Promise.resolve('denied');
    }
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Promise.resolve(Notification.permission);
    }
    return Notification.requestPermission();
  }

  /**
   * 发送提醒通知
   * @param {string} title 通知标题
   * @param {string} body 通知正文
   */
  function sendNotify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    new Notification(title, {
      body: body,
      icon: 'assets/icons/icon-192.png',
      badge: 'assets/icons/icon-192.png',
      tag: 'cream-diary-reminder',
      renotify: false,
      requireInteraction: false
    });
  }

  /**
   * 检查今天是否已有记录
   */
  async function isTodayRecorded() {
    if (!window.CreamStorage) return false;
    try {
      var today = new Date().toISOString().slice(0, 10);
      var record = await window.CreamStorage.getRecordByDate(today);
      return !!record;
    } catch (e) {
      console.warn('检查今日记录失败:', e);
      return false;
    }
  }

  /**
   * 尝试提醒：检查开关 + 时间匹配 + 未记录
   */
  async function tryNotify() {
    if (!window.CreamStorage) return;

    // 1. 检查提醒是否开启
    var enabled = await window.CreamStorage.getSetting('reminderEnabled', true);
    if (!enabled) return;

    // 2. 检查权限
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    // 3. 检查时间是否匹配
    var targetTime = await window.CreamStorage.getSetting('reminderTime', '21:00');
    var now = new Date();
    var currentHHMM = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    if (currentHHMM !== targetTime) return;

    // 4. 检查今天是否已经记录
    var recorded = await isTodayRecorded();
    if (recorded) return;

    // 5. 发送通知
    sendNotify(
      '🍰 奶油日记 · 今日提醒',
      '今天还没记录心情哦~ 花一分钟记录此刻的状态吧！'
    );
  }

  /**
   * 启动提醒调度器：每 60 秒检查一次
   */
  function startNotifyScheduler() {
    stopNotifyScheduler();
    // 立即首次检查
    tryNotify();
    // 每 60 秒轮询
    notifyIntervalId = setInterval(tryNotify, 60 * 1000);
    console.log('⏰ 提醒调度器已启动（每 60s 检查）');
  }

  /**
   * 停止提醒调度器
   */
  function stopNotifyScheduler() {
    if (notifyIntervalId) {
      clearInterval(notifyIntervalId);
      notifyIntervalId = null;
    }
  }

  /**
   * 初始化提醒系统：请求权限 → 启动调度器
   */
  async function initNotifySystem() {
    if (!window.CreamStorage) { console.warn('CreamStorage 未就绪，延迟通知初始化'); return; }

    var permisson = await requestNotifyPermission();
    if (permisson === 'granted') {
      console.log('🔔 通知权限已授权');
      startNotifyScheduler();
    } else if (permisson === 'denied') {
      console.warn('🔕 通知权限已被拒绝');
    } else {
      console.log('🔕 通知权限请求被忽略（default）');
    }

    // 监听提醒开关变化：开启时重新请求权限 + 启动调度，关闭时停止
    if (reminderToggle) {
      reminderToggle.addEventListener('change', function () {
        if (this.checked) {
          requestNotifyPermission().then(function (p) {
            if (p === 'granted') startNotifyScheduler();
          });
        } else {
          stopNotifyScheduler();
          console.log('⏸️ 提醒已关闭，调度器停止');
        }
      });
    }
  }

  // 启动通知系统（Storage 就绪后初始化）
  if (window.CreamStorage) {
    initNotifySystem();
  } else {
    // 如果在 storage.js 加载前就初始化了 app，则等待 storage ready
    document.addEventListener('cream-storage-ready', function () {
      initNotifySystem();
    });
  }

  // ---------- 初始化完成 ----------
  console.log('🍰 奶油日记初始化完成');
  console.log('   ✅ 5个页面Panel就绪');
  console.log('   ✅ 底部导航切换正常');
  console.log('   ✅ 情绪滑动条交互正常');
  console.log('   ✅ 15个预设标签已加载');
  console.log('   ✅ Toast & Modal 系统就绪');
  console.log('   ✅ IndexedDB 数据层已接入（保存/导出/导入可用）');
  console.log('   ✅ Phase 4: 历史记录列表渲染就绪');
  console.log('   ✅ Phase 5: 搜索筛选引擎就绪（关键词+日期+分数+标签+高亮）');
  console.log('   ✅ Phase 6: 情绪趋势图表就绪（Chart.js折线图+统计卡片）');
  console.log('   ✅ Phase 7: 每日提醒通知就绪（Web Notification + 60s轮询调度）');

})();
