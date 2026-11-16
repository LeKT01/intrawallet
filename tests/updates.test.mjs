import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findAndroidUpdate, releasesUrl } from '../src/updates.ts'

function release(version, flags = {}) {
  const tag = 'v' + version
  const name = 'IntraWallet-' + tag + '.apk'
  return { tag_name: tag, draft: false, prerelease: version.includes('-'),
    assets: [{ name, state: 'uploaded', browser_download_url: releasesUrl + '/download/' + tag + '/' + name }], ...flags }
}

test('detects the highest usable beta by version rather than release order', () => {
  const releases = [release('0.3.0-beta.10'), release('0.3.0-beta.9'), release('0.3.0-beta.12', { draft: true }),
    release('0.3.0-beta.11', { assets: [] }), release('0.3.0-beta.2')]
  assert.equal(findAndroidUpdate(releases, '0.3.0-beta.3')?.version, '0.3.0-beta.10')
  assert.equal(findAndroidUpdate(releases, '0.3.0-beta.10'), null)
})

test('stable versions stay on the stable channel and stable supersedes its beta', () => {
  assert.equal(findAndroidUpdate([release('0.4.0-beta.1')], '0.3.0'), null)
  assert.equal(findAndroidUpdate([release('0.3.0')], '0.3.0-beta.3')?.url, releasesUrl + '/tag/v0.3.0')
})

test('rejects invalid tags and mismatched asset locations', () => {
  const wrong = release('0.9.0')
  wrong.assets[0].browser_download_url = 'https://example.com/' + wrong.assets[0].name
  assert.equal(findAndroidUpdate([wrong, release('0.8.0-alpha.1'), null], '0.3.0'), null)
})
