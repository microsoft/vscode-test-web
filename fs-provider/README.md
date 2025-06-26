# VSCode Test Web File System Provider

This extension provides a file system provider for VSCode Test Web to access local files and folders.

## Configuration

The extension supports different server URIs for different environments:

### Int Environment
- **Server URI**: `http://www.int.com:8000`
- **Compile Command**: `npm run compile:dev`

### Local Environment
- **Server URI**: `http://localhost:3000`
- **Compile Command**: `npm run compile:local`

## Usage

### Compile for Int
```bash
npm run compile:int
```

### Compile for Production
```bash
npm run compile:prod
```

### Watch Mode for Int
```bash
npm run watch-web:int
```

### Watch Mode for Production
```bash
npm run watch-web:prod
```

## Configuration File

The configuration is managed in `src/config.ts`. You can modify the server URIs and repository names for different environments:

```typescript
// Int configuration
const devConfig: Config = {
	serverUri: 'http://www.int.com:8000',
};

// Local configuration
const localConfig: Config = {
	serverUri: 'http://localhost:3000',
};
```

## Environment Variables

The extension uses `NODE_ENV` to determine which configuration to use:
- `NODE_ENV=int` - Uses int configuration
- `NODE_ENV=prod` - Uses production configuration
- Default - Uses local configuration