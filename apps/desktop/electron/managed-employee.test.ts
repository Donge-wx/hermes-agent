import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertManagedEmployeeIdentity,
  bindManagedEmployeeConnection,
  enforceManagedEmployeeApiRequest,
  enforceManagedEmployeeProfile,
  managedEmployeeBindingFromGatewayUrl,
  trackManagedEmployeeSwitch
} from './managed-employee'

test('recognizes and canonicalizes one managed employee gateway', () => {
  assert.deepEqual(managedEmployeeBindingFromGatewayUrl('https://WANGXUDONG.wanyushudong.xyz/'), {
    baseUrl: 'https://wangxudong.wanyushudong.xyz',
    employeeId: 'wangxudong'
  })
})

test('does not claim unrelated remote gateways', () => {
  assert.equal(managedEmployeeBindingFromGatewayUrl('https://gateway.example.com'), null)
})

test('rejects unsafe variants below the managed employee domain', () => {
  assert.throws(() => managedEmployeeBindingFromGatewayUrl('http://wangxudong.wanyushudong.xyz'), /https:\/\//)
  assert.throws(() => managedEmployeeBindingFromGatewayUrl('https://wangxudong.wanyushudong.xyz:8443'), /https:\/\//)
  assert.throws(() => managedEmployeeBindingFromGatewayUrl('https://admin.wanyushudong.xyz'))
  assert.throws(() => managedEmployeeBindingFromGatewayUrl('https://ADMIN.wanyushudong.xyz'))
  assert.throws(() => managedEmployeeBindingFromGatewayUrl('https://team.wangxudong.wanyushudong.xyz'), /员工 ID/)
})

test('binding drops stale profile routes and static credentials', () => {
  const bound = bindManagedEmployeeConnection(
    {
      mode: 'remote',
      remote: { url: 'https://wangxudong.wanyushudong.xyz', authMode: 'oauth', token: { value: 'stale' } },
      profiles: {
        wangxudong: { mode: 'remote', url: 'https://wangxudong.wanyushudong.xyz' },
        weijia: { mode: 'remote', url: 'https://weijia.wanyushudong.xyz' }
      }
    },
    { baseUrl: 'https://weijia.wanyushudong.xyz', employeeId: 'weijia' }
  )

  assert.deepEqual(bound, {
    mode: 'remote',
    remote: { authMode: 'oauth', url: 'https://weijia.wanyushudong.xyz' },
    profiles: {}
  })
})

test('tracks employee changes across save-login-apply without clearing same employee', () => {
  const wang = { baseUrl: 'https://wangxudong.wanyushudong.xyz', employeeId: 'wangxudong' }
  const wei = { baseUrl: 'https://weijia.wanyushudong.xyz', employeeId: 'weijia' }

  const sameEmployee = trackManagedEmployeeSwitch(null, wang, wang)

  assert.equal(sameEmployee.identityChanged, false)

  const switched = trackManagedEmployeeSwitch(null, wang, wei)

  assert.deepEqual(switched, {
    identityChanged: true,
    originEmployeeId: 'wangxudong',
    targetEmployeeId: 'weijia'
  })
  assert.deepEqual(trackManagedEmployeeSwitch(switched, wei, wei), switched)

  const switchedBackBeforeApply = trackManagedEmployeeSwitch(switched, wei, wang)

  assert.equal(switchedBackBeforeApply.identityChanged, false)
  assert.equal(switchedBackBeforeApply.originEmployeeId, 'wangxudong')
  assert.equal(switchedBackBeforeApply.targetEmployeeId, 'wangxudong')
})

test('identity and visible profile must both match the selected employee', () => {
  const binding = { baseUrl: 'https://weijia.wanyushudong.xyz', employeeId: 'weijia' }

  assert.equal(
    assertManagedEmployeeIdentity(
      binding,
      { user_id: 'weijia' },
      { profiles: [{ is_default: true, name: 'default' }] }
    ),
    'default'
  )
  assert.throws(() =>
    assertManagedEmployeeIdentity(binding, { user_id: 'weijia' }, { profiles: [{ is_default: true, name: 'weijia' }] })
  )
  assert.throws(
    () =>
      assertManagedEmployeeIdentity(
        binding,
        { user_id: 'wangxudong' },
        { profiles: [{ is_default: true, name: 'weijia' }] }
      ),
    /身份不匹配/
  )
  assert.throws(
    () =>
      assertManagedEmployeeIdentity(
        binding,
        { user_id: 'weijia' },
        {
          profiles: [
            { is_default: true, name: 'weijia' },
            { is_default: false, name: 'wangxudong' }
          ]
        }
      ),
    /数据范围/
  )
  assert.throws(
    () =>
      assertManagedEmployeeIdentity(
        binding,
        { user_id: 'weijia' },
        { profiles: [{ is_default: false, name: 'default' }] }
      ),
    /数据范围/
  )
})

test('clamps unscoped session reads and searches to the internal default profile', () => {
  const binding = { baseUrl: 'https://weijia.wanyushudong.xyz', employeeId: 'weijia' }

  assert.deepEqual(
    enforceManagedEmployeeApiRequest(
      {
        path: '/api/profiles/sessions?limit=40',
        timeoutMs: 60_000
      },
      binding,
      'default'
    ),
    {
      body: undefined,
      method: 'GET',
      path: '/api/profiles/sessions?limit=40&profile=default',
      profile: 'default',
      timeoutMs: 60_000
    }
  )

  assert.deepEqual(
    enforceManagedEmployeeApiRequest(
      {
        path: '/api/sessions/search?q=hello',
        profile: 'default'
      },
      binding,
      'weijia'
    ),
    {
      body: undefined,
      method: 'GET',
      path: '/api/sessions/search?q=hello&profile=default',
      profile: 'default'
    }
  )
})

test('rejects cross-employee profile parameters in every request location', () => {
  const binding = { baseUrl: 'https://weijia.wanyushudong.xyz', employeeId: 'weijia' }

  assert.throws(
    () => enforceManagedEmployeeApiRequest({ path: '/api/sessions/1', profile: 'wangxudong' }, binding),
    /其他员工 profile/
  )
  assert.throws(
    () => enforceManagedEmployeeApiRequest({ path: '/api/sessions/1?profile=wangxudong' }, binding),
    /其他员工 profile/
  )
  assert.throws(
    () => enforceManagedEmployeeApiRequest({ path: '/api/profiles/sessions?profile=all' }, binding),
    /其他员工 profile/
  )
  assert.throws(
    () => enforceManagedEmployeeApiRequest({ path: '/api/sessions/1', profile: 'weijia' }, binding),
    /其他员工 profile/
  )
  assert.throws(
    () => enforceManagedEmployeeApiRequest({ path: '/api/sessions/1', profile: '' }, binding),
    /其他员工 profile/
  )
  assert.throws(
    () =>
      enforceManagedEmployeeApiRequest(
        { body: { profile: 'wangxudong', title: 'x' }, method: 'PATCH', path: '/api/sessions/1' },
        binding
      ),
    /其他员工 profile/
  )
})

test('clamps direct managed IPC profile arguments to default', () => {
  assert.equal(enforceManagedEmployeeProfile(null, 'connection.profile'), 'default')
  assert.equal(enforceManagedEmployeeProfile(' default ', 'connection.profile'), 'default')
  assert.throws(() => enforceManagedEmployeeProfile('', 'connection.profile'), /其他员工 profile/)
  assert.throws(() => enforceManagedEmployeeProfile('weijia', 'connection.profile'), /其他员工 profile/)
})

test('blocks every profile mutation and direct profile resource route', () => {
  const binding = { baseUrl: 'https://weijia.wanyushudong.xyz', employeeId: 'weijia' }

  for (const request of [
    { body: { name: 'wangxudong' }, method: 'POST', path: '/api/profiles' },
    { body: { active: 'wangxudong' }, method: 'PUT', path: '/api/profiles/active' },
    { method: 'PATCH', path: '/api/profiles/weijia' },
    { method: 'DELETE', path: '/api/profiles/weijia' },
    { method: 'PUT', path: '/api/profiles/weijia/soul' },
    { method: 'GET', path: '/api/profiles/wangxudong/soul' }
  ]) {
    assert.throws(() => enforceManagedEmployeeApiRequest(request, binding), /员工版/)
  }
})

test('rejects absolute, cross-origin, and non-API paths', () => {
  const binding = { baseUrl: 'https://weijia.wanyushudong.xyz', employeeId: 'weijia' }

  assert.throws(
    () => enforceManagedEmployeeApiRequest({ path: 'https://example.com/api/sessions' }, binding),
    /地址无效/
  )
  assert.throws(() => enforceManagedEmployeeApiRequest({ path: '//example.com/api/sessions' }, binding), /当前员工网关/)
  assert.throws(() => enforceManagedEmployeeApiRequest({ path: '/login' }, binding), /当前员工网关/)
})
