/* ============================================================
 * 估分历史记录本地存储（H5 / APK 版）
 * 说明：H5/APK 版无云数据库，记录保存在本地 localStorage
 * ============================================================ */
(function (global) {
  'use strict';

  var LOCAL_KEY = 'score_records_local';
  var MAX_LOCAL = 100;

  function loadLocal() {
    try {
      var list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocal(record) {
    var list = loadLocal();
    var item = Object.assign({}, record, {
      _localKey: 'local_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      createdAt: record.createdAt || new Date().toISOString()
    });
    list.unshift(item);
    var trimmed = list.slice(0, MAX_LOCAL);
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(trimmed));
    } catch (e) { /* 存储空间不足时忽略 */ }
    return trimmed;
  }

  function deleteLocal(localKey) {
    var list = loadLocal().filter(function (item) { return item._localKey !== localKey; });
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    } catch (e) { /* 忽略 */ }
    return list;
  }

  function clearLocal() {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch (e) { /* 忽略 */ }
  }

  function formatTime(ts) {
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  global.RecordStore = {
    LOCAL_KEY: LOCAL_KEY,
    loadLocal: loadLocal,
    saveLocal: saveLocal,
    deleteLocal: deleteLocal,
    clearLocal: clearLocal,
    formatTime: formatTime
  };
})(typeof window !== 'undefined' ? window : this);