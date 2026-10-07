# Mods pour Claude Code

[English](README.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Português](README.pt-BR.md) · [Deutsch](README.de.md) · **Français**

## plan-progress

Des barres de progression en direct au-dessus du champ de saisie de Claude Code. Claude découpe la tâche en étapes et en pas, et la barre se remplit au fil du travail. Les sous-agents de chaque tâche s'affichent sous sa barre.

![plan-progress : deux tâches avec leurs agents, une question, une erreur, un plan réécrit en cours de route, les deux tâches terminées](media/plan-progress.gif)

[Voir avec le son (MP4, 14 s)](media/plan-progress.mp4)

- Une ligne par tâche : état, titre, barre, pourcentage, bouton de fermeture
- L'étiquette de la barre indique l'étape et le pas en cours ; au survol, le temps écoulé
- Les étapes sont des capsules, les pas des points ; au survol, l'heure à laquelle ils ont été atteints
- Une barre terminée passe au vert et affiche la durée totale
- Quatre états : en cours, réponse attendue, erreur, terminé
- Chaque sous-agent a sa ligne sous sa tâche : nom, modèle et effort, outil en cours, durée
- Le plan peut changer en cours de route ; les pas terminés sont conservés d'après leur titre
- Les barres sont enregistrées par session et reviennent à sa reprise
- Des sons brefs pour une question, une erreur et la fin
- Fonctionne dans l'application de bureau et dans le terminal

### Installation

```
/plugin marketplace add zycck/claude-mods
/plugin install plan-progress@zycck-mods
```

Mise à jour :

```
claude plugin marketplace update zycck-mods
claude plugin update plan-progress@zycck-mods
```

### Commandes

- `/progress` affiche ou masque les barres
- `/progress-clear` supprime toutes les barres

Le bouton **Progress** en bas fait la même chose que `/progress`.

### Fonctionnement

Le mod enregistre l'outil `plan_progress`. Claude envoie le plan une fois, puis de courtes mises à jour comme `{id, next: true}` ou `{id, done: ["Routes"]}`. Un nom de pas inconnu est refusé avec la liste des pas de la barre. Un plan approuvé en plan mode devient la barre `plan`. Les lignes des agents viennent des événements du moteur et ne consomment aucun token.

Dans l'application de bureau, la barre est une image SVG surmontée d'un calque de survol. Dans le terminal, c'est une grille de caractères qui ne s'anime que pendant que Claude travaille.

### Tests

`plugins/plan-progress/tests` exécute le vrai module sur un moteur simulé : `node compile.cjs ../hooks/register.tsx register.mjs`, puis `node regress.mjs` et `node scenarios.mjs`.

## Licence

MIT
