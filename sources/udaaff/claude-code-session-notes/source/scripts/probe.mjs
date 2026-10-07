// Checks which ports answer and finds the machine's LAN address.
//
//   node probe.mjs 5173 8080
//   → {"lan":"192.168.1.5","ports":{"5173":"lan","8080":"dead"}}
//
// A port is "lan" when it answers on the LAN address (a phone can open it),
// "local" when it answers on 127.0.0.1 only, "dead" otherwise.

import net from 'node:net'
import os from 'node:os'

const VIRTUAL = /vEthernet|VirtualBox|VMware|Hyper-V|Loopback|docker|WSL|utun|bridge/i

const lanAddress = () => {
  const found = []
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      found.push(address.address)
    }
  }
  const isPrivate = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)
  return found.find(isPrivate) ?? found[0] ?? null
}

const answers = (host, port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 500 })
    const done = (ok) => {
      socket.destroy()
      resolve(ok)
    }
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })

const lan = lanAddress()
const ports = {}
await Promise.all(
  process.argv
    .slice(2)
    .map(Number)
    .filter((port) => Number.isInteger(port) && port > 0 && port < 65536)
    .map(async (port) => {
      if (lan !== null && (await answers(lan, port))) ports[port] = 'lan'
      else if (await answers('127.0.0.1', port)) ports[port] = 'local'
      else ports[port] = 'dead'
    }),
)
process.stdout.write(JSON.stringify({ lan, ports }))
