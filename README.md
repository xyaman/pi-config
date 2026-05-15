# pi-config

Personal [pi](https://github.com/badlogic/pi-mono) coding agent configuration.

Ship skills, themes, prompts, and extensions to every machine via pi's package manager.

See [pi documentation](https://pi.dev/docs/latest) for the full pi feature reference.

## Contents

| Directory | Description |
|-----------|-------------|
| `extensions/` | Extensions — add capabilities, intercept events, register tools |
| `themes/` | Custom TUI themes |
| `skills/` | Custom skills |
| `prompts/` | Custom prompt templates |

## Install

```bash
# https
pi install git:github.com/xyaman/pi-config

# ssh
pi install git:git@github.com:xyaman/pi-config

# https, per-project
pi install -l git:github.com/xyaman/pi-config

# ssh, per-project
pi install -l git:git@github.com:xyaman/pi-config
```

### Try without installing

```bash
pi -e /path/to/this/repo
```

## Update

```bash
pi update
```

## How it works

This repo is a [pi package](https://pi.dev/docs/latest/packages). Just like dotfiles configure your shell, this repo configures your agent.

When you run `pi install`, pi clones this repo and reads `package.json`. The `pi` manifest tells pi which directories to scan:

```json
{
  "pi": {
    "extensions": ["./extensions"],
    "themes": ["./themes"],
    "skills": ["./skills"],
    "prompts": ["./prompts"]
  }
}
```

Inside those directories, pi auto-discovers resources by file type:

| Directory | What pi looks for | Discovery rule |
|-----------|-------------------|----------------|
| `extensions/` | `.ts` and `.js` files | recursively loaded and executed on startup |
| `skills/` | `SKILL.md` inside folders | each folder with `SKILL.md` becomes a skill |
| `prompts/` | `.md` files | each file becomes a prompt template |
| `themes/` | `.json` files | each file becomes a TUI theme |

You drop a file in the right place, pi finds it automatically — no registration, no imports, no rebuilds.

## Adding new resources

### Skill

```
skills/
└── my-skill/
    └── SKILL.md
```

### Theme

```
themes/
└── my-theme.json
```

### Prompt template

```
prompts/
└── my-template.md
```

### Extension

```
extensions/
└── my-extension/
    └── index.ts
```

## Development

This repo lives at `~/.pi/agent/git/github.com/xyaman/pi-config/` after install. You can work there directly:

```bash
cd ~/.pi/agent/git/github.com/xyaman/pi-config
pi
```

Commit and push from that directory — it is a normal git clone.
