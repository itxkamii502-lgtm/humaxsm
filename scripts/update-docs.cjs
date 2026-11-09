const fs = require('fs');
const path = require('path');

const docFiles = [
  'PROJECT_MAP.md',
  'UI_MAP.md',
  'ARCHITECTURE.md',
  'CHANGE_RULES.md',
  'BUSINESS_LOGIC.md',
  'STEP_BY_STEP_VPS_GUIDE.md',
  'VPS_DEPLOYMENT_GUIDE.md'
];

for (const f of docFiles) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');

  // Replace folder and brand names
  content = content.replace(/Alpha SMS/g, 'HUMEX SMS');
  content = content.replace(/alpha-sms/g, 'humex-sms');
  content = content.replace(/alphasms/g, 'humexsms');
  content = content.replace(/HUMAX SMS/g, 'HUMEX SMS');
  content = content.replace(/humax-sms/g, 'humex-sms');
  content = content.replace(/humax_sms/g, 'humex_sms');

  // Replace file references
  content = content.replace(/speed-panel\.css/g, 'humex-panel.css');
  content = content.replace(/speed-admin-skin\.css/g, 'humex-admin-skin.css');
  content = content.replace(/apx-telecom\.css/g, 'humex-telecom.css');
  content = content.replace(/style\.css/g, 'humex-global.css');

  content = content.replace(/app\.js/g, 'owner-engine.js');
  content = content.replace(/speed-admin\.js/g, 'owner-shell.js');
  content = content.replace(/new_features\.js/g, 'owner-features.js');
  content = content.replace(/manager\.js/g, 'manager-engine.js');
  content = content.replace(/speed-panel\.js/g, 'manager-shell.js');
  content = content.replace(/speed-pages\.js/g, 'manager-pages.js');
  content = content.replace(/manager_features\.js/g, 'manager-features.js');
  content = content.replace(/agent\.js/g, 'agent-engine.js');
  content = content.replace(/speed-agent\.js/g, 'agent-shell.js');
  content = content.replace(/speed-agent-pages\.js/g, 'agent-pages.js');
  content = content.replace(/agent_features\.js/g, 'agent-features.js');
  content = content.replace(/client\.js/g, 'client-engine.js');
  content = content.replace(/speed-client\.js/g, 'client-shell.js');
  content = content.replace(/speed-client-pages\.js/g, 'client-pages.js');
  content = content.replace(/speed-test\.js/g, 'testpanel-shell.js');
  content = content.replace(/speed-test-pages\.js/g, 'testpanel-pages.js');
  content = content.replace(/speed-kit\.js/g, 'shared-ui-kit.js');
  content = content.replace(/brand-theme\.js/g, 'shared-brand-theme.js');
  content = content.replace(/speed-auth-guard\.js/g, 'shared-auth-guard.js');
  content = content.replace(/speed-profile-security\.js/g, 'shared-profile-security.js');
  content = content.replace(/speed-url\.js/g, 'shared-url-router.js');
  content = content.replace(/speed-flash\.js/g, 'shared-flash.js');
  content = content.replace(/speed-loginpanel\.js/g, 'shared-login-modal.js');
  content = content.replace(/apx-grid\.js/g, 'shared-grid.js');

  fs.writeFileSync(p, content, 'utf8');
  console.log(`Updated documentation in ${f}`);
}
