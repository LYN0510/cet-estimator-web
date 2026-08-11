/* ============================================================
 * 四六级评分规则与加权赋分计算（H5 / APK 共用版）
 * 与小程序端 utils/score.js、云端 rules.js 保持同构
 * 官方赋分公式：最终得分 = (原始分 / 满分原始分) × 权重满分 × 难度系数
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 常量 ---------- */
  var TOTAL_FULL = 710;
  var WEIGHT = {
    listening: 248.5,
    reading: 248.5,
    writing: 106.5,
    translation: 106.5
  };

  var DIFFICULTY_PRESETS = [
    { key: 'easy', label: '简单', value: 1.1, desc: '当年题目整体偏简单' },
    { key: 'normal', label: '中等', value: 1.0, desc: '当年题目难度正常' },
    { key: 'hard', label: '困难', value: 0.9, desc: '当年题目整体偏难' }
  ];

  var COEFFICIENT_MIN = 0.85;
  var COEFFICIENT_MAX = 1.15;

  var MODES = {
    conservative: { key: 'conservative', label: '保守', shift: -1, desc: '写作·翻译自评等级下调一档' },
    neutral: { key: 'neutral', label: '中性', shift: 0, desc: '写作·翻译自评等级保持不变' },
    optimistic: { key: 'optimistic', label: '乐观', shift: 1, desc: '写作·翻译自评等级上调一档' }
  };

  var LEVEL_RATIOS = [0.2, 0.4, 0.6, 0.8, 1.0];
  var LEVEL_MIN = 1;
  var LEVEL_MAX = 5;

  var PASS_LINE = 425;

  var PROBABILITY_LEVELS = [
    { key: 'veryHigh', min: 480, label: '极高（>95%）' },
    { key: 'high', min: 450, label: '较高（80%~95%）' },
    { key: 'medium', min: 425, label: '中等（50%~80%）' },
    { key: 'low', min: 400, label: '较低（20%~50%）' },
    { key: 'veryLow', min: 0, label: '极低（<20%）' }
  ];

  var EXAM_TYPES = {
    cet4: {
      key: 'cet4',
      label: '四级',
      listening: [
        { key: 'news', name: '短篇新闻', count: 7 },
        { key: 'conversation', name: '长对话', count: 8 },
        { key: 'passage', name: '听力篇章', count: 10 }
      ],
      reading: [
        { key: 'vocab', name: '词汇理解', count: 10 },
        { key: 'long', name: '长篇阅读', count: 10 },
        { key: 'careful', name: '仔细阅读', count: 10 }
      ]
    },
    cet6: {
      key: 'cet6',
      label: '六级',
      listening: [
        { key: 'conversation', name: '长对话', count: 8 },
        { key: 'passage', name: '听力篇章', count: 7 },
        { key: 'lecture', name: '讲座/讲话', count: 10 }
      ],
      reading: [
        { key: 'vocab', name: '词汇理解', count: 10 },
        { key: 'long', name: '长篇阅读', count: 10 },
        { key: 'careful', name: '仔细阅读', count: 10 }
      ]
    }
  };

  var ADVICE_TEXT = {
    listening: '听力最薄弱：建议每天精听一套真题，练习抓取首句与转折词，熟悉新闻/讲话语速与高频场景词。',
    reading: '阅读最薄弱：建议扩充词汇量并练习快速定位，重点突破段落匹配（长篇阅读）与主旨细节题。',
    writing: '写作最薄弱：建议背诵高分范文与万能句型，考前至少完整动笔写 3-5 篇并对照范文修改。',
    translation: '翻译最薄弱：建议积累高频中国文化词汇，练习长难句拆分与主被动语态转换。',
    balanced: '四部分表现较为均衡，建议保持刷题节奏，重点巩固错题对应的题型并强化计时训练。'
  };

  /* ---------- 工具函数 ---------- */
  function round1(num) { return Math.round(num * 10) / 10; }
  function clamp(num, min, max) { return Math.min(Math.max(num, min), max); }
  function toInt(value, defaultValue) {
    var n = parseInt(value, 10);
    return isNaN(n) ? defaultValue : n;
  }
  function sumCount(groups, answers) {
    return groups.reduce(function (sum, g) {
      var v = toInt(answers[g.key], 0);
      return sum + clamp(v, 0, g.count);
    }, 0);
  }

  /* ---------- 表单辅助 ---------- */
  function buildInputConfig(typeKey) {
    var typeDef = EXAM_TYPES[typeKey];
    var listeningCount = typeDef.listening.reduce(function (s, g) { return s + g.count; }, 0);
    var readingCount = typeDef.reading.reduce(function (s, g) { return s + g.count; }, 0);
    return {
      typeKey: typeKey,
      typeLabel: typeDef.label,
      listeningGroups: typeDef.listening,
      readingGroups: typeDef.reading,
      listeningCount: listeningCount,
      readingCount: readingCount
    };
  }

  function buildAnswers(typeKey) {
    var typeDef = EXAM_TYPES[typeKey];
    var answers = { listening: {}, reading: {} };
    ['listening', 'reading'].forEach(function (part) {
      typeDef[part].forEach(function (g) { answers[part][g.key] = 0; });
    });
    return answers;
  }

  /* ---------- 校验 ---------- */
  function validate(params) {
    if (!params) return '参数不能为空';
    var typeDef = EXAM_TYPES[params.type];
    if (!typeDef) return '请选择有效的考试类型';
    var coefficient = Number(params.coefficient);
    if (!isFinite(coefficient) || coefficient < COEFFICIENT_MIN || coefficient > COEFFICIENT_MAX) {
      return '难度系数需在 ' + COEFFICIENT_MIN + '~' + COEFFICIENT_MAX + ' 之间';
    }
    if (!params.mode || !MODES[params.mode]) return '请选择有效的估分模式';
    var answers = params.answers || {};
    var parts = ['listening', 'reading'];
    parts.forEach(function (part) {
      typeDef[part].forEach(function (g) {
        var v = toInt(answers[part] && answers[part][g.key], NaN);
        if (isNaN(v) || v < 0 || v > g.count) {
          throw new Error('「' + g.name + '」答对题数需在 0~' + g.count + ' 之间');
        }
      });
    });
    [params.writingLevel, params.translationLevel].forEach(function (level) {
      var n = toInt(level, NaN);
      if (isNaN(n) || n < LEVEL_MIN || n > LEVEL_MAX) {
        throw new Error('自评档位需在 ' + LEVEL_MIN + '~' + LEVEL_MAX + ' 之间');
      }
    });
    return null;
  }

  /* ---------- 核心计算 ---------- */
  function calculate(params) {
    var typeDef = EXAM_TYPES[params.type];
    var coefficient = clamp(Number(params.coefficient) || 1, COEFFICIENT_MIN, COEFFICIENT_MAX);
    var modeShift = MODES[params.mode] ? MODES[params.mode].shift : 0;
    var answers = params.answers || {};

    var diffPreset = DIFFICULTY_PRESETS.find(function (p) { return p.value === coefficient; });
    var difficultyLabel = diffPreset ? diffPreset.label : '自定义';

    var sections = [];

    ['listening', 'reading'].forEach(function (part) {
      var groups = typeDef[part];
      var correct = sumCount(groups, answers[part]);
      var full = groups.reduce(function (s, g) { return s + g.count; }, 0);
      var score = round1((correct / full) * WEIGHT[part] * coefficient);
      sections.push({
        key: part,
        name: part === 'listening' ? '听力' : '阅读',
        correct: correct,
        correctText: correct + ' / ' + full + ' 题',
        raw: correct,
        rawText: correct + ' 题',
        weight: WEIGHT[part],
        score: score,
        scoreText: score.toFixed(1),
        rate: clamp(score / WEIGHT[part], 0, 1)
      });
    });

    [
      { key: 'writing', name: '写作', level: params.writingLevel },
      { key: 'translation', name: '翻译', level: params.translationLevel }
    ].forEach(function (item) {
      var level = clamp(toInt(item.level, 3) + modeShift, LEVEL_MIN, LEVEL_MAX);
      var ratio = LEVEL_RATIOS[level - 1];
      var raw = round1(WEIGHT[item.key] * ratio);
      var score = round1(raw * coefficient);
      sections.push({
        key: item.key,
        name: item.name,
        level: level,
        correctText: '自评 ' + level + ' 档（' + Math.round(ratio * 100) + '%）',
        raw: raw,
        rawText: raw.toFixed(1) + ' 分',
        weight: WEIGHT[item.key],
        score: score,
        scoreText: score.toFixed(1),
        rate: clamp(score / WEIGHT[item.key], 0, 1)
      });
    });

    var total = Math.round(sections.reduce(function (sum, s) { return sum + s.score; }, 0));
    var pass = total >= PASS_LINE;
    var probability = PROBABILITY_LEVELS.find(function (p) { return total >= p.min; });

    var advicePrimary = ADVICE_TEXT.balanced;
    var adviceSecondary = '';
    var sorted = sections.slice().sort(function (a, b) { return a.rate - b.rate; });
    if (sorted[3].rate - sorted[0].rate >= 0.02) {
      advicePrimary = ADVICE_TEXT[sorted[0].key];
      adviceSecondary = ADVICE_TEXT[sorted[1].key];
    }

    return {
      type: typeDef.key,
      typeLabel: typeDef.label,
      coefficient: coefficient,
      difficultyLabel: difficultyLabel,
      mode: params.mode,
      modeLabel: MODES[params.mode] ? MODES[params.mode].label : '中性',
      sections: sections,
      total: total,
      pass: pass,
      probabilityKey: probability.key,
      probabilityLabel: probability.label,
      writingLevelAdjusted: sections[2].level,
      translationLevelAdjusted: sections[3].level,
      advicePrimary: advicePrimary,
      adviceSecondary: adviceSecondary,
      passLine: PASS_LINE
    };
  }

  var ScoreEngine = {
    TOTAL_FULL: TOTAL_FULL,
    WEIGHT: WEIGHT,
    DIFFICULTY_PRESETS: DIFFICULTY_PRESETS,
    COEFFICIENT_MIN: COEFFICIENT_MIN,
    COEFFICIENT_MAX: COEFFICIENT_MAX,
    MODES: MODES,
    LEVEL_RATIOS: LEVEL_RATIOS,
    LEVEL_MIN: LEVEL_MIN,
    LEVEL_MAX: LEVEL_MAX,
    PASS_LINE: PASS_LINE,
    PROBABILITY_LEVELS: PROBABILITY_LEVELS,
    EXAM_TYPES: EXAM_TYPES,
    buildInputConfig: buildInputConfig,
    buildAnswers: buildAnswers,
    validate: validate,
    calculate: calculate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScoreEngine;
  } else {
    global.ScoreEngine = ScoreEngine;
  }
})(typeof window !== 'undefined' ? window : this);