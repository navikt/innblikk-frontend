import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getRuntimeConfig } from '../../../shared/lib/runtimeConfig'

const WS_PATH = '/api/canvas/ws'
const PING_INTERVAL_MS = 25_000
const BACKOFF_STEPS_MS = [1_000, 2_000, 4_000, 8_000, 30_000]

type EventHandler = (payload: unknown) => void

export type WsSaveResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; conflict: true; payload: Record<string, unknown> }
  | { ok: false; conflict: false; error: string }

export type CanvasWebSocketHandle = {
  subscribe: (event: string, handler: EventHandler) => () => void
  broadcast: (event: string, payload: unknown) => void
  sendRaw: (msg: Record<string, unknown>) => void
  saveFrame: (msg: Record<string, unknown>) => Promise<WsSaveResult>
  deleteFrame: (msg: Record<string, unknown>) => void
  isConnected: boolean
}

type UseCanvasWebSocketParams = {
  enabled: boolean
  projectId: number | null
  dashboardId: number | null
}

type IncomingMessage = {
  type?: string
  event?: string
  payload?: unknown
}

const buildWsUrl = (): string => {
  const config = getRuntimeConfig()
  const host = config.BACKEND_WS_HOST ?? window.location.host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${host}${WS_PATH}`
}

const fetchWsToken = async (): Promise<string | null> => {
  try {
    const response = await fetch('/api/backend/canvas/ws-token')
    if (!response.ok) return null
    const data = (await response.json()) as { token?: string }
    return data.token ?? null
  } catch {
    return null
  }
}

const useCanvasWebSocket = ({ enabled, projectId, dashboardId }: UseCanvasWebSocketParams): CanvasWebSocketHandle => {
  const [isConnected, setIsConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
  const pendingRequestsRef = useRef<Map<string, { resolve: (result: WsSaveResult) => void; timer: number }>>(new Map())
  const reconnectTimerRef = useRef<number | null>(null)
  const pingTimerRef = useRef<number | null>(null)
  const backoffIndexRef = useRef(0)
  const destroyedRef = useRef(false)

  const projectIdRef = useRef(projectId)
  const dashboardIdRef = useRef(dashboardId)
  useEffect(() => {
    projectIdRef.current = projectId
    dashboardIdRef.current = dashboardId
  }, [projectId, dashboardId])

  const scheduleReconnectRef = useRef<() => void>(() => undefined)
  const connectRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    if (!enabled || projectId === null || dashboardId === null) return

    destroyedRef.current = false

    const clearPing = () => {
      if (pingTimerRef.current !== null) {
        window.clearInterval(pingTimerRef.current)
        pingTimerRef.current = null
      }
    }

    const clearReconnect = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const startPing = (ws: WebSocket) => {
      clearPing()
      pingTimerRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }))
          } catch {
            /* ignored */
          }
        }
      }, PING_INTERVAL_MS)
    }

    const connect = () => {
      if (destroyedRef.current) return

      if (wsRef.current) {
        try {
          wsRef.current.onopen = null
          wsRef.current.onmessage = null
          wsRef.current.onclose = null
          wsRef.current.onerror = null
          wsRef.current.close()
        } catch {
          /* ignored */
        }
        wsRef.current = null
      }

      let ws: WebSocket
      try {
        ws = new WebSocket(buildWsUrl())
      } catch {
        scheduleReconnectRef.current()
        return
      }

      wsRef.current = ws

      ws.onopen = () => {
        if (destroyedRef.current) {
          ws.close()
          return
        }

        // Authenticate by fetching an OBO token and sending it as the first message
        fetchWsToken()
          .then((token) => {
            if (destroyedRef.current || ws.readyState !== WebSocket.OPEN) return
            if (token) {
              ws.send(JSON.stringify({ type: 'auth', token }))
            } else {
              console.warn('[canvas-ws] No auth token available, joining unauthenticated')
            }
            // Join the room
            ws.send(
              JSON.stringify({
                type: 'join',
                projectId: projectIdRef.current,
                dashboardId: dashboardIdRef.current,
              }),
            )
            backoffIndexRef.current = 0
            setIsConnected(true)
            startPing(ws)
          })
          .catch((err) => {
            console.warn('[canvas-ws] Token fetch failed, joining unauthenticated:', err)
            // Auth failed — still try to join (will work in local dev without auth)
            try {
              ws.send(
                JSON.stringify({
                  type: 'join',
                  projectId: projectIdRef.current,
                  dashboardId: dashboardIdRef.current,
                }),
              )
            } catch {
              /* ignored */
            }
            backoffIndexRef.current = 0
            setIsConnected(true)
            startPing(ws)
          })
      }

      ws.onmessage = (event: MessageEvent<unknown>) => {
        if (destroyedRef.current) return
        let parsed: IncomingMessage
        try {
          let raw: string
          if (typeof event.data === 'string') {
            raw = event.data
          } else if (event.data instanceof Blob) {
            // Blob data can't be parsed synchronously — skip
            return
          } else {
            return
          }
          parsed = JSON.parse(raw) as IncomingMessage
        } catch {
          return
        }

        // Handle auth:ok silently
        if (parsed.type === 'auth:ok') return

        // Handle requestId-correlated responses (save/conflict)
        const { event: eventName, payload } = parsed
        if (typeof eventName === 'string' && payload && typeof payload === 'object') {
          const p = payload as Record<string, unknown>
          const requestId = p.requestId as string | undefined
          if (requestId && pendingRequestsRef.current.has(requestId)) {
            const pending = pendingRequestsRef.current.get(requestId)!
            pendingRequestsRef.current.delete(requestId)
            window.clearTimeout(pending.timer)
            if (eventName === 'canvas:saved') {
              pending.resolve({ ok: true, payload: p })
            } else if (eventName === 'canvas:save:conflict') {
              pending.resolve({ ok: false, conflict: true, payload: p })
            }
            // Don't return — let other subscribers also see the event
          }
        }

        if (typeof eventName !== 'string') return
        const handlers = handlersRef.current.get(eventName)
        if (!handlers) return
        for (const handler of handlers) {
          try {
            handler(payload ?? null)
          } catch {
            /* ignored */
          }
        }
      }

      ws.onclose = () => {
        if (destroyedRef.current) return
        clearPing()
        setIsConnected(false)
        wsRef.current = null
        scheduleReconnectRef.current()
      }

      ws.onerror = () => {
        clearPing()
        setIsConnected(false)
      }
    }

    const scheduleReconnect = () => {
      if (destroyedRef.current) return
      clearReconnect()
      const delayMs = BACKOFF_STEPS_MS[Math.min(backoffIndexRef.current, BACKOFF_STEPS_MS.length - 1)]
      backoffIndexRef.current = Math.min(backoffIndexRef.current + 1, BACKOFF_STEPS_MS.length - 1)
      reconnectTimerRef.current = window.setTimeout(() => {
        connectRef.current()
      }, delayMs)
    }

    connectRef.current = connect
    scheduleReconnectRef.current = scheduleReconnect

    connect()

    return () => {
      destroyedRef.current = true
      clearPing()
      clearReconnect()
      setIsConnected(false)
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null
          wsRef.current.onmessage = null
          wsRef.current.onclose = null
          wsRef.current.onerror = null
          wsRef.current.close()
        } catch {
          /* ignored */
        }
        wsRef.current = null
      }
    }
  }, [enabled, projectId, dashboardId])

  const subscribe = useCallback((event: string, handler: EventHandler): (() => void) => {
    let handlers = handlersRef.current.get(event)
    if (!handlers) {
      handlers = new Set()
      handlersRef.current.set(event, handlers)
    }
    handlers.add(handler)
    return () => {
      const set = handlersRef.current.get(event)
      if (set) {
        set.delete(handler)
        if (set.size === 0) {
          handlersRef.current.delete(event)
        }
      }
    }
  }, [])

  const broadcast = useCallback((event: string, payload: unknown): void => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(
        JSON.stringify({
          type: 'broadcast',
          projectId: projectIdRef.current,
          dashboardId: dashboardIdRef.current,
          event,
          payload,
        }),
      )
    } catch {
      /* ignored */
    }
  }, [])

  const sendRaw = useCallback((msg: Record<string, unknown>): void => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      /* ignored */
    }
  }, [])

  const saveFrame = useCallback((msg: Record<string, unknown>): Promise<WsSaveResult> => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, conflict: false, error: 'WebSocket not connected' })
    }

    const requestId = `save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return new Promise<WsSaveResult>((resolve) => {
      const timer = window.setTimeout(() => {
        pendingRequestsRef.current.delete(requestId)
        resolve({ ok: false, conflict: false, error: 'Save timed out' })
      }, 15_000)
      pendingRequestsRef.current.set(requestId, { resolve, timer })
      try {
        ws.send(JSON.stringify({ ...msg, type: 'save', requestId }))
      } catch {
        pendingRequestsRef.current.delete(requestId)
        window.clearTimeout(timer)
        resolve({ ok: false, conflict: false, error: 'Failed to send save message' })
      }
    })
  }, [])

  const deleteFrame = useCallback((msg: Record<string, unknown>): void => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try {
      ws.send(JSON.stringify({ ...msg, type: 'delete' }))
    } catch {
      /* ignored */
    }
  }, [])

  return useMemo(
    () => ({ subscribe, broadcast, sendRaw, saveFrame, deleteFrame, isConnected }),
    [subscribe, broadcast, sendRaw, saveFrame, deleteFrame, isConnected],
  )
}

export default useCanvasWebSocket
