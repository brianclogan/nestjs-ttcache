# Contributing to NestJS TTCache

First off, thank you for considering contributing to NestJS TTCache! It's people like you that make NestJS TTCache such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title**
* **Describe the exact steps which reproduce the problem**
* **Provide specific examples to demonstrate the steps**
* **Describe the behavior you observed after following the steps**
* **Explain which behavior you expected to see instead and why**
* **Include code samples and stack traces if applicable**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use a clear and descriptive title**
* **Provide a step-by-step description of the suggested enhancement**
* **Provide specific examples to demonstrate the steps**
* **Describe the current behavior and explain which behavior you expected to see instead**
* **Explain why this enhancement would be useful**

### Pull Requests

* Fill in the required template
* Do not include issue numbers in the PR title
* Include screenshots and animated GIFs in your pull request whenever possible
* Follow the TypeScript styleguide
* Include thoughtfully-worded, well-structured tests
* Document new code
* End all files with a newline

## Development Process

1. **Fork the repo and create your branch from `main`**
   ```bash
   git clone https://github.com/yourusername/nestjs-ttcache.git
   cd nestjs-ttcache
   git checkout -b feature/your-feature-name
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Make your changes**
   - Write your code
   - Add tests for your changes
   - Update documentation if needed

4. **Run tests**
   ```bash
   npm test
   npm run test:integration
   ```

5. **Check code style**
   ```bash
   npm run lint
   ```

6. **Build the project**
   ```bash
   npm run build
   ```

7. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```
   
   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation only changes
   - `style:` Code style changes (formatting, etc)
   - `refactor:` Code change that neither fixes a bug nor adds a feature
   - `perf:` Performance improvement
   - `test:` Adding missing tests
   - `chore:` Changes to the build process or auxiliary tools

8. **Push to your fork and submit a pull request**
   ```bash
   git push origin feature/your-feature-name
   ```

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
# Start required services
docker-compose up -d

# Run integration tests
npm run test:integration
```

### Coverage
```bash
npm run test:coverage
```

### Benchmarks
```bash
npm run benchmark
```

## Project Structure

```
src/
├── base/           # Base entity classes
├── decorators/     # TypeScript decorators
├── interfaces/     # TypeScript interfaces
├── providers/      # Cache provider implementations
├── services/       # Core services
├── subscribers/    # TypeORM subscribers
└── utils/          # Utility functions
```

## Style Guide

### TypeScript
- Use TypeScript strict mode
- Prefer interfaces over type aliases for object types
- Use explicit return types for public methods
- Document all public APIs with JSDoc comments

### Code Formatting
- 2 spaces for indentation
- Single quotes for strings
- No semicolons (except where required)
- Trailing commas in multi-line objects and arrays

### Naming Conventions
- `PascalCase` for classes and interfaces
- `camelCase` for variables, functions, and methods
- `UPPER_SNAKE_CASE` for constants
- Prefix interfaces with `I` only when necessary to avoid naming conflicts

### Testing
- Write tests for all new features
- Maintain test coverage above 80%
- Use descriptive test names
- Group related tests using `describe` blocks

## Documentation

- Update README.md if you change functionality
- Add JSDoc comments for all public methods
- Include examples in documentation
- Update CHANGELOG.md following [Keep a Changelog](https://keepachangelog.com/)

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create a git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. GitHub Actions will automatically publish to npm

## Questions?

Feel free to open an issue with your question or reach out to the maintainers directly.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.