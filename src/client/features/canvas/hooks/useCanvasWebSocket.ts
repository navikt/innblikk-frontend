import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const WS_PATH = '/api/canvas/ws'
const PING_INTERVAL_MS = 25_000
const BACKOFF_STEPS_MS = [1_000, 2_000, 4_000, 8_000, 30_000]

type EventHandler = (payload: unknown) => void

export type CanvasWebSocketHandle = {
  subscribe: (event: string, handler: EventHandler) => () => void
  broadcast: (event: string, payload: unknown) => void
  isConnected: boolean
}

type UseCanvasWebSocketParams = {
  enabled: boolean
  projectId: number | null
  dashboardId: number | null
}

type IncomingMessage = {
  event?: string
  payload?: unknown
}

const buildWsUrl = (): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${WS_PATH}`
}

const useCanvasWebSocket = ({ enabled, projectId, dashboardId }: UseCanvasWebSocketParams): CanvasWebSocketHandle => {
  const [isConnected, setIsConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
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
        backoffIndexRef.current = 0
        setIsConnected(true)
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
        startPing(ws)
      }

      ws.onmessage = (event: MessageEvent<unknown>) => {
        if (destroyedRef.current) return
        let parsed: IncomingMessage
        try {
          parsed = JSON.parse(typeof event.data === 'string' ? event.data : '') as IncomingMessage
        } catch {
          return
        }
        const { event: eventName, payload } = parsed
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
        // onclose fires after onerror — reconnect handled there
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

  return useMemo(() => ({ subscribe, broadcast, isConnected }), [subscribe, broadcast, isConnected])
}

export default useCanvasWebSocket
