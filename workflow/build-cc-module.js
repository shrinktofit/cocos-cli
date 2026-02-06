const fse = require('fs-extra');
const path = require('path');
const utils = require('./utils');
const { engineDir } = require('./metadata.js');

if (!utils.hasDevelopmentEnvironment()) return;

function readDirRecurse(root, visitor, relativeRoot = '') {
    const fileNames = fse.readdirSync(root);
    for (const fileName of fileNames) {
        const file = path.join(root, fileName);
        const stat = fse.statSync(file);
        const relative = path.join(relativeRoot, fileName);
        if (stat.isFile()) {
            visitor(relative);
        } else {
            readDirRecurse(file, visitor, relative);
        }
    }
}

function generateProxyModule(relativePath) {
    // Normalized path processing
    const noExt = relativePath.replace(/\.ts$/, '');
    const normalized = noExt.replace(/\\/g, '\\\\');
    const moduleId = `cc/editor/${normalized}`;

    // Generate code using template string
    return `/**
 * Auto-generated proxy module (use node ./workflow/build-cc-module.js);
 */
const modsMgr = require('cc/mods-mgr');

/**
 * Proxy for ${moduleId}
 * @type {import('${moduleId}')}
 */
module.exports = modsMgr.syncImport('${moduleId}');
`;
}

(() => {
    utils.logTitle('Build node_modules/cc');

    console.time('Bundle node_modules/cc');

    const enginePath = engineDir;

    const ccTemplatePath = path.join(__dirname, '../packages/cc-module/statics/cc-template.d.ts');
    const ccPath = path.join(__dirname, '../packages/cc-module/cc.d.ts');

    fse.writeFileSync(
        ccPath,
        `/// <reference path="${'./node_modules/@cocos/creator-types/engine/cc.d.ts'}"/>
/// <reference path="${'./node_modules/@cocos/creator-types/engine/cc.editor.d.ts'}"/>\n
${fse.readFileSync(ccTemplatePath)}\n
`
            .replace(/\\/g, '\\\\'),
    );
    console.log('generate cc.d.ts');

    // generate packages/cc-module/editor
    const proxyRoot = path.join(__dirname, '../packages/cc-module/editor');
    fse.removeSync(proxyRoot);
    console.log('remove', proxyRoot);

    readDirRecurse(path.join(enginePath, 'editor', 'exports'), (relativePath) => {
        const extReplaced = relativePath.endsWith('.ts') ? relativePath.substr(0, relativePath.length - 3) : relativePath;
        const modulePath = path.join(proxyRoot, `${extReplaced}.js`);
        const moduleCode = generateProxyModule(relativePath);
        fse.outputFileSync(
            modulePath,
            moduleCode,
            { encoding: 'utf8' },
        );
    });
    console.log('generate', proxyRoot);

    // generate cc-module index.js
    const ccModuleDir = path.join(__dirname, '../packages/cc-module');
    const indexJsPath = path.join(ccModuleDir, 'index.js');
    if (!fse.existsSync(indexJsPath)) {
        fse.writeFileSync(indexJsPath, '// ');
    }
    console.log('cc-module prepared for npm installation');

    const sourceDir = path.join(__dirname, '../packages/cc-module');
    utils.runTscCommand(sourceDir);
    console.log('tsc', sourceDir);

    console.timeEnd('Bundle node_modules/cc');
})();
