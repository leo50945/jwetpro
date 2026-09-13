const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the shared shell loads social actions and notifications', () => {
  const shell = source('shared-shell.js');
  assert.match(shell, /social-system\.css/);
  assert.match(shell, /shared-social\.js/);
  assert.match(shell, /shared-notifications\.js/);

  const index = source('index.html');
  assert.match(index, /shared-social\.js/);
  assert.match(index, /shared-notifications\.js/);
});

test('every requested championship and match surface exposes a canonical social entity', () => {
  const surfaces = [
    ['homepage hero and cards', 'src/main.js', /data-social-kind="(?:match|championship)"/],
    ['calendar and live', 'public-data-page.js', /data-social-kind="(?:match|championship)"/],
    ['activity', 'src/activity-page.js', /data-social-kind="(?:match|championship)"/],
    ['my matches and live matches', 'src/play.js', /data-social-kind="match"/],
    ['progress bracket', 'src/progress-page.js', /data-social-kind="match"/],
    ['champions archive', 'src/champions-page.js', /data-social-kind="championship"/],
    ['championship archive', 'src/championship-page.js', /data-social-kind="(?:match|championship)"/]
  ];
  for (const [label, file, pattern] of surfaces) {
    assert.match(source(file), pattern, `${label} must keep its social attributes`);
  }
});

test('individual rounds remain excluded and profile links remain globally hydrated', () => {
  assert.match(source('src/activity-page.js'), /data-social-disabled/);
  assert.match(source('public-data-page.js'), /data-social-disabled/);
  assert.match(source('src/championship-page.js'), /data-social-disabled/);
  const social = source('shared-social.js');
  assert.match(social, /hasAttribute\('data-social-disabled'\)/);
  assert.match(social, /player\.html\?id=/);
});

test('mobile social actions keep an accessible touch target', () => {
  const styles = source('src/social-system.css');
  assert.ok(styles.includes('@media(max-width:767px){.entity-social-actions{top:9px;right:9px}.hero-slide>.entity-social-actions{top:74px;right:12px}.entity-social-button{min-width:44px;height:44px}'));
  assert.match(source('shared-shell.js'), /social-system\.css\?v=20260913-social-v5/);
  assert.match(source('index.html'), /social-system\.css\?v=20260913-social-v5/);
});

test('relationship lists use the authenticated unified endpoint', () => {
  const main = source('src/main.js');
  const functions = source('functions/social-system.js');
  assert.match(main, /functions\('us-east1'\)\.httpsCallable\('listSocialRelationships'\)/);
  assert.match(main, /direction:section/);
  assert.match(functions, /listSocialRelationships:listRelationships\('requested'/);
});

test('legacy favorites remain visible while paginated social favorites are adopted', () => {
  const main = source('src/main.js');
  assert.match(main, /profileLegacyFavorites/);
  assert.match(main, /profileLegacyFavoriteIdentity/);
  assert.match(main, /socialIdentities\.has\(identity\)/);
  assert.match(main, /profileSocialFavoriteDocs\.map\(profileSocialFavoriteMarkup\).*legacyFavorites\.map/);
});

test('notification badge counts unread documents independently from the recent list', () => {
  const notifications = source('shared-notifications.js');
  assert.match(notifications, /orderBy\('createdAt','desc'\)\.limit\(30\)\.onSnapshot\(renderList/);
  assert.match(notifications, /where\('read','==',false\)\.limit\(100\)\.onSnapshot\(renderUnread/);
  assert.match(notifications, /for\(let batch=0;batch<10;batch\+=1\)/);
});
