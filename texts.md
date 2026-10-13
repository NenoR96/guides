Hi evryone! I've been generating the first quizz with Claude and it detected some Portuguese in the code that it cannot edit:
While testing the new quiz in the France version, I found some Portuguese words in the answer feedback panel. They’re hardcoded in the JavaScript, so I can’t translate them from #guides-ui-labels:

« Sabia? », shown before the “did” text (line ~18858: did.innerHTML = q.did ? `<b>Sabia?</b> ${q.did}` : '';)
« Continuar » and « Ver meu resultado », on the button below the feedback (line ~18872)
They appear in every quiz. Can they be moved into #guides-ui-labels so they can be translated per country?

Or is there any other way to remove or translate them?

Same for these hardcoded directly in the JavaScript (lines 18832-18984):
2 seguidas
3 seguidas - pegando fuego
4 seguidas, quem é você?
5 seguidas. Sério.
Desbloquear pregunta bônus
Pregunta bônus desbloqueada
E ainda matou a pergunta bônus.
Guarde essas 2 daqui

Here are the exact code lines if it can make your work easier:

“:fire: 2 seguidas” to “:crown: 8 seguidas. PERFEITO.” (line ~18832)
“Desbloquear pergunta bônus :gift:” (line ~18871)
“:gift: Pergunta bônus desbloqueada!” (line ~18912)
“ E ainda matou a pergunta bônus. :trophy:” (line ~18925)
“Guarde essa daqui” / “Guarde essas N daqui” (line ~18984)
