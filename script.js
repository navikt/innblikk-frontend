// ==UserScript==
// @name        bigger sidebar for loop cloud.microsoft
// @namespace   Violentmonkey Scripts
// @match       https://loop.cloud.microsoft/p/*
// @require https://cdn.jsdelivr.net/npm/@violentmonkey/dom@2
// @grant       none
// @version     1.0
// @author      -
// @description 25/03/2026, 10:17:16
// ==/UserScript==

;(function () {
  const BREAKPOINT = 1026
  const DEFAULT_WIDTH = 500
  const STORAGE_KEY = 'sidebarWidth'
  const STEP = 20

  function getStoredWidth() {
    const v = parseInt(localStorage.getItem(STORAGE_KEY), 10)
    return Number.isFinite(v) ? v : DEFAULT_WIDTH
  }

  function storeWidth(w) {
    localStorage.setItem(STORAGE_KEY, w)
  }

  function applyDrawerWidth() {
    if (window.innerWidth < BREAKPOINT) return

    const drawer = document.querySelector('#Sidebar')
    if (!drawer) return

    const width = getStoredWidth() + 'px'
    drawer.style.setProperty('--fui-Drawer--size', width)
    drawer.style.width = width

    const wrapper = drawer.closest('aside')
    if (wrapper) wrapper.style.maxWidth = 'none'
  }

  function ensureControls() {
    const drawer = document.querySelector('#Sidebar')
    if (!drawer) return

    const aside = drawer.closest('aside')
    if (!aside) return

    if (document.querySelector('#sidebar-resizer-controls')) return

    // Wait until footer and its hr divider are present
    const footer = aside.querySelector('footer')
    const hr = footer && footer.firstElementChild
    if (!hr) return // not ready yet — VM.observe will retry

    const controls = document.createElement('div')
    controls.id = 'sidebar-resizer-controls'
    controls.style.cssText = `
            display:flex;
            gap:6px;
            padding:8px;
            margin:8px 0;
            background:rgba(255,255,255,0.08);
            border-radius:6px;
            color:white;
            font-size:12px;
        `

    const btnMinus = document.createElement('button')
    const btnPlus = document.createElement('button')
    const label = document.createElement('span')

    btnMinus.textContent = '−'
    btnPlus.textContent = '+'
    label.textContent = getStoredWidth() + 'px'

    for (const btn of [btnMinus, btnPlus]) {
      btn.style.cssText = `
                padding:2px 8px;
                background:#444;
                color:white;
                border:1px solid #666;
                border-radius:4px;
                cursor:pointer;
            `
    }

    controls.append(btnMinus, label, btnPlus)

    hr.after(controls)

    btnMinus.addEventListener('click', () => {
      const newW = Math.max(200, getStoredWidth() - STEP)
      storeWidth(newW)
      label.textContent = newW + 'px'
      applyFix()
    })

    btnPlus.addEventListener('click', () => {
      const newW = getStoredWidth() + STEP
      storeWidth(newW)
      label.textContent = newW + 'px'
      applyFix()
    })
  }

  function applyFix() {
    applyDrawerWidth()
    ensureControls()
  }

  let scheduled = false
  function scheduleFix() {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      applyFix()
    })
  }

  VM.observe(document.body, scheduleFix)
  window.addEventListener('resize', scheduleFix)

  scheduleFix()
})()
