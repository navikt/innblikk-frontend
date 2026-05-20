/// <reference types="vite/client" />

interface UmamiTracker {
  track(eventName: string, data?: Record<string, unknown> | object): void
  track(dataCallback: (props: Record<string, unknown>) => Record<string, unknown>): void
}

declare global {
  interface Window {
    umami?: UmamiTracker
    __innblikk_sporing_dev__?: (type: string, payload: Record<string, unknown>) => false
  }
}

export {}

declare module 'xlsx-js-style' {
  export const utils: {
    aoa_to_sheet(data: unknown[][]): unknown
    book_new(): unknown
    book_append_sheet(workbook: unknown, worksheet: unknown, name: string): void
  }
  export function write(workbook: unknown, opts: { bookType: string; type: string }): ArrayBuffer
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module '*.css' {
  const content: Record<string, string>
  export default content
}

declare module '*.scss' {
  const content: Record<string, string>
  export default content
}

declare module '*.sass' {
  const content: Record<string, string>
  export default content
}

declare module '*.less' {
  const content: Record<string, string>
  export default content
}

declare global {
  interface ImportMetaEnv {
    VITE_APP_TITLE: string
    VITE_APP_VERSION: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  const __GIT_SHA__: string
}
