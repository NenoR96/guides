(function(global){
"use strict";
const defaults={
  "guideStart": "Start",
  "questions": "perguntas",
  "startQuiz": "Bora começar",
  "inThisGuide": "Neste guia",
  "otherGuides": "Outros guias",
  "moreContent": "Mais conteúdos",
  "references": "Referências",
  "alreadyRead": "✓ Já lido!",
  "markRead": "✓ Marcar como lido",
  "alreadyCompleted": "✓ Já concluído!",
  "markCompleted": "✓ Marcar como concluído",
  "progressOf": "de",
  "quizReplay": "Jogar de novo",
  "quizRetry": "Tentar de novo",
  "quizBeatRecord": "Bater meu recorde ({hits} de {total})",
  "quizPerfectTitle": "Você zerou este quiz 🏆",
  "quizPlayedTitle": "Você já jogou este quiz",
  "quizCompletedTitle": "Você já fez este quiz ✓",
  "quizAttempt": " · {count}ª tentativa",
  "quizNewTopic": "Esse tema ainda é novo pra você - e é exatamente pra isso que serve",
  "quizBestResult": "Melhor resultado: {hits} de {total}",
  "quizNewRecord": "🎉 Novo recorde! Você superou seus {count} acertos anteriores. ",
  "quizReview": "Revisão",
  "quizNothingToReview": "Nada a revisar.",
  "quizPerfectReview": "Você acertou tudo. Esse conteúdo já é seu - agora é só usar quando alguém questionar.",
  "continueHere": "Continuar aqui",
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
// Static shell copy is marked once, then refreshed on every render. Article and
// quiz content records remain owned by their existing content editors.
const staticLabels = {
  quizName: 'Quiz', guideName: 'Guia',
  onboardingHello: 'Olá! Vamos personalizar', onboardingGuides: 'os guias do seu bebê',
  onboardingDescription: 'Informe a data de nascimento do bebê e a gente mostra exatamente o que você precisa ler agora.',
  birthdate: 'Data de nascimento do bebê', babyAge: 'idade do bebê', viewGuides: 'Ver meus guias →',
  journeyView: 'Jornada', listView: 'Lista', yourGuides: 'seus guias', changeAge: '← Alterar',
  learnAt: 'Aprenda no', yourPace: 'seu ritmo',
  evidenceNotice: '🔬 Baseado em evidências · revisado por pediatras e nutricionistas',
  progressOf: 'de', readCount: 'lidos', keepGoing: 'Continue no seu ritmo 💚',
  journeyLink: 'Ver como jornada (novo)', journeyLinkDescription: 'Todos os guias em uma trilha, do 0 aos 2 anos',
  welcomeTitle: 'Você está no lugar certo', welcomeDescription: 'Todos os guias foram revisados por nutricionistas e pediatras especializados em BLW.',
  fullJourney: 'Jornada completa',
  quizKicker: 'Quiz relâmpago', quizDuration: '2 min', quizDurationLimit: 'no máximo',
  questions: 'perguntas', startQuiz: 'Bora começar', quizReplay: 'Jogar de novo',
  quizReadGuide: 'Antes, quero reler o guia', quizHits: 'acertos', quizMaxStreak: 'seq. máx.',
  quizBack: 'Voltar pra jornada', quizContinue: 'Continuar',
  quizComingSoon: 'Em breve: perguntas rápidas de múltipla escolha pra testar o que você sabe sobre esse tema.',
  quizPreview: 'Esta é só uma página de exemplo - sem jogo de verdade ainda - pra visualizar como fica o quiz concluído na trilha.',
  markRead: '✓ Marcar como lido', markCompleted: '✓ Marcar como concluído',
  resumeReading: '⏱ Continuando de onde você parou', summary: '⚡ Resumão',
  relatedGuides: 'Continue por aqui', expectHeading: 'O que esperar', rememberHeading: 'Lembre-se'
};
Object.assign(defaults, staticLabels);
const literalLabels = {
  welcomeTitle: 'Você está no lugar certo', welcomeDescription: 'Todos os guias foram revisados por nutricionistas e pediatras especializados em BLW.',
  bannerSafetyTitle: 'Medo do engasgo? É normal.', bannerSafetyText: 'Aprenda a diferença entre o reflexo gag e engasgo real - e sinta mais tranquilidade.',
  bannerScienceTitle: 'Baseado em ciência', bannerScienceText: 'Todo o conteúdo é baseado em evidências e atualizado com as melhores práticas mundiais.',
  bannerPaceTitle: 'Leia quando puder', bannerPaceText: 'Os guias foram pensados para famílias ocupadas. Cada um no momento certo.',
  phaseHighlightTitle: 'Para o seu bebê agora', phaseHighlightSubtitle: 'Guias da sua fase',
  babyAge: 'idade do bebê', ageOfLife: 'de vida',
  personalizedGreeting: 'Personalizados para você', libraryGreeting: 'Biblioteca completa', allGuides: '📚 Todos os guias',
  celebration1: 'Você está cuidando muito bem do seu bebê.', celebration2: 'Mais um passo nessa jornada do BLW!',
  celebration3: 'Você está arrasando.', celebration4: 'Isso! Cada guia lido é um cuidado a mais.',
  celebration5: 'Você está construindo um conhecimento e tanto.', celebration6: 'Você está no caminho certo. Continue!',
  achievementMessage: 'Mais um bloco de conhecimento conquistado. Continue no seu ritmo - o próximo já te espera.'
};
Object.assign(defaults, literalLabels, {
  phase5: 'Preparação para a IA', phase6: 'Início da IA - 6 meses',
  phase7: '7 meses - explorando sabores!', phase8: '8 meses - ganhando ritmo', phase9: '9 meses - nova fase!',
  phase10: '10 meses - crescendo muito!', phase11: '11 meses - quase 1 ano!',
  phase12: '{count} meses - 1 aninho!', phase24: '{age} - descobrindo!',
  phaseYears: '{years} anos', phaseYearsMonths: '{years} anos e {months} meses',
  searchAnswer: 'Isso pode ajudar', searchOpenGuide: 'Ver guia completo →', changeAgeTooltip: 'Alterar idade do bebê',
  ageDays: '{count} dias', ageMonths: '{count} meses', ageYear: '{count} ano', ageYears: '{count} anos',
  ageExtraDays: 'e {count} dias', ageExtraMonths: 'e {count} meses',
  achievementTitle: 'Você completou {title}! 🎉',
  searchPlaceholder: 'Buscar guias…', searchEmpty: 'Digite pelo menos uma palavra.',
  searchNoResults: 'Nenhum guia encontrado.', searchTryAgain: 'Tente outro termo.'
});
const fallbackDefaults = {
  fallbackMoreGuides: 'More guides', fallbackAllGuides: 'All guides', fallbackYourJourney: 'Your journey',
  fallbackTitle: 'Interactive guides', fallbackDescription: 'Explore all available guides.',
  fallbackProgress: 'Journey progress', fallbackOf: 'of', fallbackCompleted: '✓ Completed',
  fallbackComplete: 'Mark as completed', fallbackEmptyTitle: 'No guides published',
  fallbackEmptyMessage: 'Add and publish guides from the Content section.',
  fallbackErrorTitle: 'Guides unavailable', fallbackErrorMessage: 'The content could not be loaded. Please try again.',
  fallbackNotice: 'The uploaded design could not start, so a safe fallback is shown.',
  fallbackTakeaways: 'Key takeaways', fallbackBack: 'Back', fallbackPremium: 'Premium',
  fallbackLoading: 'Loading guides…'
};
Object.assign(defaults, fallbackDefaults);
function get(overrides, key) {
    return overrides && typeof overrides[key] === 'string' ? overrides[key] : defaults[key] || key;
}
const replacements=[
  ["<div class=\"search-answer-label\">Isso pode ajudar</div>", "<div class=\"search-answer-label\">${_escapeHtml(guideLabel('searchAnswer', 'Isso pode ajudar'))}</div>"],
  ["<div class=\"search-answer-cta\">Ver guia completo →</div>", "<div class=\"search-answer-cta\">${_escapeHtml(guideLabel('searchOpenGuide', 'Ver guia completo →'))}</div>"],
  ["${doneCount}/${total} lidos · ${subtitle}", "${doneCount}/${total} ${_escapeHtml(guideLabel('readCount', 'lidos'))} · ${subtitle}"],
  ["${m.title}</strong>${m.text}", "${_escapeHtml(m.title)}</strong>${_escapeHtml(m.text)}"],
  ["${name}</div>", "${_escapeHtml(name)}</div>"],
  ["· ${subtitle}</div>", "· ${_escapeHtml(subtitle)}</div>"],
  ['label: months + " meses - 1 aninho!"', "label: guideLabel('phase12', '{count} meses - 1 aninho!').replace('{count}', months)"],
  ['anos + " anos e " + rem + " meses"', "guideLabel('phaseYearsMonths', '{years} anos e {months} meses').replace('{years}', anos).replace('{months}', rem)"],
  ['anos + " anos"', "guideLabel('phaseYears', '{years} anos').replace('{years}', anos)"],
  ['label + " - descobrindo!"', "guideLabel('phase24', '{age} - descobrindo!').replace('{age}', label)"],
  ["`${days} dias`", "guideLabel('ageDays', '{count} dias').replace('{count}', days)"],
  ["`${months} meses`", "guideLabel('ageMonths', '{count} meses').replace('{count}', months)"],
  ["`e ${days} dias`", "guideLabel('ageExtraDays', 'e {count} dias').replace('{count}', days)"],
  ["`e ${rem} meses`", "guideLabel('ageExtraMonths', 'e {count} meses').replace('{count}', rem)"],
  ["`${years} ano${years > 1 ? 's' : ''}`", "(years > 1 ? guideLabel('ageYears', '{count} anos') : guideLabel('ageYear', '{count} ano')).replace('{count}', years)"],
  ["`Você completou ${groupTitle}! 🎉`", "guideLabel('achievementTitle', 'Você completou {title}! 🎉').replace('{title}', groupTitle)"],
  ["</span>Digite pelo menos uma palavra.</div>'", "</span>' + _escapeHtml(guideLabel('searchEmpty', 'Digite pelo menos uma palavra.')) + '</div>'"],
  ["</span>Nenhum guia encontrado.<br>Tente outro termo.</div>'", "</span>' + _escapeHtml(guideLabel('searchNoResults', 'Nenhum guia encontrado.')) + '<br>' + _escapeHtml(guideLabel('searchTryAgain', 'Tente outro termo.')) + '</div>'"],
  ["'<div class=\"journey-node-label\">Começar</div>'", "'<div class=\"journey-node-label\">' + _escapeHtml(guideLabel('guideStart', 'Start')) + '</div>'"],
  ["${quiz.questions} perguntas", "${quiz.questions} ${_escapeHtml(guideLabel('questions', 'perguntas'))}"],
  ["'Jogar de novo'", "guideLabel(\"quizReplay\", \"Jogar de novo\")"],
  ["'Tentar de novo'", "guideLabel(\"quizRetry\", \"Tentar de novo\")"],
  ["`Bater meu recorde (${best.hits} de ${best.total})`", "guideLabel('quizBeatRecord', 'Bater meu recorde ({hits} de {total})').replace('{hits}', best.hits).replace('{total}', best.total)"],
  ["'Você zerou este quiz 🏆'", "guideLabel(\"quizPerfectTitle\", \"Você zerou este quiz 🏆\")"],
  ["'Você já jogou este quiz'", "guideLabel(\"quizPlayedTitle\", \"Você já jogou este quiz\")"],
  ["'Você já fez este quiz ✓'", "guideLabel(\"quizCompletedTitle\", \"Você já fez este quiz ✓\")"],
  ["` · ${best.plays}ª tentativa`", "guideLabel('quizAttempt', ' · {count}ª tentativa').replace('{count}', best.plays)"],
  ["`Esse tema ainda é novo pra você - e é exatamente pra isso que serve${vezes}`", "_escapeHtml(guideLabel('quizNewTopic', 'Esse tema ainda é novo pra você - e é exatamente pra isso que serve') + vezes)"],
  ["`Melhor resultado: <b>${best.hits} de ${best.total}</b>${vezes}`", "'<b>' + _escapeHtml(guideLabel('quizBestResult', 'Melhor resultado: {hits} de {total}').replace('{hits}', best.hits).replace('{total}', best.total)) + '</b>' + _escapeHtml(vezes)"],
  ["`🎉 Novo recorde! Você superou seus ${recordeAnterior} acertos anteriores. `", "guideLabel('quizNewRecord', '🎉 Novo recorde! Você superou seus {count} acertos anteriores. ').replace('{count}', recordeAnterior)"],
  ["<div class=\"quiz-recap-title\">Revisão</div>", "<div class=\"quiz-recap-title\">${_escapeHtml(guideLabel('quizReview', 'Revisão'))}</div>"],
  ["<span class=\"quiz-recap-head\">Nada a revisar.</span>", "<span class=\"quiz-recap-head\">${_escapeHtml(guideLabel('quizNothingToReview', 'Nada a revisar.'))}</span>"],
  ["              Você acertou tudo. Esse conteúdo já é seu - agora é só usar quando alguém questionar.", "              ${_escapeHtml(guideLabel('quizPerfectReview', 'Você acertou tudo. Esse conteúdo já é seu - agora é só usar quando alguém questionar.'))}"],
  [
    "'<span class=\"lesson-current-badge\">Continuar aqui</span>'",
    "'<span class=\"lesson-current-badge\">' + _escapeHtml(guideLabel('continueHere', 'Continuar aqui')) + '</span>'"
  ],
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

const appearanceDefaults = {
    language: '', pageTitle: '', achievementEnabled: true,
    background: '#EBEAEA', green: '#1ABC9C', blue: '#207FA7', heading: '#303320',
    counter: '#F9A247', counterBackground: '#F5F6F3', completedBackground: '#E8F8F5'
};
function appearance(value) {
    const result = { ...appearanceDefaults };
    if (!value || typeof value !== 'object') return result;
    for (const key of ['background', 'green', 'blue', 'heading', 'counter', 'counterBackground', 'completedBackground']) {
        if (/^#[0-9a-f]{6}$/i.test(value[key] || '')) result[key] = value[key];
    }
    if (typeof value.language === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.language)) result.language = value.language;
    if (typeof value.pageTitle === 'string') result.pageTitle = value.pageTitle.slice(0, 150);
    result.achievementEnabled = value.achievementEnabled !== false;
    return result;
}
function applyAppearance(html, value) {
    if (!value || typeof value !== 'object') return html;
    // Keep content and manifest JSON byte-for-byte intact, even if an article
    // contains literal examples of style tags or JavaScript function names.
    const jsonBlocks = [];
    html = html.replace(/<script\b(?=[^>]*\btype=["']application\/json["'])[^>]*>[\s\S]*?<\/script>/gi, block => {
        const index = jsonBlocks.push(block) - 1;
        return '<!--guides-preserved-json-' + index + '-->';
    });
    const config = appearance(value);
    const escape = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    html = html.replace(/<style id="guides-appearance">[\s\S]*?<\/style>/gi, '')
        .replace(/<script id="guides-appearance-state">[\s\S]*?<\/script>/gi, '');
    if (config.language) html = html.replace(/<html\b([^>]*)>/i, (_, attrs) => '<html' + attrs.replace(/\s+lang\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, '') + ' lang="' + config.language + '">');
    if (config.pageTitle) {
        const title = '<title>' + escape(config.pageTitle) + '</title>';
        html = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(html) ? html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, () => title) : html.replace(/<head\b[^>]*>/i, head => head + title);
    }
    const darker = color => '#' + [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * 0.72).toString(16).padStart(2, '0')).join('');
    const theme = { ...config, greenDark: darker(config.green), blueDark: darker(config.blue), greenSoft: config.green + '22', blueSoft: config.blue + '22' };
    const palette = { '#faf7f4': 'background', '#ebeaea': 'background', '#2d7d4e': 'green', '#1abc9c': 'green', '#1abc9b': 'green', '#3b82c4': 'blue', '#207fa7': 'blue', '#0d9a7e': 'greenDark', '#14577c': 'blueDark', '#1d7fae': 'blue', '#1abc9c22': 'greenSoft', '#3b82c422': 'blueSoft' };
    html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, style => style.replace(/var\(--guides-[^)]*\)|#[0-9a-f]{6}(?:[0-9a-f]{2})?\b/gi, color => {
        const key = palette[color.toLowerCase()];
        return key ? 'var(--guides-' + key + ', ' + color + ')' : color;
    }));
    const guard = 'if (window.__guidesAppearance && window.__guidesAppearance.achievementEnabled === false) return;';
    if (!html.includes(guard)) html = html.replace(/function showAchievement\(([^)]*)\)\s*\{/, match => match + guard);
    // These colors are generated as inline styles, outside the stylesheet.
    html = html.replace("read: '#1ABC9B'", "read: 'var(--guides-green, #1ABC9B)'")
        .replace("const cores = ['#FFCF4E', '#F9A247', '#1ABC9C', '#3B82C4', '#EB5757'];", "const cores = ['#FFCF4E', '#F9A247', 'var(--guides-green, #1ABC9C)', 'var(--guides-blue, #3B82C4)', '#EB5757'];");
    const style = '<style id="guides-appearance">:root{' + [...new Set(Object.values(palette))].map(key => '--guides-' + key + ':' + theme[key] + ';').join('') + '}' +
        'body{background:' + config.background + '!important}.btn-read.done{color:' + config.green + '!important;border-color:' + config.green + '!important;background:' + config.completedBackground + '!important}' +
        '.jsb-row,.journey-section-title,.module-title{color:' + config.heading + '!important}.jsb-count,.journey-section-count,.module-count{color:' + config.counter + '!important;background:' + config.counterBackground + '!important}' +
        '#progress-ring-circle{stroke:var(--guides-green)!important}' +
        '</style>';
    const script = '<script id="guides-appearance-state">window.__guidesAppearance=' + JSON.stringify(config).replace(/</g, '\\u003c') + ';<\/script>';
    return html.replace(/<\/head>/i, () => style + script + '</head>')
        .replace(/<!--guides-preserved-json-(\d+)-->/g, (_, index) => jsonBlocks[Number(index)]);
}
function apply(html, overrides) {
    // Update already-uploaded shells as well as newly uploaded guide HTML.
    html = html.replace("iconHTML('baby-face', 16)", "iconHTML(summary.icon || 'baby-face', 16)");
    const milestoneIconUpdate = "document.querySelector('.milestone-sheet-icon').innerHTML = iconHTML(data.icon || 'baby-face', 24);";
    if (!html.includes(milestoneIconUpdate)) {
        html = html.replace("document.getElementById('milestone-sheet-title').textContent = data.title;",
            "document.getElementById('milestone-sheet-title').textContent = data.title;\n      " + milestoneIconUpdate);
    }
    html = html.replace("if (!done && !isCurrent) return '';", "if (done || !isCurrent) return '';");
    for (const [before, after] of replacements) html = html.split(before).join(after);
    for (const [key, value] of Object.entries(literalLabels)) {
        html = html.split("'" + value + "'").join('guideLabel(' + JSON.stringify(key) + ', ' + JSON.stringify(value) + ')');
    }
    for (const key of ['phase5', 'phase6', 'phase7', 'phase8', 'phase9', 'phase10', 'phase11']) {
        html = html.split('label: ' + JSON.stringify(defaults[key])).join("label: guideLabel('" + key + "', '" + defaults[key] + "')");
    }
    html = html.replace(/\$\{misses.length === 1 \? (guideLabel[^\n]+?)\}<\/div>/g, '${_escapeHtml(misses.length === 1 ? $1)}</div>');
    const pattern = /(<script\b[^>]*\bid=["']guides-ui-labels["'][^>]*>)([\s\S]*?)(<\/script\s*>)/i;
    const match = html.match(pattern);
    let labels = {};
    if (match) { try { labels = JSON.parse(match[2]); } catch (_) {} }
    for (const key of Object.keys(defaults)) {
        if (overrides && typeof overrides[key] === 'string') labels[key] = overrides[key];
    }
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    // Only touch literal markup outside scripts; never rewrite embedded content.
    html = html.split(/(<!--[\s\S]*?-->|<style\b[^>]*>[\s\S]*?<\/style\s*>|<script\b[^>]*>[\s\S]*?<\/script\s*>)/gi).map((part, index) => {
        if (index % 2) return part;
        part = part.replace(/(<button\b[^>]*\bclass="btn-back-age"[^>]*\btitle=")[^"]*(")/g,
            (_, start, end) => start + escape(labels.changeAgeTooltip ?? defaults.changeAgeTooltip) + end);
        part = part.replace(/(<input\b[^>]*\bid="search-input(?:-home)?"[^>]*\bplaceholder=")[^"]*(")/g,
            (_, start, end) => start + escape(labels.searchPlaceholder ?? defaults.searchPlaceholder) + end);
        part = part.replace(/<span data-guides-label="(\w+)">[^<]*<\/span>/g, (match, key) =>
            Object.hasOwn(staticLabels, key) ? '<span data-guides-label="' + key + '">' + escape(labels[key] ?? defaults[key]) + '</span>' : match);
        return part.replace(/>(\s*)([^<>]+?)(\s*)</g, (match, before, value, after, offset, source) => {
            if (/data-guides-label="\w+"$/.test(source.slice(0, offset))) return match;
            const key = Object.keys(staticLabels).find(key => staticLabels[key] === value.trim());
            return key ? '>' + before + '<span data-guides-label="' + key + '">' + escape(labels[key] ?? defaults[key]) + '</span>' + after + '<' : match;
        });
    }).join('');
    const json = JSON.stringify(labels).replace(/</g, '\\u003c');
    const translated = match ? html.replace(pattern, (_, start, body, end) => start + json + end) : html.replace(/<head\b[^>]*>/i, head => head + '<script id="guides-ui-labels" type="application/json">' + json + '</script>');
    return applyAppearance(translated, overrides && overrides.appearance);
}
const api = { defaults, staticLabels, fallbackDefaults, get, apply, appearance, appearanceDefaults, applyAppearance, tag: 'guideTranslations' };
if (typeof module === 'object' && module.exports) module.exports = api;
global.GuidesTranslations = api;
}(typeof window === 'undefined' ? globalThis : window));
