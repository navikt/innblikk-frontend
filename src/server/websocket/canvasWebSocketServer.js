import { WebSocketServer } from 'ws'
import Redis from 'ioredis'
import { getMockUser, loadOasis, resolveUserFromToken } from '../middleware/authUtils.js'

const WS_PATH = '/api/canvas/ws'

// NAIS injects VALKEY_URI_<INSTANCENAME> (uppercase, hyphens → underscores).
// Instance "canvas-ws" → VALKEY_URI_CANVAS_WS.
// NAIS also injects REDIS_URI_CANVAS_WS (rediss:// scheme) for compat with Redis clients.
const VALKEY_URI = process.env.VALKEY_URI_CANVAS_WS || process.env.REDIS_URI_CANVAS_WS || null

const PUBSUB_CHANNEL_PREFIX = 'canvas:room:'
const LOCK_TTL_MS = 15000

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

// In-memory lock state per room.
// roomLocks: Map<roomKey, Map<frameGraphId, LockEntry>>
// LockEntry: { ownerId, ownerLabel, expiresAt (ms timestamp) }
const roomLocks = new Map()

const getOrCreateRoomLocks = (roomKey) => {
  if (!roomLocks.has(roomKey)) roomLocks.set(roomKey, new Map())
  return roomLocks.get(roomKey)
}

const pruneExpiredLocks = (locksForRoom) => {
  const now = Date.now()
  for (const [frameGraphId, entry] of locksForRoom) {
    if (entry.expiresAt <= now) locksForRoom.delete(frameGraphId)
  }
}

const serializeLocksForRoom = (roomKey) => {
  const locksForRoom = roomLocks.get(roomKey)
  if (!locksForRoom) return {}
  pruneExpiredLocks(locksForRoom)
  const result = {}
  for (const [frameGraphId, entry] of locksForRoom) {
    result[frameGraphId] = {
      ownerId: entry.ownerId,
      ownerLabel: entry.ownerLabel,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    }
  }
  return result
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

  // Broadcast a serialised message to all local clients in a room (excluding optional sender).
  const broadcastToRoom = (roomKey, data, excludeWs = null) => {
    const room = rooms.get(roomKey)
    if (!room) return
    const raw = JSON.stringify(data)
    for (const client of room) {
      if (client !== excludeWs && client.readyState === client.OPEN) {
        client.send(raw)
      }
    }
  }

  // Publish a message to Valkey so other pods deliver to their local clients.
  const publishToValkey = (roomKey, data) => {
    if (!pub) return
    pub.publish(roomChannel(roomKey), JSON.stringify(data)).catch((err) => {
      console.warn(`[Canvas WS] Valkey publish failed for room ${roomKey}:`, err.message)
    })
  }

  // When Valkey delivers a message published by another pod, forward it to
  // all local WS clients in the relevant room.
  if (sub) {
    sub.on('message', (channel, rawMessage) => {
      if (!channel.startsWith(PUBSUB_CHANNEL_PREFIX)) return
      const roomKey = channel.slice(PUBSUB_CHANNEL_PREFIX.length)
      const room = rooms.get(roomKey)
      if (!room || room.size === 0) return

      // For lock messages arriving from another pod we need to apply them to
      // our in-memory lock state so this pod stays consistent.
      let parsed = null
      try {
        parsed = JSON.parse(rawMessage)
      } catch {
        /* ignore malformed */
      }
      if (parsed?.event === 'canvas:lock:state') {
        // Another pod is broadcasting full lock state — merge into our room locks.
        // We trust the canonical state broadcast over per-entry mutations because
        // it contains already-pruned, authoritative data from that pod's room.
        const incoming = parsed?.payload
        if (incoming && typeof incoming === 'object') {
          const locksForRoom = getOrCreateRoomLocks(roomKey)
          locksForRoom.clear()
          for (const [frameGraphId, entry] of Object.entries(incoming)) {
            const expiresAt = Date.parse(entry.expiresAt)
            if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) continue
            locksForRoom.set(Number(frameGraphId), {
              ownerId: entry.ownerId,
              ownerLabel: entry.ownerLabel,
              expiresAt,
            })
          }
        }
      }

      // rawMessage is already serialised JSON — forward as-is to local clients.
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
          roomLocks.delete(currentRoomKey)
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

        // Send current lock state to the newly joined client so they immediately
        // know which frames are locked without waiting for the next broadcast.
        const currentLocks = serializeLocksForRoom(nextRoomKey)
        send({ type: 'event', event: 'canvas:lock:state', payload: currentLocks })

        return
      }

      // ── Lock acquire ────────────────────────────────────────────────────────
      if (msg.type === 'lock:acquire') {
        const { frameGraphId, ownerId, ownerLabel } = msg
        if (!Number.isFinite(Number(frameGraphId)) || !ownerId) {
          send({ type: 'error', message: 'lock:acquire requires frameGraphId and ownerId' })
          return
        }
        if (!currentRoomKey) {
          send({ type: 'error', message: 'Must join a room before acquiring a lock' })
          return
        }

        const roomKey = currentRoomKey
        const locksForRoom = getOrCreateRoomLocks(roomKey)
        pruneExpiredLocks(locksForRoom)

        const fid = Number(frameGraphId)
        const existing = locksForRoom.get(fid)
        const now = Date.now()

        if (existing && existing.ownerId !== ownerId && existing.expiresAt > now) {
          // Lock held by someone else and not expired.
          send({
            type: 'event',
            event: 'canvas:lock:denied',
            payload: {
              frameGraphId: fid,
              ownerId: existing.ownerId,
              ownerLabel: existing.ownerLabel,
              expiresAt: new Date(existing.expiresAt).toISOString(),
            },
          })
          return
        }

        const expiresAt = now + LOCK_TTL_MS
        locksForRoom.set(fid, { ownerId, ownerLabel: ownerLabel || 'En kollega', expiresAt })

        const lockState = serializeLocksForRoom(roomKey)
        const stateEvent = { type: 'event', event: 'canvas:lock:state', payload: lockState }

        // Confirm to requester and broadcast to all others in room.
        send({ type: 'event', event: 'canvas:lock:acquired', payload: { frameGraphId: fid } })
        broadcastToRoom(roomKey, stateEvent, ws)
        publishToValkey(roomKey, stateEvent)
        return
      }

      // ── Lock release ────────────────────────────────────────────────────────
      if (msg.type === 'lock:release') {
        const { frameGraphId, ownerId } = msg
        if (!Number.isFinite(Number(frameGraphId)) || !ownerId) {
          send({ type: 'error', message: 'lock:release requires frameGraphId and ownerId' })
          return
        }
        if (!currentRoomKey) return

        const roomKey = currentRoomKey
        const locksForRoom = roomLocks.get(roomKey)
        if (locksForRoom) {
          const fid = Number(frameGraphId)
          const existing = locksForRoom.get(fid)
          // Only the owner may release their own lock.
          if (existing && existing.ownerId === ownerId) {
            locksForRoom.delete(fid)
          }
        }

        const lockState = serializeLocksForRoom(roomKey)
        const stateEvent = { type: 'event', event: 'canvas:lock:state', payload: lockState }
        broadcastToRoom(roomKey, stateEvent, ws)
        publishToValkey(roomKey, stateEvent)
        // Also confirm to sender so they can update their own state immediately.
        send(stateEvent)
        return
      }

      // ── Lock renew (heartbeat — extend TTL without re-acquiring) ────────────
      if (msg.type === 'lock:renew') {
        const { frameGraphId, ownerId } = msg
        if (!Number.isFinite(Number(frameGraphId)) || !ownerId) return
        if (!currentRoomKey) return

        const locksForRoom = roomLocks.get(currentRoomKey)
        if (locksForRoom) {
          const fid = Number(frameGraphId)
          const existing = locksForRoom.get(fid)
          if (existing && existing.ownerId === ownerId) {
            existing.expiresAt = Date.now() + LOCK_TTL_MS
          }
        }
        // No broadcast needed for renew — TTL extension is invisible to peers.
        return
      }

      if (msg.type === 'broadcast') {
        const { projectId, dashboardId, event, payload } = msg
        if (!projectId || !dashboardId || !event) {
          send({ type: 'error', message: 'broadcast requires projectId, dashboardId, event' })
          return
        }

        const roomKey = `${projectId}:${dashboardId}`
        const outgoing = { type: 'event', event, payload }

        // 1. Deliver to local clients on this pod immediately (no Valkey round-trip needed)
        broadcastToRoom(roomKey, outgoing, ws)

        // 2. Publish to Valkey so other pods deliver to their local clients in this room.
        //    No-op when Valkey is unavailable (local dev / single-pod deployments).
        publishToValkey(roomKey, outgoing)

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
