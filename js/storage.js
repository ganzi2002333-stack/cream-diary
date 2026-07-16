// ============================================================
// 奶油日记 · IndexedDB 数据层封装
// Phase 3: DBManager + CRUD 操作
// ============================================================

(function () {
  'use strict';

  const DB_NAME = 'cream-diary';
  const DB_VERSION = 1;
  const STORE_RECORDS = 'records';
  const STORE_TAGS = 'tags';
  const STORE_SETTINGS = 'settings';

  // ---------- 数据库单例 ----------
  let db = null;
  let dbReady = null; // Promise，外部 await 用

  /**
   * 打开/初始化数据库
   * @returns {Promise<IDBDatabase>}
   */
  function openDB() {
    if (dbReady) return dbReady;
    if (db) return Promise.resolve(db);

    dbReady = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // 首次创建或版本升级
      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // ---- records 表 ----
        if (!database.objectStoreNames.contains(STORE_RECORDS)) {
          const recordsStore = database.createObjectStore(STORE_RECORDS, {
            keyPath: 'id'
          });
          recordsStore.createIndex('date', 'date', { unique: false });
          recordsStore.createIndex('score', 'score', { unique: false });
          // multiEntry: 数组字段的每个元素都会建立索引
          recordsStore.createIndex('tags', 'tags', {
            unique: false,
            multiEntry: true
          });
        }

        // ---- tags 表 ----
        if (!database.objectStoreNames.contains(STORE_TAGS)) {
          const tagsStore = database.createObjectStore(STORE_TAGS, {
            keyPath: 'id'
          });
          tagsStore.createIndex('name', 'name', { unique: true });
        }

        // ---- settings 表 ----
        if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
          database.createObjectStore(STORE_SETTINGS, {
            keyPath: 'key'
          });
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        console.log('🗄️ IndexedDB 初始化成功:', DB_NAME);
        resolve(db);
      };

      request.onerror = (event) => {
        console.error('❌ IndexedDB 初始化失败:', event.target.error);
        reject(event.target.error);
      };

      request.onblocked = () => {
        console.warn('⚠️ 数据库升级被阻塞，请关闭其他标签页');
      };
    });

    return dbReady;
  }

  // ---------- 通用辅助 ----------

  /**
   * 生成简易 UUID
   */
  function generateId() {
    return 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  }

  /**
   * Promise 封装事务操作
   * @param {string} storeName - 表名
   * @param {'readonly'|'readwrite'} mode
   * @param {function} callback - (store) => IDBRequest
   * @returns {Promise}
   */
  function dbTransaction(storeName, mode, callback) {
    return openDB().then((database) => {
      return new Promise((resolve, reject) => {
        const tx = database.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        const request = callback(store);

        if (!request) {
          reject(new Error('事务回调未返回 request'));
          return;
        }

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  }

  // ============================================================
  //  Records CRUD
  // ============================================================

  /**
   * 保存一条情绪记录（新增或更新）
   * @param {Object} record
   * @returns {Promise<string>} 记录 id
   */
  function saveRecord(record) {
    return openDB().then((database) => {
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_RECORDS, 'readwrite');
        const store = tx.objectStore(STORE_RECORDS);

        // 补全字段
        const now = new Date().toISOString();
        const data = {
          id: record.id || generateId(),
          date: record.date || new Date().toISOString().slice(0, 10),
          score: record.score ?? 5.0,
          tags: record.tags || [],
          q1: record.q1 || '',
          a1: record.a1 || '',
          q2: record.q2 || '',
          a2: record.a2 || '',
          q3: record.q3 || '',
          a3: record.a3 || '',
          createdAt: record.createdAt || now,
          updatedAt: now
        };

        const request = store.put(data);

        request.onsuccess = () => {
          console.log('💾 记录已保存:', data.id, '日期:', data.date);
          resolve(data.id);
        };

        request.onerror = () => {
          console.error('❌ 保存记录失败:', request.error);
          reject(request.error);
        };
      });
    });
  }

  /**
   * 根据日期获取当天的记录
   * @param {string} date - 'YYYY-MM-DD'
   * @returns {Promise<Object|null>}
   */
  function getRecordByDate(date) {
    return dbTransaction(STORE_RECORDS, 'readonly', (store) => {
      const index = store.index('date');
      return index.get(date);
    });
  }

  /**
   * 根据 ID 获取记录
   * @param {string} id
   * @returns {Promise<Object|undefined>}
   */
  function getRecordById(id) {
    return dbTransaction(STORE_RECORDS, 'readonly', (store) => {
      return store.get(id);
    });
  }

  /**
   * 获取所有记录（按日期降序）
   * @param {Object} [options]
   * @param {string} [options.startDate] - 'YYYY-MM-DD'
   * @param {string} [options.endDate]
   * @param {number} [options.minScore]
   * @param {number} [options.maxScore]
   * @param {Array<string>} [options.tags] - 标签筛选
   * @param {string} [options.keyword] - 关键词搜索（匹配 q1/a1/q2/a2/q3/a3）
   * @param {number} [options.limit]
   * @param {number} [options.offset]
   * @returns {Promise<Array<Object>>}
   */
  function getAllRecords(options = {}) {
    return dbTransaction(STORE_RECORDS, 'readonly', (store) => {
      // 如果有日期范围，使用 date 索引
      let index;
      if (options.startDate && options.endDate) {
        index = store.index('date');
        const range = IDBKeyRange.bound(options.startDate, options.endDate);
        return index.openCursor(range, 'prev');
      } else if (options.startDate) {
        index = store.index('date');
        const range = IDBKeyRange.lowerBound(options.startDate);
        return index.openCursor(range, 'prev');
      } else if (options.endDate) {
        index = store.index('date');
        const range = IDBKeyRange.upperBound(options.endDate);
        return index.openCursor(range, 'prev');
      } else {
        // 无日期筛选，使用主键遍历（按插入顺序）
        return store.openCursor(null, 'prev');
      }
    }).then((results) => {
      // 游标结果已在 dbTransaction 的 onsuccess 中处理
      // 实际上游标模式需要特殊处理
      return queryRecords(options);
    });
  }

  /**
   * 游标查询（内部方法）
   */
  function queryRecords(options = {}) {
    return openDB().then((database) => {
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_RECORDS, 'readonly');
        const store = tx.objectStore(STORE_RECORDS);
        const results = [];

        let request;
        if (options.startDate || options.endDate) {
          const index = store.index('date');
          let range;
          if (options.startDate && options.endDate) {
            range = IDBKeyRange.bound(options.startDate, options.endDate);
          } else if (options.startDate) {
            range = IDBKeyRange.lowerBound(options.startDate);
          } else {
            range = IDBKeyRange.upperBound(options.endDate);
          }
          request = index.openCursor(range, 'prev');
        } else {
          request = store.openCursor(null, 'prev');
        }

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const record = cursor.value;

            // 内存过滤
            let pass = true;

            // 分数范围过滤
            if (options.minScore !== undefined && record.score < options.minScore) pass = false;
            if (options.maxScore !== undefined && record.score > options.maxScore) pass = false;

            // 标签过滤
            if (pass && options.tags && options.tags.length > 0) {
              const recordTags = record.tags || [];
              pass = options.tags.some(t => recordTags.includes(t));
            }

            // 关键词过滤
            if (pass && options.keyword) {
              const kw = options.keyword.toLowerCase();
              const searchText = [
                record.q1, record.a1,
                record.q2, record.a2,
                record.q3, record.a3
              ].join(' ').toLowerCase();
              pass = searchText.includes(kw);
            }

            if (pass) results.push(record);

            // 分页
            if (options.limit && results.length >= options.limit) {
              resolve(results);
              return;
            }

            cursor.continue();
          } else {
            // 游标耗尽，应用 offset
            if (options.offset) {
              resolve(results.slice(options.offset));
            } else {
              resolve(results);
            }
          }
        };

        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * 删除记录
   * @param {string} id
   * @returns {Promise<void>}
   */
  function deleteRecord(id) {
    return dbTransaction(STORE_RECORDS, 'readwrite', (store) => {
      return store.delete(id);
    });
  }

  /**
   * 获取记录总数
   * @returns {Promise<number>}
   */
  function getRecordCount() {
    return dbTransaction(STORE_RECORDS, 'readonly', (store) => {
      return store.count();
    });
  }

  /**
   * 批量获取统计用的记录（带日期范围和分数范围）
   * @param {string} startDate
   * @param {string} endDate
   * @returns {Promise<Array<{date: string, score: number}>>}
   */
  function getRecordsForChart(startDate, endDate) {
    return queryRecords({ startDate, endDate }).then(records => {
      return records.map(r => ({
        date: r.date,
        score: r.score,
        tags: r.tags
      }));
    });
  }

  // ============================================================
  //  Tags CRUD
  // ============================================================

  /**
   * 获取所有自定义标签
   * @returns {Promise<Array<Object>>}
   */
  function getAllTags() {
    return dbTransaction(STORE_TAGS, 'readonly', (store) => {
      return store.getAll();
    });
  }

  /**
   * 保存自定义标签
   * @param {Object} tag
   * @returns {Promise<string>} tag id
   */
  function saveTag(tag) {
    return openDB().then((database) => {
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_TAGS, 'readwrite');
        const store = tx.objectStore(STORE_TAGS);

        const data = {
          id: tag.id || generateId(),
          name: tag.name,
          color: tag.color || '#E8D5B7',
          isPreset: tag.isPreset || false,
          createdAt: tag.createdAt || new Date().toISOString()
        };

        const request = store.put(data);
        request.onsuccess = () => resolve(data.id);
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * 删除自定义标签
   * @param {string} id
   * @returns {Promise<void>}
   */
  function deleteTag(id) {
    return dbTransaction(STORE_TAGS, 'readwrite', (store) => {
      return store.delete(id);
    });
  }

  // ============================================================
  //  Settings CRUD
  // ============================================================

  /**
   * 获取设置项
   * @param {string} key
   * @param {*} [defaultValue]
   * @returns {Promise<*>}
   */
  function getSetting(key, defaultValue = null) {
    return dbTransaction(STORE_SETTINGS, 'readonly', (store) => {
      return store.get(key);
    }).then((result) => {
      return result ? result.value : defaultValue;
    }).catch(() => defaultValue);
  }

  /**
   * 保存设置项
   * @param {string} key
   * @param {*} value
   * @returns {Promise<void>}
   */
  function saveSetting(key, value) {
    return openDB().then((database) => {
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_SETTINGS);
        const request = store.put({ key, value });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  }

  /**
   * 批量获取设置
   * @returns {Promise<Object>} 键值对
   */
  function getAllSettings() {
    return dbTransaction(STORE_SETTINGS, 'readonly', (store) => {
      return store.getAll();
    }).then((entries) => {
      const settings = {};
      entries.forEach(e => { settings[e.key] = e.value; });
      return settings;
    });
  }

  // ============================================================
  //  数据导出 / 导入
  // ============================================================

  /**
   * 导出所有数据为 JSON 字符串
   * @returns {Promise<string>}
   */
  function exportAllData() {
    return Promise.all([
      getAllRecords(),
      getAllTags(),
      getAllSettings()
    ]).then(([records, tags, settings]) => {
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        app: 'cream-diary',
        records,
        tags,
        settings
      };
      return JSON.stringify(exportData, null, 2);
    });
  }

  /**
   * 导入 JSON 数据
   * @param {string} jsonString
   * @returns {Promise<{records: number, tags: number, settings: number}>}
   */
  function importData(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
      if (data.app !== 'cream-diary') {
        throw new Error('文件格式不匹配：不是奶油日记的导出文件');
      }
    } catch (e) {
      return Promise.reject(new Error('JSON 解析失败: ' + e.message));
    }

    return openDB().then((database) => {
      return new Promise((resolve, reject) => {
        const tx = database.transaction(
          [STORE_RECORDS, STORE_TAGS, STORE_SETTINGS],
          'readwrite'
        );

        let recordsCount = 0;
        let tagsCount = 0;
        let settingsCount = 0;

        // 导入 records
        const recordsStore = tx.objectStore(STORE_RECORDS);
        (data.records || []).forEach(record => {
          recordsStore.put(record);
          recordsCount++;
        });

        // 导入 tags
        const tagsStore = tx.objectStore(STORE_TAGS);
        (data.tags || []).forEach(tag => {
          tagsStore.put(tag);
          tagsCount++;
        });

        // 导入 settings
        const settingsStore = tx.objectStore(STORE_SETTINGS);
        (data.settings || []).forEach(setting => {
          settingsStore.put(setting);
          settingsCount++;
        });

        tx.oncomplete = () => {
          console.log(`📥 导入完成: ${recordsCount} 条记录, ${tagsCount} 个标签, ${settingsCount} 项设置`);
          resolve({ records: recordsCount, tags: tagsCount, settings: settingsCount });
        };

        tx.onerror = () => reject(tx.error);
      });
    });
  }

  /**
   * 清空所有数据（危险操作）
   * @returns {Promise<void>}
   */
  function clearAllData() {
    return openDB().then((database) => {
      return new Promise((resolve, reject) => {
        const tx = database.transaction(
          [STORE_RECORDS, STORE_TAGS, STORE_SETTINGS],
          'readwrite'
        );

        tx.objectStore(STORE_RECORDS).clear();
        tx.objectStore(STORE_TAGS).clear();
        tx.objectStore(STORE_SETTINGS).clear();

        tx.oncomplete = () => {
          console.log('🗑️ 所有数据已清空');
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    });
  }

  // ============================================================
  //  暴露全局 API
  // ============================================================
  window.CreamStorage = {
    // 初始化
    openDB,

    // Records
    saveRecord,
    getRecordByDate,
    getRecordById,
    getAllRecords,
    deleteRecord,
    getRecordCount,
    getRecordsForChart,

    // Tags
    getAllTags,
    saveTag,
    deleteTag,

    // Settings
    getSetting,
    saveSetting,
    getAllSettings,

    // 导入导出
    exportAllData,
    importData,
    clearAllData,

    // 常量
    DB_NAME,
    DB_VERSION
  };

  console.log('🍰 CreamStorage 模块已加载（IndexedDB 数据层）');

  // 派发就绪事件，供 app.js 监听
  document.dispatchEvent(new CustomEvent('cream-storage-ready'));

})();
