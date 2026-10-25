# FocusFlow

A Pomodoro timer and task list in plain HTML, CSS and JavaScript. No frameworks, no build step.

## Run it

Open `index.html` in any modern browser. To load sample tasks and a week of history, open `index.html?demo`.

## Features

- **Timer** for focus, short break and long break, with an animated SVG progress ring. It counts down from a timestamp, so it stays accurate when the tab is in the background.
- **Tasks**: add, complete, delete, filter (All / Active / Done), drag to reorder, and estimate pomodoros per task. Click a task to make it the one finished sessions count toward.
- **Weekly stats**: sessions today, focus minutes this week, day streak and a bar chart for each day.
- **Settings**: session lengths, long-break interval, a completion chime (Web Audio API) and auto-start.
- **Light and dark themes**, following the system setting by default.
- **Keyboard shortcuts**: `Space` start/pause · `R` reset · `S` skip · `N` new task · `T` theme.
- Everything is saved to `localStorage`, so your data survives a reload.

## Structure

```
index.html      markup and layout regions
css/style.css   design tokens (CSS custom properties), layout, components, responsive rules
js/app.js       state, timer, tasks, stats, settings and persistence
```
