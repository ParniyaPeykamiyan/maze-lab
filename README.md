# Maze Lab

**Watch pathfinding algorithms find their way.** Maze Lab is an interactive visualizer for the algorithms behind GPS directions, game AI and network routing. Draw a maze (or generate one), sprinkle in some mud, then watch Dijkstra, A\*, BFS, DFS and Greedy Best-First explore it cell by cell, or race them against each other.

**Live site:** https://parniyapeykamiyan.github.io/maze-lab/

Built with plain HTML, CSS and JavaScript (ES modules). No frameworks, no build step.

## Features

- **Interactive grid**: click and drag to draw walls or mud, erase, and drag the start and goal anywhere. After a run, editing the board recomputes the result instantly.
- **Five algorithms**: Dijkstra, A\*, Breadth-First Search, Depth-First Search and Greedy Best-First Search.
- **Animated maze generators**: recursive backtracking, randomised Prim's (both with a few loops knocked in so there's more than one route), and random walls.
- **Weighted cells**: mud costs 5 to step into. Only the weighted algorithms (Dijkstra and A\*) route around it. The others charge straight through, and the stats show the true cost they paid.
- **Race mode**: pick 2–4 algorithms and run them in lockstep on identical copies of your maze. A live scoreboard tracks cells explored, path length, path cost and time, then announces a winner (cheapest path, ties broken by fewest cells explored).
- **Explain mode**: a side panel that narrates each step in plain English, plus a summary of how the current algorithm works, its time complexity, and whether it guarantees the shortest path.
- **Speed control and stepping**: from a crawl to thousands of steps per second, with pause/resume and single-step.
- An intro for non-coders, an algorithm comparison section, and a layout that works on phones (touch drawing included).

## Running locally

ES modules need to be served over HTTP, so opening `index.html` straight from disk won't work. Any static server will do:

- **VS Code**: install the *Live Server* extension, right-click `index.html` and pick **Open with Live Server**.
- **Node**: `npx serve .`
- **Python**: `python -m http.server`

## Project structure

```
index.html          page markup: landing, lab (explore + race), algorithm guide
css/styles.css      dark neon theme, grid/cell animations, responsive layout
assets/favicon.svg
js/
  main.js           entry point: app state, mode switching, speed sliders
  grid.js           board model + DOM rendering + mouse/touch editing; gridGraph() adapter
  algorithms.js     the five algorithms as step-yielding generators
  mazes.js          maze generators as step-yielding generators
  animator.js       rate-controlled stepper (play / pause / step / stop)
  ui.js             Explore-mode controller: toolbar, stats, live recompute, toasts
  race.js           Race mode: lockstep runner, scoreboard, winner banner
  explain.js        plain-English algorithm info, narration panel, guide section
  hero.js           animated landing background (reuses the real generator + algorithms)
```

### How it fits together

Algorithms never touch the DOM or the `Grid` class. They receive a small **graph interface**:

```js
{ size, start, end, neighbors(id), cost(id), heuristic(id), isMud(id), label(id) }
```

and **yield** one step at a time (`{ type: 'visit', id, frontier, msg }`, then a final `{ type: 'done', path, cost, ... }`). The `Animator` consumes those steps at whatever speed you pick. That one design is what makes pausing, single-stepping, narration and lockstep racing possible.

It also keeps the project open to the planned next phases:

- **Street-map mode**: provide a `neighbors/cost/heuristic` adapter over real road data, and every algorithm works unchanged.
- **Race-the-algorithm game**: the `Animator` and step stream already let a player's moves be compared with an algorithm's, tick for tick.
- **3D mode**: a renderer can subscribe to the same step stream that the grid DOM uses today.

## The algorithms at a glance

| Algorithm | Strategy | Shortest path? | Uses weights? | Time complexity |
|---|---|---|---|---|
| A\* | cost so far + estimated distance left | Yes | Yes | O(E log V) |
| Dijkstra | always expand the cheapest cell | Yes | Yes | O((V + E) log V) |
| BFS | explore in rings of equal step count | Fewest steps only | No | O(V + E) |
| DFS | dive deep, backtrack at dead ends | No | No | O(V + E) |
| Greedy Best-First | head for whatever looks closest | No | No | O(E log V) |

*V = cells, E = connections between cells (≈ 4V on a grid).*
