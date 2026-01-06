# Auto Claude - LM Studio Development Fork

**Autonomous multi-agent coding framework with local LLM support via LiteLLM**

![Auto Claude Kanban Board](.github/assets/Auto-Claude-Kanban.png)

[![License](https://img.shields.io/badge/license-AGPL--3.0-green?style=flat-square)](./agpl-3.0.txt)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/KCXaPBr4Dj)
[![YouTube](https://img.shields.io/badge/YouTube-Subscribe-FF0000?style=flat-square&logo=youtube&logoColor=white)](https://www.youtube.com/@AndreMikalsen)
[![CI](https://img.shields.io/github/actions/workflow/status/AndyMik90/Auto-Claude/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/AndyMik90/Auto-Claude/actions)

---

> [!WARNING]
> **This is a development fork!** This branch contains experimental features (LiteLLM support, local LLM integration) and may be unstable.
> 
> **For stable releases**, please visit the original repository:  
> 🔗 **[AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude)**

---

## Requirements

- **Claude Pro/Max subscription** - [Get one here](https://claude.ai/upgrade)
  - **OR** Use a local LLM via LiteLLM proxy - [Setup guide](guides/LITELLM-SETUP.md)
- **Claude Code CLI** - `npm install -g @anthropic-ai/claude-code`
- **Git repository** - Your project must be initialized as a git repo

> **💡 Running Local LLMs?** Auto Claude now supports local models (LM Studio, Ollama, etc.) via [LiteLLM proxy](guides/LITELLM-SETUP.md). No API costs required!

---

## Quick Start

> **⚠️ Development Version**: This fork is experimental. For production use, see the [official releases](https://github.com/AndyMik90/Auto-Claude/releases).

### Running from Source (Development)

1. **Clone this repository**
   ```bash
   git clone https://github.com/hendkai/Auto-Claude_LM-Studio.git
   cd Auto-Claude_LM-Studio
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up LiteLLM (for local LLMs)**
   - Follow [guides/LITELLM-SETUP.md](guides/LITELLM-SETUP.md)

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Connect Claude** - The app will guide you through OAuth setup or LiteLLM profile configuration

6. **Create a task** - Describe what you want to build

7. **Watch it work** - Agents plan, code, and validate autonomously

---

## Features

| Feature | Description |
|---------|-------------|
| **Autonomous Tasks** | Describe your goal; agents handle planning, implementation, and validation |
| **Parallel Execution** | Run multiple builds simultaneously with up to 12 agent terminals |
| **Isolated Workspaces** | All changes happen in git worktrees - your main branch stays safe |
| **Self-Validating QA** | Built-in quality assurance loop catches issues before you review |
| **AI-Powered Merge** | Automatic conflict resolution when integrating back to main |
| **Memory Layer** | Agents retain insights across sessions for smarter builds |
| **Dynamic Model Selection** | Supports Anthropic API + local LLMs via LiteLLM (LM Studio, Ollama) |
| **GitHub/GitLab Integration** | Import issues, investigate with AI, create merge requests |
| **Linear Integration** | Sync tasks with Linear for team progress tracking |
| **Cross-Platform** | Native desktop apps for Windows, macOS, and Linux |
| **Auto-Updates** | App updates automatically when new versions are released |

---

## Interface

### Kanban Board
Visual task management from planning through completion. Create tasks and monitor agent progress in real-time.

### Agent Terminals
AI-powered terminals with one-click task context injection. Spawn multiple agents for parallel work.

![Agent Terminals](.github/assets/Auto-Claude-Agents-terminals.png)

### Roadmap
AI-assisted feature planning with competitor analysis and audience targeting.

![Roadmap](.github/assets/Auto-Claude-roadmap.png)

### Additional Features
- **Insights** - Chat interface for exploring your codebase
- **Ideation** - Discover improvements, performance issues, and vulnerabilities
- **Changelog** - Generate release notes from completed tasks

---

## Project Structure

```
Auto-Claude/
├── apps/
│   ├── backend/     # Python agents, specs, QA pipeline
│   └── frontend/    # Electron desktop application
├── guides/          # Additional documentation
├── tests/           # Test suite
└── scripts/         # Build utilities
```

---

## CLI Usage

For headless operation, CI/CD integration, or terminal-only workflows:

```bash
cd apps/backend

# Create a spec interactively
python spec_runner.py --interactive

# Run autonomous build
python run.py --spec 001

# Review and merge
python run.py --spec 001 --review
python run.py --spec 001 --merge
```

See [guides/CLI-USAGE.md](guides/CLI-USAGE.md) for complete CLI documentation.

---

## Development

Want to build from source or contribute? See [CONTRIBUTING.md](CONTRIBUTING.md) for complete development setup instructions.

For Linux-specific builds (Flatpak, AppImage), see [guides/linux.md](guides/linux.md).

---

## Security

Auto Claude uses a three-layer security model:

1. **OS Sandbox** - Bash commands run in isolation
2. **Filesystem Restrictions** - Operations limited to project directory
3. **Dynamic Command Allowlist** - Only approved commands based on detected project stack

All releases are:
- Scanned with VirusTotal before publishing
- Include SHA256 checksums for verification
- Code-signed where applicable (macOS)

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run install:all` | Install backend and frontend dependencies |
| `npm start` | Build and run the desktop app |
| `npm run dev` | Run in development mode with hot reload |
| `npm run package` | Package for current platform |
| `npm run package:mac` | Package for macOS |
| `npm run package:win` | Package for Windows |
| `npm run package:linux` | Package for Linux |
| `npm run package:flatpak` | Package as Flatpak (see [guides/linux.md](guides/linux.md)) |
| `npm run lint` | Run linter |
| `npm test` | Run frontend tests |
| `npm run test:backend` | Run backend tests |

---

## Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development setup instructions
- Code style guidelines
- Testing requirements
- Pull request process

---

## Community

**For official support and community**, please visit the original repository:

- **Original Repo** - [AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude)
- **Discord** - [Join official community](https://discord.gg/KCXaPBr4Dj)
- **Issues** - [Report bugs (original repo)](https://github.com/AndyMik90/Auto-Claude/issues)
- **Discussions** - [Ask questions (original repo)](https://github.com/AndyMik90/Auto-Claude/discussions)

**This fork (LM Studio/Development):**
- **Issues** - [Fork-specific issues](https://github.com/hendkai/Auto-Claude_LM-Studio/issues)

---

## License

**AGPL-3.0** - GNU Affero General Public License v3.0

Auto Claude is free to use. If you modify and distribute it, or run it as a service, your code must also be open source under AGPL-3.0.

Commercial licensing available for closed-source use cases.

---

## Star History

[![GitHub Repo stars](https://img.shields.io/github/stars/AndyMik90/Auto-Claude?style=social)](https://github.com/AndyMik90/Auto-Claude/stargazers)

[![Star History Chart](https://api.star-history.com/svg?repos=AndyMik90/Auto-Claude&type=Date)](https://star-history.com/#AndyMik90/Auto-Claude&Date)
