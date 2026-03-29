/**
 * lib/click-to-edit.ts — WebViewに注入するJS + 型定義
 *
 * DOM要素のタップを検出し、セレクター情報をReact Nativeに送る。
 * PreviewPanel.tsxから使用。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type SelectedElement = {
  selector: string;
  tagName: string;
  text: string;
  currentStyles: {
    color: string;
    fontSize: string;
    backgroundColor: string;
    padding: string;
    margin: string;
  };
  rect: { x: number; y: number; width: number; height: number };
};

// ─── Injected JavaScript ────────────────────────────────────────────────────

export function getClickToEditScript(): string {
  return `
    (function() {
      let isEditMode = false;
      let highlightEl = null;

      function createHighlight() {
        if (highlightEl) return highlightEl;
        highlightEl = document.createElement('div');
        highlightEl.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #00D4AA;background:rgba(0,212,170,0.1);z-index:99999;transition:all 0.15s ease;display:none;border-radius:4px;';
        document.body.appendChild(highlightEl);
        return highlightEl;
      }

      window.addEventListener('message', function(e) {
        try {
          var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (data.type === 'SET_EDIT_MODE') {
            isEditMode = data.enabled;
            document.body.style.cursor = isEditMode ? 'crosshair' : 'default';
            if (!isEditMode && highlightEl) {
              highlightEl.style.display = 'none';
            }
          }
          if (data.type === 'APPLY_CSS') {
            var style = document.createElement('style');
            style.textContent = data.css;
            document.head.appendChild(style);
          }
          if (data.type === 'APPLY_HTML') {
            var target = document.querySelector(data.selector);
            if (target) target.outerHTML = data.html;
          }
        } catch(err) {}
      });

      document.addEventListener('mouseover', function(e) {
        if (!isEditMode) return;
        var el = e.target;
        var hl = createHighlight();
        var rect = el.getBoundingClientRect();
        hl.style.display = 'block';
        hl.style.left = rect.left + 'px';
        hl.style.top = rect.top + 'px';
        hl.style.width = rect.width + 'px';
        hl.style.height = rect.height + 'px';
      }, true);

      document.addEventListener('click', function(e) {
        if (!isEditMode) return;
        e.preventDefault();
        e.stopPropagation();

        var el = e.target;
        var selector = buildUniqueSelector(el);
        var computedStyle = window.getComputedStyle(el);
        var rect = el.getBoundingClientRect();

        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'ELEMENT_SELECTED',
          selector: selector,
          tagName: el.tagName.toLowerCase(),
          text: (el.textContent || '').slice(0, 100),
          currentStyles: {
            color: computedStyle.color,
            fontSize: computedStyle.fontSize,
            backgroundColor: computedStyle.backgroundColor,
            padding: computedStyle.padding,
            margin: computedStyle.margin,
          },
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        }));
      }, true);

      function buildUniqueSelector(el) {
        if (el.id) return '#' + el.id;
        var path = [];
        while (el && el !== document.body) {
          var selector = el.tagName.toLowerCase();
          if (el.className && typeof el.className === 'string') {
            selector += '.' + el.className.trim().split(/\\s+/).join('.');
          }
          path.unshift(selector);
          el = el.parentElement;
        }
        return path.join(' > ');
      }
    })();
    true;
  `;
}

/**
 * 要素にCSS変更を適用するためのinjectJavaScript用文字列を生成。
 */
export function buildApplyCssMessage(css: string): string {
  return JSON.stringify({ type: 'APPLY_CSS', css });
}

/**
 * 要素のHTMLを置換するためのinjectJavaScript用文字列を生成。
 */
export function buildApplyHtmlMessage(selector: string, html: string): string {
  return JSON.stringify({ type: 'APPLY_HTML', selector, html });
}

/**
 * editMode切り替えメッセージ。
 */
export function buildSetEditModeMessage(enabled: boolean): string {
  return JSON.stringify({ type: 'SET_EDIT_MODE', enabled });
}
