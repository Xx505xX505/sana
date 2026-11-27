import fs from 'node:fs';
import path from 'node:path';

const root = process.env.VSCODE_SOURCE_DIR || path.resolve('upstream-vscode');
const files = {
  app: path.join(root, 'src/vs/code/electron-main/app.ts'),
  main: path.join(root, 'src/vs/code/electron-main/main.ts'),
  onboarding: path.join(root, 'src/vs/workbench/contrib/welcomeOnboarding/browser/welcomeOnboarding.contribution.ts')
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error('Expected VS Code source file is missing: ' + file);
}

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error('SANA patch could not find expected upstream section: ' + label);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error('SANA patch found multiple matches for: ' + label);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let app = fs.readFileSync(files.app, 'utf8').replace(/\r\n/g, '\n');
app = replaceExactlyOnce(app,
  "import { ONBOARDING_TRYOUT_CHANNEL } from '../../platform/onboarding/common/onboardingTryoutHandoff.js';\nimport { OnboardingTryoutHandoff } from '../../platform/onboarding/electron-main/onboardingTryoutHandoff.js';\n",
  '',
  'remove Copilot onboarding handoff imports');
app = replaceExactlyOnce(app,
  "import { INativeManagedSettingsService, IFileManagedSettingsService } from '../../platform/policy/common/copilotManagedSettings.js';\nimport { NativeManagedSettingsChannel } from '../../platform/policy/common/nativeManagedSettingsIpc.js';\nimport { FileManagedSettingsChannel } from '../../platform/policy/common/fileManagedSettingsIpc.js';\n",
  '',
  'remove Copilot managed-settings channel imports');
app = replaceExactlyOnce(app,
  "\t\tconst nativeManagedSettingsChannel = disposables.add(new NativeManagedSettingsChannel(accessor.get(INativeManagedSettingsService)));\n\t\tmainProcessElectronServer.registerChannel('nativeManagedSettings', nativeManagedSettingsChannel);\n\n\t\tconst fileManagedSettingsChannel = disposables.add(new FileManagedSettingsChannel(accessor.get(IFileManagedSettingsService)));\n\t\tmainProcessElectronServer.registerChannel('fileManagedSettings', fileManagedSettingsChannel);\n\n",
  '',
  'remove Copilot managed-settings IPC channels');
app = replaceExactlyOnce(app,
  "\t\tconst tryoutHandoff = disposables.add(accessor.get(IInstantiationService).createInstance(OnboardingTryoutHandoff));\n\t\tmainProcessElectronServer.registerChannel(ONBOARDING_TRYOUT_CHANNEL, ProxyChannel.fromService(tryoutHandoff, disposables));\n\n",
  '',
  'remove Copilot onboarding IPC channel');
app = replaceExactlyOnce(app,
  "\t\t// Handle agents window first based on context\n\t\tif (args['agents']) {\n\t\t\treturn windowsMainService.openAgentsWindow({\n\t\t\t\tcontext,\n\t\t\t\tcli: args,\n\t\t\t\tinitialStartup: true\n\t\t\t});\n\t\t}\n\n",
  '',
  'disable Agents command-line window launch');
app = replaceExactlyOnce(app,
  "\t\t\tconst agentsWindowProtocolUrlIndex = initialProtocolUrls.urls.findIndex(protocolUrl =>\n\t\t\t\tparseExternalOpenSessionLinkUri(protocolUrl.uri, this.productService.urlProtocol)\n\t\t\t\t|| parseExternalAgentsWindowNewSessionLinkUri(protocolUrl.uri, this.productService.urlProtocol));\n\t\t\tif (agentsWindowProtocolUrlIndex >= 0) {\n\t\t\t\tconst [agentsWindowProtocolUrl] = initialProtocolUrls.urls.splice(agentsWindowProtocolUrlIndex, 1);\n\t\t\t\tconst agentSessionLink = parseExternalOpenSessionLinkUri(agentsWindowProtocolUrl.uri, this.productService.urlProtocol);\n\t\t\t\tconst newSessionLink = parseExternalAgentsWindowNewSessionLinkUri(agentsWindowProtocolUrl.uri, this.productService.urlProtocol);\n\t\t\t\treturn windowsMainService.openAgentsWindow({\n\t\t\t\t\tcontext: OpenContext.LINK,\n\t\t\t\t\tcli: args,\n\t\t\t\t\tinitialStartup: true,\n\t\t\t\t}, newSessionLink?.workspaceUri, agentSessionLink, AgentsWindowOpenSource.Link, false, newSessionLink?.draft);\n\t\t\t}\n\n",
  '',
  'disable Agents protocol startup window launch');
app = replaceExactlyOnce(app,
  "\t\tconst agentSessionLink = parseExternalOpenSessionLinkUri(uri, this.productService.urlProtocol);\n\t\tif (agentSessionLink) {\n\t\t\tconst windows = await windowsMainService.openAgentsWindow({\n\t\t\t\tcontext: OpenContext.LINK,\n\t\t\t\tcli: { ...this.environmentMainService.args },\n\t\t\t}, undefined, agentSessionLink, AgentsWindowOpenSource.Link);\n\t\t\treturn windows.length > 0;\n\t\t}\n\n\t\tconst newSessionLink = parseExternalAgentsWindowNewSessionLinkUri(uri, this.productService.urlProtocol);\n\t\tif (newSessionLink) {\n\t\t\tconst windows = await windowsMainService.openAgentsWindow({\n\t\t\t\tcontext: OpenContext.LINK,\n\t\t\t\tcli: { ...this.environmentMainService.args },\n\t\t\t}, newSessionLink.workspaceUri, undefined, AgentsWindowOpenSource.Link, false, newSessionLink.draft);\n\t\t\treturn windows.length > 0;\n\t\t}\n\n",
  '',
  'disable Agents deep-link window launch');
app = app.replace(', parseExternalAgentsWindowNewSessionLinkUri', '');
fs.writeFileSync(files.app, app, 'utf8');

let main = fs.readFileSync(files.main, 'utf8').replace(/\r\n/g, '\n');
main = replaceExactlyOnce(main,
  "import { GITHUB_COPILOT_MACOS_BUNDLE_ID, GITHUB_COPILOT_WIN32_POLICY_NAME, GITHUB_COPILOT_WIN32_REGISTRY_PATH, INativeManagedSettingsService, IFileManagedSettingsService, MANAGED_SETTINGS_FILE_NAME, MANAGED_SETTINGS_LINUX_FILE_PATH, MANAGED_SETTINGS_MACOS_FILE_PATH, MANAGED_SETTINGS_WINDOWS_DIR, NullNativeManagedSettingsService, NullFileManagedSettingsService } from '../../platform/policy/common/copilotManagedSettings.js';\nimport { FileManagedSettingsService } from '../../platform/policy/common/fileManagedSettingsService.js';\nimport { NativeManagedSettingsService } from '../../platform/policy/node/nativeManagedSettingsService.js';\n",
  '',
  'remove Copilot managed-settings service imports');
main = replaceExactlyOnce(main,
  "\t\tlet nativeManagedSettingsService: NativeManagedSettingsService | undefined;\n\t\tif (isWindows) {\n\t\t\tnativeManagedSettingsService = disposables.add(new NativeManagedSettingsService(logService, GITHUB_COPILOT_WIN32_POLICY_NAME, { registryPath: GITHUB_COPILOT_WIN32_REGISTRY_PATH }));\n\t\t} else if (isMacintosh) {\n\t\t\tnativeManagedSettingsService = disposables.add(new NativeManagedSettingsService(logService, GITHUB_COPILOT_MACOS_BUNDLE_ID));\n\t\t}\n\t\tif (nativeManagedSettingsService) {\n\t\t\tservices.set(INativeManagedSettingsService, nativeManagedSettingsService);\n\t\t} else {\n\t\t\tservices.set(INativeManagedSettingsService, new NullNativeManagedSettingsService());\n\t\t}\n\n\t\t// File-based managed settings\n\t\tlet fileManagedSettingsPath: string | undefined;\n\t\tif (isWindows) {\n\t\t\tconst programFiles = process.env['ProgramFiles'];\n\t\t\tif (programFiles) {\n\t\t\t\tfileManagedSettingsPath = join(programFiles, MANAGED_SETTINGS_WINDOWS_DIR, MANAGED_SETTINGS_FILE_NAME);\n\t\t\t}\n\t\t} else if (isMacintosh) {\n\t\t\tfileManagedSettingsPath = MANAGED_SETTINGS_MACOS_FILE_PATH;\n\t\t} else if (isLinux) {\n\t\t\tfileManagedSettingsPath = MANAGED_SETTINGS_LINUX_FILE_PATH;\n\t\t}\n\t\tif (fileManagedSettingsPath) {\n\t\t\tconst fileManagedSettingsService = disposables.add(new FileManagedSettingsService(URI.file(fileManagedSettingsPath), fileService, logService));\n\t\t\tservices.set(IFileManagedSettingsService, fileManagedSettingsService);\n\t\t} else {\n\t\t\tservices.set(IFileManagedSettingsService, new NullFileManagedSettingsService());\n\t\t}\n\n",
  '',
  'remove Copilot managed-settings service registration');
fs.writeFileSync(files.main, main, 'utf8');

let onboarding = fs.readFileSync(files.onboarding, 'utf8').replace(/\r\n/g, '\n');
onboarding = replaceExactlyOnce(onboarding,
  "import { localize2 } from '../../../../nls.js';\n",
  "import { Event } from '../../../../base/common/event.js';\nimport { localize2 } from '../../../../nls.js';\n",
  'add inert onboarding event import');
onboarding = replaceExactlyOnce(onboarding,
  "import { OnboardingVariationA } from './onboardingVariationA.js';\n\nregisterSingleton(IOnboardingService, OnboardingVariationA, InstantiationType.Delayed);\n",
  "class SanaOnboardingService implements IOnboardingService {\n\tdeclare readonly _serviceBrand: undefined;\n\treadonly onDidDismiss = Event.None;\n\tshow(): void { }\n}\n\nregisterSingleton(IOnboardingService, SanaOnboardingService, InstantiationType.Delayed);\n",
  'replace Microsoft Copilot onboarding implementation');
fs.writeFileSync(files.onboarding, onboarding, 'utf8');

const checks = [
  [files.app, 'OnboardingTryoutHandoff'],
  [files.app, 'nativeManagedSettings'],
  [files.app, 'fileManagedSettings'],
  [files.main, 'NativeManagedSettingsService'],
  [files.main, 'FileManagedSettingsService'],
  [files.onboarding, 'OnboardingVariationA']
];
for (const [file, token] of checks) {
  if (fs.readFileSync(file, 'utf8').includes(token)) throw new Error('Copilot/Agents integration marker remains in patched file: ' + token);
}
console.log('Applied SANA patches: removed Copilot onboarding handoff and managed-settings IPC/services; disabled Agents protocol launch; replaced Copilot onboarding UI with an inert SANA service.');
console.log('Shared VS Code policy infrastructure and unrelated authentication services were preserved.');
