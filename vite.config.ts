import { isAbsolute, join, normalize, relative } from "node:path";
import { Plugin } from "vite";
import { defineConfig } from "vite";
import { builtinModules } from 'node:module';
import dts from 'vite-plugin-dts'
import { readdirSync } from "node:fs";

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: {
        'core/assets/index': './src/core/assets/index.ts',
        'core/base/console': './src/core/base/console.ts',
        'core/configuration/index': './src/core/configuration/index.ts',
        'core/scripting/packer-driver/asset-db-interop': './src/core/scripting/packer-driver/asset-db-interop.ts',
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [
        /^node:.+/,
        ...builtinModules,
        // 'cc',
        // /^cc\/.+/,

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
    ccModule(),
    cliModule(),
    globalModule(),
    dts(),
  ],
});

const sourceRoot = join(__dirname, 'src');

const predefinedPartitionIds: Record<string, string> = {};
predefinedPartitionIds['i18n'] = 'i18n';
for (const id of readdirSync(join(sourceRoot, 'core'))) {
  predefinedPartitionIds[join('core', id)] = id;
}
console.log(`Predefined partition ids: ${JSON.stringify(predefinedPartitionIds, undefined, 2)}`);

function getCliModulePartition(id: string) {
  const rel = relative(sourceRoot, id);
  if (isAbsolute(rel) || /^\.\.[/\\]/.test(rel)) {
    return;
  }
  let partitionId = '';
  let relativePath = '';
  for (const [key, value] of Object.entries(predefinedPartitionIds)) {
    if (rel.startsWith(key)) {
      partitionId = value;
      relativePath = rel.slice(key.length).replace(/^[/\\]/, '').replace(/\\/g, '/');
      break;
    }
  }
  if (!partitionId) {
    return;
  }
  return {
    partitionId,
    relativePath,
  };
}

function stringifyPartition(partition: { partitionId: string, relativePath: string }) {
  return `${partition.partitionId}:${partition.relativePath}`;
}

function stringifyPartitionedAs(partition?: { partitionId: string, relativePath: string }) {
  return partition ? `partitioned as ${stringifyPartition(partition)}` : 'not partitioned';
}

function ccModule(): Plugin {
  const proxyModulePrefix = '\cli-cc-module:';
  return {
    name: 'cli-cc-module',

    enforce: 'pre',

    async resolveId(source, importer, opts, ...args) {
      if (source === 'cc' || source.startsWith('cc/')) {
        return {
          id: `${proxyModulePrefix}${source}`,
          syntheticNamedExports: true,
        };
      }
    },

    async load(id, opts) { 
      if (id.startsWith(proxyModulePrefix)) {
        const moduleId = id.slice(proxyModulePrefix.length);
        return `` +
          `export default ${generateCodeRequiringCliModule(moduleId)};\n` +
          ``;
      }
      return null;
    },
  };
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
        return `` +
          `export default ${generateCodeRequiringCliModule(`${partitionId}:${relativePath}`)};\n` +
          ``;
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
        return `export default ${generateCodeRequiringCliModule('global')};\n`;
      }
      return null;
    },
  };
}

function generateCodeRequiringCliModule(moduleId: string) {
  return `__require_cli_module__(${JSON.stringify(moduleId)})`;
}
