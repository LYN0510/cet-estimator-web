/* ============================================================
 * 四六级估分器 - 页面逻辑（H5 / APK 版）
 * 单页应用：Home / Input / Result / History 四个视图
 * ============================================================ */
(function () {
  'use strict';

  var SE = window.ScoreEngine;

  /** 全局状态（与小程序端各页面 data 对应） */
  var state = {
    type: '',
    difficultyKey: 'normal',
    customCoef: '',
    showCustom: false,
    mode: 'neutral',
    config: null,
    answers: null,
    writingLevel: 3,
    translationLevel: 3,
    result: null
  };

  /* ---------- DOM 工具 ---------- */
  function $(id) { return document.getElementById(id); }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function toast(title) {
    var t = el('div', 'toast', title);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('hide'); setTimeout(function () { t.remove(); }, 300); }, 1800);
  }

  function showView(name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    $('view-' + name).classList.add('active');
    window.scrollTo(0, 0);
  }

  /* ---------- 首页 ---------- */
  var App = {

    pickType: function (key) {
      state.type = key;
      $('type-cet4').classList.toggle('active', key === 'cet4');
      $('type-cet6').classList.toggle('active', key === 'cet6');
    },

    pickDifficulty: function (key) {
      state.difficultyKey = key;
      ['easy', 'normal', 'hard', 'custom'].forEach(function (k) {
        $('diff-' + k).classList.toggle('active', key === k);
      });
      $('coef-row').classList.toggle('hidden', key !== 'custom');
      $('diff-hint').classList.toggle('hidden', key === 'custom');
    },

    pickMode: function (key) {
      state.mode = key;
      ['conservative', 'neutral', 'optimistic'].forEach(function (k) {
        $('mode-' + k).classList.toggle('active', key === k);
      });
    },

    /** 开始估分：校验后进入输入页 */
    startEstimate: function () {
      if (!state.type) {
        toast('请先选择考试类型');
        return;
      }
      var coefficient, difficultyLabel;
      if (state.difficultyKey === 'custom') {
        coefficient = Number($('coef-input').value);
        if (!isFinite(coefficient) || coefficient < SE.COEFFICIENT_MIN || coefficient > SE.COEFFICIENT_MAX) {
          toast('难度系数需在 ' + SE.COEFFICIENT_MIN + '~' + SE.COEFFICIENT_MAX + ' 之间');
          return;
        }
        difficultyLabel = '自定义 ×' + coefficient.toFixed(2);
      } else {
        var preset = SE.DIFFICULTY_PRESETS.find(function (p) { return p.key === state.difficultyKey; });
        coefficient = preset.value;
        difficultyLabel = preset.label;
      }

      state.coefficient = coefficient;
      state.difficultyLabel = difficultyLabel;
      this.renderInputView();
      showView('input');
    },

    /* ---------- 输入页 ---------- */
    renderInputView: function () {
      var cfg = SE.buildInputConfig(state.type);
      state.config = cfg;
      state.answers = SE.buildAnswers(state.type);
      state.writingLevel = 3;
      state.translationLevel = 3;

      $('s-type').textContent = cfg.typeLabel + '级';
      $('s-diff').textContent = state.difficultyLabel + ' ×' + state.coefficient.toFixed(2);
      $('s-mode').textContent = SE.MODES[state.mode].label;

      this.buildGroupRows('listen-groups', 'listening', cfg.listeningGroups);
      this.buildGroupRows('read-groups', 'reading', cfg.readingGroups);
      this.buildLevelChips('writing-levels', 'writing');
      this.buildLevelChips('trans-levels', 'translation');
      this.updateSums();
    },

    /** 动态渲染小组步进行 */
    buildGroupRows: function (wrapId, part, groups) {
      var wrap = $(wrapId);
      wrap.innerHTML = '';
      var self = this;
      groups.forEach(function (g) {
        var row = el('div', 'group-row');
        var info = el('div', 'group-info',
          '<span class="group-name">' + g.name + '</span><span class="group-count">共 ' + g.count + ' 题</span>');
        row.appendChild(info);

        // 步进器：减号 / 输入 / 加号
        var stepper = el('div', 'stepper');
        var minus = el('button', 'stepper-btn', '−');
        minus.type = 'button';
        var input = el('input', 'stepper-input');
        input.type = 'number';
        input.value = '0';
        input.min = '0';
        input.max = String(g.count);
        var plus = el('button', 'stepper-btn', '＋');
        plus.type = 'button';

        var self2 = this;
        var setValue = function (v) {
          v = Math.min(Math.max(Math.floor(Number(v) || 0), 0), g.count);
          state.answers[part][g.key] = v;
          input.value = String(v);
          minus.disabled = v <= 0;
          plus.disabled = v >= g.count;
        };
        minus.onclick = function () { setValue(state.answers[part][g.key] - 1); self.updateSums(); };
        plus.onclick = function () { setValue(state.answers[part][g.key] + 1); self.updateSums(); };
        input.oninput = function () { setValue(input.value); self.updateSums(); };
        input.onblur = function () { setValue(input.value); self.updateSums(); };
        setValue(0);

        stepper.appendChild(minus);
        stepper.appendChild(input);
        stepper.appendChild(plus);
        row.appendChild(stepper);
        wrap.appendChild(row);
      });
    },

    /** 动态渲染档位单选 chips */
    buildLevelChips: function (wrapId, part) {
      var wrap = $(wrapId);
      wrap.innerHTML = '';
      var self = this;
      SE.LEVEL_RATIOS.forEach(function (ratio, i) {
        var chip = el('div', 'level-chip',
          '<span class="level-label">' + (i + 1) + ' 档</span><span class="level-pct">' +
          Math.round(ratio * 100) + '%</span>');
        chip.onclick = function () {
          if (part === 'writing') state.writingLevel = i + 1;
          else state.translationLevel = i + 1;
          self.refreshLevelChips();
        };
        wrap.appendChild(chip);
      });
    },

    refreshLevelChips: function () {
      var self = this;
      [['writing-levels', 'writing'], ['trans-levels', 'translation']].forEach(function (pair) {
        Array.prototype.forEach.call($(pair[0]).children, function (chip, i) {
          var cur = pair[1] === 'writing' ? state.writingLevel : state.translationLevel;
          chip.classList.toggle('active', i + 1 === cur);
        });
      });
    },

    /** 更新听力/阅读小组合计 */
    updateSums: function () {
      var sumPart = function (part) {
        return Object.values(state.answers[part]).reduce(function (s, n) { return s + (Number(n) || 0); }, 0);
      };
      var cfg = state.config;
      $('listen-sum').textContent = '听力合计：' + sumPart('listening') + ' / ' + cfg.listeningCount + ' 题';
      $('read-sum').textContent = '阅读合计：' + sumPart('reading') + ' / ' + cfg.readingCount + ' 题';
    },

    /** 提交估分（本地计算） */
    submitEstimate: function () {
      var btn = $('submit-btn');
      if (btn.disabled) return;

      var params = {
        type: state.type,
        answers: state.answers,
        writingLevel: state.writingLevel,
        translationLevel: state.translationLevel,
        coefficient: state.coefficient,
        mode: state.mode
      };

      try {
        var err = SE.validate(params);
        if (err) { toast(err); return; }
      } catch (e) {
        toast(e.message || '输入有误');
        return;
      }

      btn.disabled = true;
      btn.textContent = '计算中…';
      setTimeout(function () {
        var result = SE.calculate(params);
        result.source = 'local';
        state.result = result;
        btn.disabled = false;
        btn.textContent = '提交估分';
        App.renderResultView();
        showView('result');
      }, 300);
    },

    /* ---------- 结果页 ---------- */
    renderResultView: function () {
      var r = state.result;

      // 总分卡片
      $('score-card').innerHTML =
        '<div class="score-label">预计总分</div>' +
        '<div class="score-num ' + (r.pass ? 'pass-color' : '') + '">' + r.total + '</div>' +
        '<div class="score-full">满分 710 分</div>' +
        '<div class="score-tags">' +
        '<span class="tag">' + r.typeLabel + '级</span>' +
        '<span class="tag">' + r.difficultyLabel + ' ×' + r.coefficient + '</span>' +
        '<span class="tag">' + r.modeLabel + '</span>' +
        '</div>' +
        '<div class="pass ' + (r.pass ? 'pass-yes' : 'pass-no') + '">' +
        (r.pass ? '✅ 预计通过' : '❌ 预计未通过') + '</div>' +
        '<div class="probability">通过概率：<span class="probability-text">' + r.probabilityLabel + '</span></div>' +
        '<div class="source-note">📱 本地估算（APK 内置计算引擎）</div>';

      // 各部分得分
      var list = $('sections-list');
      list.innerHTML = '';
      r.sections.forEach(function (s) {
        var other = s.key === 'writing' || s.key === 'translation';
        var row = el('div', 'section-row');
        row.innerHTML =
          '<div class="sec-header"><span class="sec-name">' + s.name + '</span>' +
          '<span class="sec-correct">' + s.correctText + '</span></div>' +
          '<div class="bar"><div class="bar-inner' + (other ? ' bar-other' : '') + '" style="width:' +
          (s.rate * 100) + '%"></div></div>' +
          '<div class="sec-meta"><span class="sec-raw">原始分：' + s.rawText + '</span>' +
          '<span class="sec-score">赋分后：' + s.scoreText + ' / ' + s.weight + ' 分</span></div>';
        list.appendChild(row);
      });

      // 备考建议
      var advice = $('advice-box');
      advice.innerHTML =
        '<div class="advice-item"><span class="advice-tag primary">重点</span>' +
        '<span class="advice-text">' + r.advicePrimary + '</span></div>' +
        (r.adviceSecondary
          ? '<div class="advice-item"><span class="advice-tag">次重点</span>' +
            '<span class="advice-text">' + r.adviceSecondary + '</span></div>'
          : '');

      // 雷达图（等 onload 后绘制）
      requestAnimationFrame(function () { App.drawRadar(r.sections); });
    },

    /** 四轴雷达图（原生 Canvas） */
    drawRadar: function (sections) {
      var canvas = $('radar-canvas');
      var ctx = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      var cx = w / 2, cy = h / 2, R = 92, n = 4;
      var labels = sections.map(function (s) { return s.name; });
      var values = sections.map(function (s) { return Math.max(0, Math.min(1, s.rate || 0)); });

      var angle = function (i) { return -Math.PI / 2 + (2 * Math.PI * i) / n; };
      var point = function (i, r) {
        return { x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) };
      };

      ctx.clearRect(0, 0, w, h);

      // 网格环
      for (var ring = 1; ring <= 4; ring++) {
        var rr = (R * ring) / 4;
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
          var p = point(i, rr);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 轴线 + 标签
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var j = 0; j < n; j++) {
        var pj = point(j, R);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(pj.x, pj.y);
        ctx.strokeStyle = '#cbd5e1';
        ctx.stroke();
        var lp = point(j, R + 26);
        ctx.fillStyle = '#475569';
        ctx.fillText(labels[j] + ' ' + Math.round(values[j] * 100) + '%', lp.x, lp.y);
      }

      // 数据多边形
      ctx.beginPath();
      for (var k = 0; k < n; k++) {
        var pk = point(k, R * values[k]);
        if (k === 0) ctx.moveTo(pk.x, pk.y); else ctx.lineTo(pk.x, pk.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 顶点圆点
      for (var m = 0; m < n; m++) {
        var pm = point(m, R * values[m]);
        ctx.beginPath();
        ctx.arc(pm.x, pm.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
      }
    },

    /** 保存记录（本地） */
    saveRecord: function () {
      if (!state.result) return;
      var r = state.result;
      var recordData = {
        type: r.type,
        typeLabel: r.typeLabel,
        coefficient: r.coefficient,
        difficultyLabel: r.difficultyLabel,
        mode: r.mode,
        modeLabel: r.modeLabel,
        total: r.total,
        pass: r.pass,
        probabilityLabel: r.probabilityLabel,
        sections: r.sections.map(function (s) {
          return {
            key: s.key, name: s.name, correctText: s.correctText,
            rawText: s.rawText, scoreText: s.scoreText, weight: s.weight
          };
        }),
        createdAt: new Date().toISOString()
      };
      RecordStore.saveLocal(recordData);
      toast('已保存记录');
    },

    restart: function () {
      state.type = '';
      state.difficultyKey = 'normal';
      state.customCoef = '';
      state.result = null;
      this.renderHomeFeatures();
      showView('home');
    },

    /** 复位首页选中态 */
    renderHomeFeatures: function () {
      ['cet4', 'cet6'].forEach(function (k) { $('type-' + k).classList.remove('active'); });
      ['easy', 'normal', 'hard', 'custom'].forEach(function (k) {
        $('diff-' + k).classList.toggle('active', k === state.difficultyKey);
      });
      $('coef-row').classList.toggle('hidden', state.difficultyKey !== 'custom');
      $('coef-input').value = state.customCoef;
      $('diff-hint').classList.toggle('hidden', state.difficultyKey === 'custom');
      ['conservative', 'neutral', 'optimistic'].forEach(function (k) {
        $('mode-' + k).classList.toggle('active', k === state.mode);
      });
    },

    goHome: function () {
      state.type = '';
      this.renderHomeFeatures();
      showView('home');
    },

    /* ---------- 历史记录 ---------- */
    goHistory: function () {
      this.renderHistory();
      showView('history');
    },

    /** 与上一条同类型记录的对比摘要 */
    buildDiffText: function (item, prev) {
      var diffs = [];
      (item.sections || []).forEach(function (sec) {
        var prevSec = (prev.sections || []).find(function (p) { return p.key === sec.key; });
        if (!prevSec) return;
        var cur = Number(sec.scoreText);
        var old = Number(prevSec.scoreText);
        if (isFinite(cur) && isFinite(old) && cur !== old) {
          var delta = cur - old;
          diffs.push(sec.name + ' ' + (delta > 0 ? '+' : '') + delta.toFixed(1) + '分');
        }
      });
      if (diffs.length) return '较上次' + diffs.join(' · ');
      var diff = item.total - prev.total;
      return '较上次总分 ' + (diff >= 0 ? '+' : '') + diff + ' 分';
    },

    renderHistory: function () {
      var list = RecordStore.loadLocal();
      var wrap = $('history-list');
      wrap.innerHTML = '';
      $('clear-btn').style.display = list.length ? 'inline' : 'none';

      if (!list.length) {
        wrap.appendChild(el('div', 'empty',
          '<div class="empty-icon">📋</div><div class="empty-text">暂无估分记录，快去估一次分吧</div>'));
        wrap.appendChild(el('button', 'btn-primary empty-btn', '去估分'));
        wrap.querySelector('.empty-btn').onclick = function () { App.goHome(); };
        return;
      }

      list.forEach(function (item, index) {
        var prev = list.slice(0, index).find(function (p) { return p.type === item.type; });
        var times = RecordStore.formatTime(item.createdAt);

        var card = el('div', 'record-card');
        var head = el('div', 'record-head');
        head.innerHTML =
          '<div class="record-main">' +
          '<div class="record-total ' + (item.pass ? 'pass-yes' : 'pass-no') + '">' + item.total + '</div>' +
          '<div class="record-info">' +
          '<div class="record-title">' + item.typeLabel + '级 · ' + item.difficultyLabel + ' ×' + item.coefficient +
          ' · ' + item.modeLabel + '</div>' +
          '<div class="record-time">' + times + '</div>' +
          '<div class="record-prob">' + item.probabilityLabel + '</div>' +
          '</div></div>' +
          '<span class="record-arrow">▾</span>';
        head.onclick = function () {
          var detail = card.querySelector('.detail');
          var hidden = !detail;
          card.querySelectorAll('.detail').forEach(function (d) { d.remove(); });
          card.querySelector('.record-arrow').classList.remove('open');
          if (hidden) {
            var detailBox = el('div', 'detail');
            var rows = '';
            (item.sections || []).forEach(function (s) {
              rows += '<div class="detail-row"><span class="detail-name">' + s.name + '</span>' +
                '<span class="detail-correct">' + s.correctText + '</span>' +
                '<span class="detail-score">' + s.scoreText + ' / ' + s.weight + ' 分</span></div>';
            });
            detailBox.innerHTML = rows +
              '<div class="detail-actions"><span class="delete-btn" data-key="' + item._localKey + '">🗑 删除</span></div>';
            detailBox.querySelector('.delete-btn').onclick = function () { App.deleteRecord(item._localKey); };
            card.appendChild(detailBox);
            card.querySelector('.record-arrow').classList.add('open');
          }
        };

        if (prev) {
          card.appendChild(el('div', 'diff-line', this.buildDiffText(item, prev)));
        }
        card.appendChild(head);
        wrap.appendChild(card);
      });
    },

    deleteRecord: function (localKey) {
      if (!confirm('确定删除这条记录吗？')) return;
      RecordStore.deleteLocal(localKey);
      toast('已删除');
      this.renderHistory();
    },

    clearAll: function () {
      var list = RecordStore.loadLocal();
      if (!list.length) return;
      if (!confirm('确定清空全部估分记录吗？此操作不可恢复')) return;
      RecordStore.clearLocal();
      toast('已清空');
      this.renderHistory();
    }
  };

  /* 初始化选态 + 默认显示首页 */
  App.restart();
  window.App = App;
})();