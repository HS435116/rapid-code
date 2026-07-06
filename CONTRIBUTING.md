# Contributing to Rapid Code

Thank you for your interest in contributing! We welcome contributions from everyone.

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/HS435116/rapid-code/issues)
2. If not, open a new issue with:
   - A clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Your environment (OS, app version)

### Suggesting Features

1. Open an issue with the label "enhancement"
2. Describe the feature and the problem it solves
3. Explain how it would work

### Pull Requests

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test your changes: `npm run dev`
5. Commit with clear messages
6. Push and open a Pull Request

### Development Setup

```bash
git clone https://github.com/HS435116/rapid-code.git
cd rapid-code
npm install
cp .env.example .env
# Edit .env with your API keys
npm run dev
```

### Coding Guidelines

- Follow the existing code style
- Use TypeScript for all new code
- Add comments for non-obvious logic
- Keep components focused
- Use Jotai atoms for shared state
- Use tRPC for backend communication

### Commit Messages

Use conventional commits:

```
feat: add ability to do X
fix: correct issue with Y
docs: update README
chore: update dependencies
```

## Questions?

Open a [Discussion](https://github.com/HS435116/rapid-code/discussions) or email **hs0714@qq.com**.
