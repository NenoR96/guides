(function(global){
"use strict";
const defaults={
  "quizUnlockBonus": "Desbloquear pergunta b\u00f4nus \ud83c\udf81",
  "quizBonusUnlocked": "\ud83c\udf81 Pergunta b\u00f4nus desbloqueada!",
  "quizBonusSuccess": " E ainda matou a pergunta b\u00f4nus. \ud83c\udfc6",
  "quizRecapOne": "Guarde essa daqui",
  "quizContinue": "Continuar",
  "quizResult": "Ver meu resultado",
  "quizStreak2": "\ud83d\udd25 2 seguidas",
  "quizStreak3": "\ud83d\udd25 3 seguidas - pegando fogo",
  "quizStreak4": "\ud83d\udd25 4 seguidas, quem \u00e9 voc\u00ea?",
  "quizStreak5": "\u26a1 5 seguidas. S\u00e9rio.",
  "quizStreak6": "\u26a1 6 seguidas, impar\u00e1vel",
  "quizStreak7": "\ud83d\udc51 7 seguidas - realeza",
  "quizStreak8": "\ud83d\udc51 8 seguidas. PERFEITO.",
  "quizDidYouKnow": "Sabia?",
  "quizRecapMany": "Guarde essas {count} daqui",
  "quizStreakMany": "\ud83d\udd25 {count} seguidas"
};
const replacements=[
  [
    "'Desbloquear pergunta b\u00f4nus \ud83c\udf81'",
    "guideLabel(\"quizUnlockBonus\", \"Desbloquear pergunta b\\u00f4nus \\ud83c\\udf81\")"
  ],
  [
    "'\ud83c\udf81 Pergunta b\u00f4nus desbloqueada!'",
    "guideLabel(\"quizBonusUnlocked\", \"\\ud83c\\udf81 Pergunta b\\u00f4nus desbloqueada!\")"
  ],
  [
    "' E ainda matou a pergunta b\u00f4nus. \ud83c\udfc6'",
    "guideLabel(\"quizBonusSuccess\", \" E ainda matou a pergunta b\\u00f4nus. \\ud83c\\udfc6\")"
  ],
  [
    "'Guarde essa daqui'",
    "guideLabel(\"quizRecapOne\", \"Guarde essa daqui\")"
  ],
  [
    "'Continuar'",
    "guideLabel(\"quizContinue\", \"Continuar\")"
  ],
  [
    "'Ver meu resultado'",
    "guideLabel(\"quizResult\", \"Ver meu resultado\")"
  ],
  [
    "'\ud83d\udd25 2 seguidas'",
    "guideLabel(\"quizStreak2\", \"\\ud83d\\udd25 2 seguidas\")"
  ],
  [
    "'\ud83d\udd25 3 seguidas - pegando fogo'",
    "guideLabel(\"quizStreak3\", \"\\ud83d\\udd25 3 seguidas - pegando fogo\")"
  ],
  [
    "'\ud83d\udd25 4 seguidas, quem \u00e9 voc\u00ea?'",
    "guideLabel(\"quizStreak4\", \"\\ud83d\\udd25 4 seguidas, quem \\u00e9 voc\\u00ea?\")"
  ],
  [
    "'\u26a1 5 seguidas. S\u00e9rio.'",
    "guideLabel(\"quizStreak5\", \"\\u26a1 5 seguidas. S\\u00e9rio.\")"
  ],
  [
    "'\u26a1 6 seguidas, impar\u00e1vel'",
    "guideLabel(\"quizStreak6\", \"\\u26a1 6 seguidas, impar\\u00e1vel\")"
  ],
  [
    "'\ud83d\udc51 7 seguidas - realeza'",
    "guideLabel(\"quizStreak7\", \"\\ud83d\\udc51 7 seguidas - realeza\")"
  ],
  [
    "'\ud83d\udc51 8 seguidas. PERFEITO.'",
    "guideLabel(\"quizStreak8\", \"\\ud83d\\udc51 8 seguidas. PERFEITO.\")"
  ],
  [
    "<b>Sabia?</b>",
    "<b>${_escapeHtml(guideLabel('quizDidYouKnow', 'Sabia?'))}</b>"
  ],
  [
    "'Guarde essas ' + misses.length + ' daqui'",
    "guideLabel('quizRecapMany', \"Guarde essas {count} daqui\").replace('{count}', misses.length)"
  ],
  [
    "`\ud83d\udd25 ${n} seguidas`",
    "guideLabel('quizStreakMany', \"\\ud83d\\udd25 {count} seguidas\").replace('{count}', n)"
  ]
];

function apply(html, overrides) {
    for (const [before, after] of replacements) html = html.split(before).join(after);
    html = html.replace(/\$\{misses.length === 1 \? (guideLabel[^\n]+?)\}<\/div>/g, '${_escapeHtml(misses.length === 1 ? $1)}</div>');
    const pattern = /(<script\b[^>]*\bid=["']guides-ui-labels["'][^>]*>)([\s\S]*?)(<\/script\s*>)/i;
    const match = html.match(pattern);
    let labels = {};
    if (match) { try { labels = JSON.parse(match[2]); } catch (_) {} }
    for (const key of Object.keys(defaults)) {
        if (overrides && typeof overrides[key] === 'string') labels[key] = overrides[key];
    }
    const json = JSON.stringify(labels).replace(/</g, '\\u003c');
    if (match) return html.replace(pattern, (_, start, body, end) => start + json + end);
    return html.replace(/<head\b[^>]*>/i, head => head + '<script id="guides-ui-labels" type="application/json">' + json + '</script>');
}
const api = { defaults, apply, tag: 'guideTranslations' };
if (typeof module === 'object' && module.exports) module.exports = api;
global.GuidesTranslations = api;
}(typeof window === 'undefined' ? globalThis : window));
