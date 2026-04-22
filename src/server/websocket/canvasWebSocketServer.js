import { WebSocketServer } from 'ws'
import { getMockUser, loadOasis, resolveUserFromToken } from '../middleware/authUtils.js'

const WS_PATH = '/api/canvas/ws'

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

  const wss = new WebSocketServer({ noServer: true })

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
      if (currentRoomKey) {
        const room = rooms.get(currentRoomKey)
        if (room) {
          room.delete(ws)
          if (room.size === 0) rooms.delete(currentRoomKey)
          console.log(
            `[Canvas WS] ${ws._user?.navIdent ?? 'unknown'} left room ${currentRoomKey} (${rooms.get(currentRoomKey)?.size ?? 0} remaining)`,
          )
        }
        currentRoomKey = null
      }
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
        currentRoomKey = `${projectId}:${dashboardId}`
        if (!rooms.has(currentRoomKey)) rooms.set(currentRoomKey, new Set())
        rooms.get(currentRoomKey).add(ws)

        console.log(
          `[Canvas WS] ${ws._user?.navIdent ?? 'unknown'} joined room ${currentRoomKey} (${rooms.get(currentRoomKey).size} total)`,
        )
        return
      }

      if (msg.type === 'broadcast') {
        const { projectId, dashboardId, event, payload } = msg
        if (!projectId || !dashboardId || !event) {
          send({ type: 'error', message: 'broadcast requires projectId, dashboardId, event' })
          return
        }

        const roomKey = `${projectId}:${dashboardId}`
        const room = rooms.get(roomKey)
        if (!room) return

        const outgoing = JSON.stringify({ type: 'event', event, payload })
        for (const client of room) {
          if (client.readyState === client.OPEN) {
            client.send(outgoing)
          }
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

  console.log(`[Canvas WS] WebSocket server ready at ${WS_PATH}`)
  return wss
}
