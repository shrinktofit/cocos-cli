import { isAbsolute, join, normalize, relative } from "node:path";
import { Plugin } from "vite";
import { defineConfig } from "vite";
import { builtinModules } from 'node:module';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: {
        'asset-db': './src/core/assets/index.ts',
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [
        /^node:.+/,
        ...builtinModules,
        'cc',
        /^cc\/.+/,

        /.+[/\\]node_modules[/\\].+/,
        /^@babel\/.+/,
        'draco3dgltf',
        'fs-extra',
        'gl',
        'glsl-parser',
        /^glsl-parser\/.+/,
        'glsl-tokenizer',
        /^glsl-tokenizer\/.+/,
        'gltf-validator',
        'js-yaml',
        'json5',
        'lodash',
        'meshopt_encoder',
        'pngjs',
        'psd.js',
        'rimraf',
        'sharp',
        'tga-js',
        'tmp',
        'urijs',
        'xmldom',
        'pino',
        'i18next',
        'strip-ansi',
        'node-uuid',
        'fast-glob',
        'semver',
        'winston',
        'typescript',
        'eol',
        /^@cocos\/.+/,
        'minimatch',
        'consola',
      ],
    },
    commonjsOptions: {
      include: [
        'src/core/assets/effect-compiler/**/*.js',
      ],
    },
    minify: false,
    sourcemap: true,
  },

  plugins: [
    cliModule(),
    globalModule(),
  ],
});

function getCliModulePartition(id: string) {
  const rel = relative(join(__dirname, 'src/core'), id).replace(/\\/g, '/');
  if (isAbsolute(rel) || /^\.\.[/\\]/.test(rel)) {
    return;
  }
  const normalized = rel.replaceAll('\\', '/');
  const match = normalized.match(/^(.+?)\/(.+)$/);
  if (!match) {
    return;
  }
  return {
    partitionId: match[1],
    relativePath: match[2],
  };
}

function stringifyPartition(partition: { partitionId: string, relativePath: string }) {
  return `${partition.partitionId}:${partition.relativePath}`;
}

function stringifyPartitionedAs(partition?: { partitionId: string, relativePath: string }) {
  return partition ? `partitioned as ${stringifyPartition(partition)}` : 'not partitioned';
}

function cliModule(): Plugin {
  const proxyModulePrefix = '\0cli-module:';
  return {
    name: 'cli-module',

    enforce: 'pre',

    async resolveId(source, importer, opts, ...args) {
      if (!importer) {
        return;
      }
      if (!isAbsolute(importer)) {
        return;
      }
      const resolved = await this.resolve(source, importer, {
        skipSelf: true,
        ...opts,
      }, ...args);
      if (!resolved) {
        return resolved;
      }
      if (!isAbsolute(resolved.id)) {
        return resolved;
      }
      const importerPartition = getCliModulePartition(importer);
      const resolvedPartition = getCliModulePartition(resolved.id);
      if (resolvedPartition?.partitionId !== importerPartition?.partitionId) {
        if (resolvedPartition && importerPartition) {
          this.warn(`Importing [${stringifyPartition(resolvedPartition)}] from [${stringifyPartition(importerPartition)}]`);
          return {
            id: `${proxyModulePrefix}${resolvedPartition.partitionId}:${resolvedPartition.relativePath}`,
            syntheticNamedExports: true,
          };
        } else {
          this.error(`Importing ${source}[${stringifyPartitionedAs(resolvedPartition)}] from ${importer}[${stringifyPartitionedAs(importerPartition)}] is not allowed.`);
        }
      }
      return resolved;
    },

    async load(id, opts) { 
      if (id.startsWith(proxyModulePrefix)) {
        const [partitionId, relativePath] = id.slice(proxyModulePrefix.length).split(':');
        return `export default { __PARTITION__: ${JSON.stringify(partitionId)}, __${partitionId}__: ${JSON.stringify(relativePath)} };`;
      }
      return null;
    },
  };
}

function globalModule(): Plugin {
  const proxyModulePrefix = '\0global-module:';
  return {
    name: 'global-module',

    enforce: 'pre',

    async resolveId(source, importer, opts, ...args) {
      const resolved = await this.resolve(source, importer, {
        skipSelf: true,
        ...opts,
      }, ...args);
      if (!resolved || !isAbsolute(resolved.id)) {
        return resolved;
      }
      if (normalize(resolved.id) === normalize(join(__dirname, 'src/global.ts'))) {
        return {
          id: `${proxyModulePrefix}`,
          syntheticNamedExports: true,
        };
      }
      return resolved;
    },

    async load(id, opts) { 
      if (id.startsWith(proxyModulePrefix)) {
        return `export default { __global__: 'world' };`;
      }
      return null;
    },
  };
}

