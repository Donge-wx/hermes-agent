import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export interface MyKingRelayKeyStaging {
  readonly directory: string
  readonly privateKeyPath: string
  readonly publicKey: string
}

class MyKingRelayKeyError extends Error {
  readonly name = 'MyKingRelayKeyError'
}

function sshUint32(value: number): Buffer {
  const encoded = Buffer.alloc(4)
  encoded.writeUInt32BE(value)

  return encoded
}

function sshString(value: Buffer | string): Buffer {
  const encoded = typeof value === 'string' ? Buffer.from(value, 'utf8') : value

  return Buffer.concat([sshUint32(encoded.length), encoded])
}

function requiredJwkBytes(value: string | undefined, field: string): Buffer {
  if (!value) {
    throw new MyKingRelayKeyError(`Generated Ed25519 key is missing ${field}.`)
  }

  const decoded = Buffer.from(value, 'base64url')

  if (decoded.length !== 32) {
    throw new MyKingRelayKeyError(`Generated Ed25519 ${field} has an invalid length.`)
  }

  return decoded
}

function opensshPrivateKey(seed: Buffer, publicKey: Buffer, publicBlob: Buffer): string {
  const check = crypto.randomBytes(4)

  const unpadded = Buffer.concat([
    check,
    check,
    sshString('ssh-ed25519'),
    sshString(publicKey),
    sshString(Buffer.concat([seed, publicKey])),
    sshString('My-King-Employee-Connector')
  ])

  const paddingLength = 8 - (unpadded.length % 8)

  const padding = Buffer.from(Array.from({ length: paddingLength }, (_value, index) => index + 1))

  const envelope = Buffer.concat([
    Buffer.from('openssh-key-v1\0', 'utf8'),
    sshString('none'),
    sshString('none'),
    sshString(Buffer.alloc(0)),
    sshUint32(1),
    sshString(publicBlob),
    sshString(Buffer.concat([unpadded, padding]))
  ])

  const body = envelope.toString('base64').match(/.{1,70}/g)?.join('\n')

  if (!body) {
    throw new MyKingRelayKeyError('Generated Ed25519 key could not be encoded.')
  }

  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${body}\n-----END OPENSSH PRIVATE KEY-----\n`
}

export function generateMyKingRelayKeyStaging(userData: string): MyKingRelayKeyStaging {
  fs.mkdirSync(userData, { recursive: true })

  for (const entry of fs.readdirSync(userData, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('employee-connector-staging-')) {
      fs.rmSync(path.join(userData, entry.name), { recursive: true, force: true })
    }
  }

  const directory = fs.mkdtempSync(path.join(userData, 'employee-connector-staging-'))
  const keyPair = crypto.generateKeyPairSync('ed25519')
  const jwk = keyPair.privateKey.export({ format: 'jwk' })
  const seed = requiredJwkBytes(jwk.d, 'private key')
  const rawPublicKey = requiredJwkBytes(jwk.x, 'public key')
  const publicBlob = Buffer.concat([sshString('ssh-ed25519'), sshString(rawPublicKey)])
  const publicKey = `ssh-ed25519 ${publicBlob.toString('base64')} My-King-Employee-Connector`
  const privateKeyPath = path.join(directory, 'relay_client')

  fs.writeFileSync(privateKeyPath, opensshPrivateKey(seed, rawPublicKey, publicBlob), {
    encoding: 'utf8',
    mode: 0o600
  })

  return { directory, privateKeyPath, publicKey }
}
