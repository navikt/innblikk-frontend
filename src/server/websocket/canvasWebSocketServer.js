import { WebSocketServer } from 'ws'
import Redis from 'ioredis'
import { getMockUser, loadOasis, resolveUserFromToken } from '../middleware/authUtils.js'

const WS_PATH = '/api/canvas/ws'

// NAIS injects VALKEY_URI_<INSTANCENAME> (uppercase, hyphens → underscores).
// Instance "canvas-ws" → VALKEY_URI_CANVAS_WS.
// NAIS also injects REDIS_URI_CANVAS_WS (rediss:// scheme) for compat with Redis clients.
const VALKEY_URI = process.env.VALKEY_URI_CANVAS_WS || process.env.REDIS_URI_CANVAS_WS || null

const PUBSUB_CHANNEL_PREFIX = 'canvas:room:'

const roomChannel = (roomKey) => `${PUBSUB_CHANNEL_PREFIX}${roomKey}`

const createRedisClient = (uri, label) => {
  const isTls = uri.startsWith('rediss://') || uri.startsWith('valkeys://')
  // ioredis doesn't natively parse the valkeys:// scheme — normalise to rediss://
  const normalizedUri = uri.replace(/^valkeys:\/\//, 'rediss://')
  const client = new Redis(normalizedUri, {
    retryStrategy: (times) => {
      if (times > 10) return null
      return Math.min(times * 500, 10000)
    },
    tls: isTls ? {} : undefined,
    lazyConnect: false,
  })
  client.on('connect', () => console.log(`[Canvas WS] ${label} connected`))
  client.on('error', (err) => console.error(`[Canvas WS] ${label} error:`, err.message))
  client.on('close', () => console.warn(`[Canvas WS] ${label} connection closed`))
  return client
}

async function authenticateUpgradeRequest(req) {
  const mockUser = getMockUser()
  if (mockUser) return { ok: true, user: mockUser }

  const { oasis } = await loadOasis()
  if (!oasis) {
    return { ok: true, user: { navIdent: 'LOCAL_DEV' } }
  }

  return resolveUserFromToken(req, oasis)
}

export function createCanvasWebSocketServer(server) {
  const rooms = new Map()

  // Two separate ioredis connections are required:
  // - pub: for PUBLISH (can be shared with regular commands)
  // - sub: dedicated to SUBSCRIBE mode (ioredis blocks the connection once subscribed)
  let pub = null
  let sub = null
  const valkeyEnabled = Boolean(VALKEY_URI)

  if (valkeyEnabled) {
    console.log('[Canvas WS] Valkey pub/sub enabled — cross-pod broadcast active')
    pub = createRedisClient(VALKEY_URI, 'Valkey pub')
    sub = createRedisClient(VALKEY_URI, 'Valkey sub')
  } else {
    console.warn(
      '[Canvas WS] No VALKEY_URI_CANVAS_WS / REDIS_URI_CANVAS_WS — ' +
        'running in single-pod in-memory mode. Cross-pod broadcast disabled.',
    )
  }

  const wss = new WebSocketServer({ noServer: true })

  // When Valkey delivers a message published by another pod, forward it to
  // all local WS clients in the relevant room.
  if (sub) {
    sub.on('message', (channel, rawMessage) => {
      if (!channel.startsWith(PUBSUB_CHANNEL_PREFIX)) return
      const roomKey = channel.slice(PUBSUB_CHANNEL_PREFIX.length)
      const room = rooms.get(roomKey)
      if (!room || room.size === 0) return
      // rawMessage is already serialised JSON — forward as-is
      for (const client of room) {
        if (client.readyState === client.OPEN) {
          client.send(rawMessage)
        }
      }
    })
  }

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`)
    if (url.pathname !== WS_PATH) return

    try {
      const authResult = await authenticateUpgradeRequest(req)
      if (!authResult.ok) {
        console.log('[Canvas WS] Rejected unauthenticated upgrade')
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        ws._user = authResult.user
        wss.emit('connection', ws, req)
      })
    } catch (err) {
      console.error('[Canvas WS] Error during upgrade auth:', err)
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
      socket.destroy()
    }
  })

  wss.on('connection', (ws) => {
    let currentRoomKey = null

    const leaveRoom = () => {
      if (!currentRoomKey) return

      const room = rooms.get(currentRoomKey)
      if (room) {
        room.delete(ws)
        const remaining = room.size
        console.log(
          `[Canvas WS] ${ws._user?.navIdent ?? 'unknown'} left room ${currentRoomKey} (${remaining} remaining on this pod)`,
        )
        if (remaining === 0) {
          rooms.delete(currentRoomKey)
          // Unsubscribe from the Valkey channel when this pod has no more clients
          // in the room — pod stops receiving messages it has nobody to deliver to.
          if (sub) {
            sub.unsubscribe(roomChannel(currentRoomKey)).catch((err) => {
              console.warn(`[Canvas WS] Failed to unsubscribe from ${currentRoomKey}:`, err.message)
            })
          }
        }
      }

      currentRoomKey = null
    }

    const send = (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data))
      }
    }

    ws.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        send({ type: 'error', message: 'Invalid JSON' })
        return
      }

      if (msg.type === 'ping') {
        send({ type: 'pong' })
        return
      }

      if (msg.type === 'join') {
        const { projectId, dashboardId } = msg
        if (!Number.isFinite(Number(projectId)) || !Number.isFinite(Number(dashboardId))) {
          send({ type: 'error', message: 'join requires numeric projectId and dashboardId' })
          return
        }

        leaveRoom()
        const nextRoomKey = `${projectId}:${dashboardId}`
        currentRoomKey = nextRoomKey

        if (!rooms.has(nextRoomKey)) rooms.set(nextRoomKey, new Set())
        rooms.get(nextRoomKey).add(ws)

        console.log(
          `[Canvas WS] ${ws._user?.navIdent ?? 'unknown'} joined room ${nextRoomKey} (${rooms.get(nextRoomKey).size} total on this pod)`,
        )

        // Subscribe to the Valkey channel for this room on first local client join.
        // ioredis deduplicates — safe to call multiple times for the same channel.
        if (sub) {
          sub.subscribe(roomChannel(nextRoomKey)).catch((err) => {
            console.warn(`[Canvas WS] Failed to subscribe to ${nextRoomKey}:`, err.message)
          })
        }

        return
      }

      if (msg.type === 'broadcast') {
        const { projectId, dashboardId, event, payload } = msg
        if (!projectId || !dashboardId || !event) {
          send({ type: 'error', message: 'broadcast requires projectId, dashboardId, event' })
          return
        }

        const roomKey = `${projectId}:${dashboardId}`
        const outgoing = JSON.stringify({ type: 'event', event, payload })

        // 1. Deliver to local clients on this pod immediately (no Valkey round-trip needed)
        const room = rooms.get(roomKey)
        if (room) {
          for (const client of room) {
            if (client !== ws && client.readyState === client.OPEN) {
              client.send(outgoing)
            }
          }
        }

        // 2. Publish to Valkey so other pods deliver to their local clients in this room.
        //    No-op when Valkey is unavailable (local dev / single-pod deployments).
        if (pub) {
          pub.publish(roomChannel(roomKey), outgoing).catch((err) => {
            console.warn(`[Canvas WS] Valkey publish failed for room ${roomKey}:`, err.message)
          })
        }

        return
      }

      send({ type: 'error', message: `Unknown message type: ${msg.type}` })
    })

    ws.on('close', () => {
      leaveRoom()
    })

    ws.on('error', (err) => {
      console.error('[Canvas WS] Socket error:', err.message)
      leaveRoom()
    })
  })

  const modeLabel = valkeyEnabled ? 'with Valkey pub/sub (cross-pod)' : 'in-memory only (single pod)'
  console.log(`[Canvas WS] WebSocket server ready at ${WS_PATH} — ${modeLabel}`)

  return wss
}
