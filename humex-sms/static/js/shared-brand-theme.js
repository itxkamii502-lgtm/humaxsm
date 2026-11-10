/* ═══════════════════════════════════════════════════════════════════
   HUMEX SMS / Universal Brand, Logo & Theme Engine
   Applies dynamic site name, logo, typography (fonts), theme colors,
   and signature multi-color animated topbar header gradients
   across all panels (Owner, Manager, Agent, Client, Test, Login).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  if (typeof window.escapeHtml !== 'function') {
    window.escapeHtml = function (str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
      });
    };
  }

  const HEADER_GRADIENTS = {
    dark_green: {
      name: 'Emerald Forest Wave (Primary Default)',
      desc: 'Deep Emerald, Pine Forest, Dark Obsidian (System Primary Theme)',
      gradient: 'linear-gradient(180deg, #1b4332 0%, #143627 50%, #081c15 100%)',
      color1: '#1b4332', stop1: 0,
      color2: '#143627', stop2: 50,
      color3: '#081c15', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff',
      isPrimary: true,
      isProtected: true
    },
    clean_white_slate: {
      name: 'Clean White & Midnight Dashboard',
      desc: 'Pure White Workspace + Bold Black Fonts',
      gradient: 'linear-gradient(180deg, #475569 0%, #1e293b 50%, #0f172a 100%)',
      color1: '#475569', stop1: 0,
      color2: '#1e293b', stop2: 50,
      color3: '#0f172a', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    green_wave: {
      name: 'Signature 3-Color Wave',
      desc: 'Lime Green, Deep Blue, Dark Forest Green',
      gradient: 'linear-gradient(180deg, #78B800 0%, #005c90 60%, #2B4300 100%)',
      color1: '#78B800', stop1: 0,
      color2: '#005c90', stop2: 60,
      color3: '#2B4300', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    midnight_slate: {
      name: 'Midnight Slate Elite',
      desc: 'Silver Slate, Gunmetal, Onyx Charcoal',
      gradient: 'linear-gradient(180deg, #64748b 0%, #334155 50%, #0f172a 100%)',
      color1: '#64748b', stop1: 0,
      color2: '#334155', stop2: 50,
      color3: '#0f172a', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    emerald_lime: {
      name: 'Emerald Lime Glow',
      desc: 'Neon Lime, Emerald Green, Deep Forest',
      gradient: 'linear-gradient(180deg, #8FE51F 0%, #059669 50%, #064e3b 100%)',
      color1: '#8FE51F', stop1: 0,
      color2: '#059669', stop2: 50,
      color3: '#064e3b', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    sunset_amber: {
      name: 'Sunset Amber & Rust',
      desc: 'Gold, Amber Orange, Deep Crimson Rust',
      gradient: 'linear-gradient(180deg, #f59e0b 0%, #d97706 45%, #991b1b 100%)',
      color1: '#f59e0b', stop1: 0,
      color2: '#d97706', stop2: 45,
      color3: '#991b1b', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    ocean_cobalt: {
      name: 'Royal Ocean Cobalt',
      desc: 'Sky Blue, Electric Cobalt, Deep Navy',
      gradient: 'linear-gradient(180deg, #38bdf8 0%, #0284c7 45%, #0f172a 100%)',
      color1: '#38bdf8', stop1: 0,
      color2: '#0284c7', stop2: 45,
      color3: '#0f172a', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    cyber_neon: {
      name: 'Cyber Violet Neon',
      desc: 'Vibrant Purple, Indigo Blue, Midnight',
      gradient: 'linear-gradient(180deg, #a855f7 0%, #6366f1 50%, #1e1b4b 100%)',
      color1: '#a855f7', stop1: 0,
      color2: '#6366f1', stop2: 50,
      color3: '#1e1b4b', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    ruby_crimson: {
      name: 'Ruby Velvet Crimson',
      desc: 'Coral Red, Vivid Crimson, Black Cherry',
      gradient: 'linear-gradient(180deg, #f87171 0%, #dc2626 50%, #450a0a 100%)',
      color1: '#f87171', stop1: 0,
      color2: '#dc2626', stop2: 50,
      color3: '#450a0a', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    },
    forest_teal: {
      name: 'Forest Teal & Jade',
      desc: 'Aquamarine, Deep Teal, Dark Jade',
      gradient: 'linear-gradient(180deg, #14b8a6 0%, #0d9488 50%, #134e4a 100%)',
      color1: '#14b8a6', stop1: 0,
      color2: '#0d9488', stop2: 50,
      color3: '#134e4a', stop3: 100,
      angle: '180deg',
      textColor: '#ffffff'
    }
  };

  const THEME_PALETTES = {
    dark_green: {
      accent: '#4ade80',
      primary: '#166534',
      primaryHover: '#14532d',
      glow: 'rgba(22, 101, 52, 0.3)',
      gradient: 'linear-gradient(135deg, #15803d 0%, #14532d 100%)'
    },
    green: {
      accent: '#4ade80',
      primary: '#166534',
      primaryHover: '#14532d',
      glow: 'rgba(22, 101, 52, 0.3)',
      gradient: 'linear-gradient(135deg, #15803d 0%, #14532d 100%)'
    },
    gold: {
      accent: '#f59e0b',
      primary: '#d97706',
      primaryHover: '#b45309',
      glow: 'rgba(245,158,11,0.25)',
      gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)'
    },
    blue: {
      accent: '#38bdf8',
      primary: '#0284c7',
      primaryHover: '#0369a1',
      glow: 'rgba(56,189,248,0.25)',
      gradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)'
    },
    cyan: {
      accent: '#06b6d4',
      primary: '#0891b2',
      primaryHover: '#0e7490',
      glow: 'rgba(6,182,212,0.25)',
      gradient: 'linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)'
    },
    purple: {
      accent: '#a855f7',
      primary: '#7e22ce',
      primaryHover: '#6b21a8',
      glow: 'rgba(168,85,247,0.25)',
      gradient: 'linear-gradient(135deg, #c084fc 0%, #7e22ce 100%)'
    },
    crimson: {
      accent: '#f87171',
      primary: '#dc2626',
      primaryHover: '#b91c1c',
      glow: 'rgba(248,113,113,0.25)',
      gradient: 'linear-gradient(135deg, #f87171 0%, #dc2626 100%)'
    },
    dark: {
      accent: '#94a3b8',
      primary: '#334155',
      primaryHover: '#1e293b',
      glow: 'rgba(148,163,184,0.25)',
      gradient: 'linear-gradient(135deg, #64748b 0%, #1e293b 100%)'
    }
  };

  const FONT_DEFS = {
    inter: {
      family: "'Inter', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
    },
    poppins: {
      family: "'Poppins', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
    },
    roboto: {
      family: "'Roboto', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap'
    },
    outfit: {
      family: "'Outfit', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
    },
    montserrat: {
      family: "'Montserrat', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap'
    },
    opensans: {
      family: "'Open Sans', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap'
    },
    jakarta: {
      family: "'Plus Jakarta Sans', sans-serif",
      url: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'
    },
    system: {
      family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      url: null
    },
    monospace: {
      family: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      url: null
    }
  };

  const DEFAULT_PRIMARY_SETTINGS = {
    site_name: 'HUMEX SMS',
    logo_url: '/static/img/humex-sms-logo.png',
    theme_color: 'green',
    theme_mode: 'light',
    font_family: 'system',
    header_gradient_preset: 'clean_white',
    header_gradient: 'linear-gradient(180deg, #ffffff 0%, #f8faf9 100%)',
    header_text_color: '#1e293b',
    header_font_weight: '700'
  };

  let _currentSettings = { ...DEFAULT_PRIMARY_SETTINGS };
  try {
    if (window.__BRAND_SETTINGS__ && typeof window.__BRAND_SETTINGS__ === 'object') {
      _currentSettings = { ..._currentSettings, ...window.__BRAND_SETTINGS__ };
    } else {
      const cached = localStorage.getItem('app_brand_settings');
      if (cached) _currentSettings = { ..._currentSettings, ...JSON.parse(cached) };
    }
  } catch (e) {}

  function loadGoogleFont(fontKey) {
    const def = FONT_DEFS[fontKey] || FONT_DEFS.inter;
    if (def.url) {
      const linkId = 'dynamic-google-font-' + fontKey;
      if (!document.getElementById(linkId)) {
        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = def.url;
        document.head.appendChild(link);
      }
    }
    return def.family;
  }

  function applyBrandTheme(settings) {
    if (!settings) return;
    _currentSettings = { ..._currentSettings, ...settings };
    try {
      localStorage.setItem('app_brand_settings', JSON.stringify(_currentSettings));
    } catch (e) {}

    // Register custom presets if available
    if (Array.isArray(_currentSettings.custom_presets)) {
      _currentSettings.custom_presets.forEach(cp => {
        if (cp && cp.key && cp.key !== 'dark_green') {
          HEADER_GRADIENTS[cp.key] = {
            name: cp.name || cp.key,
            desc: cp.desc || '',
            gradient: cp.gradient || `linear-gradient(${cp.a || '180deg'}, ${cp.c1} ${cp.s1 || 0}%, ${cp.c2} ${cp.s2 || 50}%, ${cp.c3} ${cp.s3 || 100}%)`,
            color1: cp.c1, stop1: cp.s1,
            color2: cp.c2, stop2: cp.s2,
            color3: cp.c3, stop3: cp.s3,
            angle: cp.a || '180deg',
            textColor: cp.txt || '#ffffff',
            isCustom: true
          };
        }
      });
    }

    const siteName = _currentSettings.site_name || 'HUMEX SMS';
    const logoUrl = _currentSettings.logo_url || '/static/img/humex-sms-logo.png';
    const themeColor = _currentSettings.theme_color || 'dark_green';
    const fontKey = _currentSettings.font_family || 'system';
    const palette = THEME_PALETTES[themeColor] || THEME_PALETTES.dark_green || THEME_PALETTES.green;

    // Header multi-color wave gradient & typography styles
    const headerPreset = _currentSettings.header_gradient_preset || 'dark_green';
    const headerGrad = _currentSettings.header_gradient || (HEADER_GRADIENTS[headerPreset] ? HEADER_GRADIENTS[headerPreset].gradient : HEADER_GRADIENTS.dark_green.gradient);
    const headerTextColor = _currentSettings.header_text_color || '#ffffff';
    const headerFontWeight = _currentSettings.header_font_weight || '700';

    // Synchronize critical zero-fouc-shield style tag
    try {
      let foucShield = document.getElementById('zero-fouc-shield');
      if (!foucShield) {
        foucShield = document.createElement('style');
        foucShield.id = 'zero-fouc-shield';
        (document.head || document.documentElement).appendChild(foucShield);
      }
      foucShield.textContent = ':root{--header-gradient:' + headerGrad + ' !important;--header-text-color:' + headerTextColor + ' !important;--header-font-weight:' + headerFontWeight + ' !important;--brand-primary:' + palette.primary + ' !important;--brand-hover:' + palette.primaryHover + ' !important;--brand-accent:' + palette.accent + ' !important;}' +
        '.zy-header, .adminui .zy-header, .zy-header-row, .adminui .zy-header-row, .zy-side-head, .adminui .zy-side-head, .zy-side-foot, .adminui .zy-side-foot { background: #ffffff !important; color: #1e293b !important; border-bottom: 1.5px solid #d5e4dd !important; }' +
        '.zy-head-title, .zy-role, .zy-welcome, .adminui .zy-user, .zy-user { color: #1e293b !important; }' +
        '.zy-side, .adminui .zy-side, .zy-sidenav, .adminui .zy-sidenav { background: #ffffff !important; background-color: #ffffff !important; }' +
        '.zy-main { background-color: #edf3f0 !important; }';
    } catch(e) {}

    // 1. Update Document Title
    const curTitle = document.title || '';
    if (curTitle.includes('—') || curTitle.includes('|')) {
      const sep = curTitle.includes('—') ? ' — ' : ' | ';
      const parts = curTitle.split(sep);
      document.title = parts[0].trim() + sep + siteName;
    } else {
      document.title = curTitle.replace(/WARRIOR SMS|Warrior SMS|warrior sms|HUMEX SMS|Alpha SMS|Astra SMS|ASTRA SMS|𝑴𝑨𝑰𝑻 𝑺𝑴𝑺|MAIT SMS/g, siteName) || siteName;
    }

    // 2. Update Favicon
    let icon = document.querySelector("link[rel*='icon']");
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.href = logoUrl;

    // 3. Update Font Family & Styles
    const fontFamily = loadGoogleFont(fontKey);

    // Apply CSS variables directly to documentElement synchronously
    try {
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--brand-accent', palette.accent);
      rootStyle.setProperty('--brand-primary', palette.primary);
      rootStyle.setProperty('--brand-hover', palette.primaryHover);
      rootStyle.setProperty('--brand-glow', palette.glow);
      rootStyle.setProperty('--brand-gradient', palette.gradient);
      rootStyle.setProperty('--header-gradient', headerGrad);
      rootStyle.setProperty('--header-text-color', headerTextColor);
      rootStyle.setProperty('--header-font-weight', headerFontWeight);
      rootStyle.setProperty('--app-font', fontFamily);
    } catch (e) {}

    let styleTag = document.getElementById('dynamic-brand-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'dynamic-brand-styles';
      (document.head || document.documentElement).appendChild(styleTag);
    }

    styleTag.innerHTML = `
      :root {
        --brand-accent: ${palette.accent};
        --brand-primary: ${palette.primary};
        --brand-hover: ${palette.primaryHover};
        --brand-glow: ${palette.glow};
        --brand-gradient: ${palette.gradient};
        --header-gradient: ${headerGrad};
        --header-text-color: ${headerTextColor};
        --header-font-weight: ${headerFontWeight};
        --app-font: ${fontFamily};
      }
      body, button, input, select, textarea, .card, .dt, .zy-sidenav, .page-title, h1, h2, h3, h4 {
        font-family: var(--app-font) !important;
      }

      /* ── Crisp Professional Workspace: Clean White with High Contrast Dark Typography ── */
      body, .zy-main, .page-content, .zy-body {
        background-color: #ffffff !important;
        color: #0f172a !important;
      }
      .card, .dt, .panel, .zy-panel, .card-body {
        background-color: #ffffff !important;
        color: #0f172a !important;
        border-color: #e2e8f0 !important;
      }
      h1, h2, h3, h4, .page-title, .card-title {
        color: #0f172a !important;
      }
      .table, table.dt, table.zy-dt, table.zy-dt2-table {
        color: #0f172a !important;
        background-color: #ffffff !important;
      }
      table.zy-dt2-table td, table.dt td, .dt tbody td {
        color: #1e293b !important;
      }
      label, .form-label {
        color: #1e293b !important;
      }

      /* ── Sleek High-Definition Sidebar (Owner, Manager, Agent, Client, TestPanel) ── */
      .zy-side, .adminui .zy-side {
        background: #ffffff !important;
        background-color: #ffffff !important;
        border-right: 1px solid #e2e8f0 !important;
        box-shadow: 2px 0 12px rgba(15, 23, 42, 0.05) !important;
      }
      .zy-sidenav, .adminui .zy-sidenav {
        background: #ffffff !important;
        background-color: #ffffff !important;
      }
      .zy-side-head, .adminui .zy-side-head {
        background: #ffffff !important;
        border-bottom: 2px solid #f1f5f9 !important;
      }
      .zy-side-head::after, .adminui .zy-side-head::after {
        background: var(--header-gradient) !important;
      }
      .zy-side-head .zy-welcome {
        color: #64748b !important;
        font-weight: 600 !important;
      }
      .zy-side-head .zy-role {
        color: #0f172a !important;
        font-weight: 800 !important;
      }
      /* ── Soft Neumorphic Sidenav Headers (Dashboard, Notifications & Groups) ── */
      .zy-sidenav .zy-snav, .adminui .zy-sidenav .zy-snav {
        display: flex !important;
        align-items: center !important;
        gap: 9px !important;
        width: calc(100% - 16px) !important;
        box-sizing: border-box !important;
        padding: 10px 14px !important;
        min-height: 40px !important;
        margin: 4px 8px !important;
        background: #f4f8f6 !important;
        color: #334155 !important;
        border: 1px solid #e0ebe5 !important;
        border-radius: 12px !important;
        font-weight: 700 !important;
        font-size: 12px !important;
        letter-spacing: 0.25px !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02) !important;
        text-shadow: none !important;
        transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
      .zy-sidenav .zy-snav:hover, .adminui .zy-sidenav .zy-snav:hover {
        background: #e8f3ee !important;
        color: #00a86b !important;
        border-color: #a7f3d0 !important;
        padding-left: 17px !important;
        transform: translateX(2px) !important;
        box-shadow: 0 2px 8px rgba(0, 168, 107, 0.08) !important;
      }
      .zy-sidenav .zy-snav.open, .adminui .zy-sidenav .zy-snav.open {
        background: #ffffff !important;
        color: #00a86b !important;
        border-color: #a7f3d0 !important;
        box-shadow: 0 2px 8px rgba(0, 168, 107, 0.06) !important;
      }
      .zy-sidenav .zy-snav.active, .adminui .zy-sidenav .zy-snav.active {
        background: #00a86b !important;
        color: #ffffff !important;
        border: 1px solid #00a86b !important;
        box-shadow: 0 4px 14px rgba(0, 168, 107, 0.3) !important;
        text-shadow: none !important;
      }
      .zy-sidenav .zy-snav.active span,
      .zy-sidenav .zy-snav.active .zy-ic,
      .zy-sidenav .zy-snav.active .zy-ic i,
      .zy-sidenav .zy-snav.active .zy-caret,
      .adminui .zy-sidenav .zy-snav.active span,
      .adminui .zy-sidenav .zy-snav.active .zy-ic,
      .adminui .zy-sidenav .zy-snav.active .zy-ic i,
      .adminui .zy-sidenav .zy-snav.active .zy-caret {
        color: #ffffff !important;
      }
      .zy-sidenav .zy-snav .zy-ic, .adminui .zy-sidenav .zy-snav .zy-ic {
        color: #00a86b !important;
      }
      .zy-sidenav .zy-snav .zy-caret, .adminui .zy-sidenav .zy-snav .zy-caret {
        margin-left: auto !important;
        font-size: 11px !important;
        opacity: 0.9 !important;
        color: #64748b !important;
        transition: transform 0.25s ease !important;
      }
      .zy-sidenav .zy-snav.open .zy-caret, .adminui .zy-sidenav .zy-snav.open .zy-caret {
        transform: rotate(180deg) !important;
        color: #00a86b !important;
      }

      /* ── Opened Folder Sub-menus: Soft Rounded Sub-items with Bullets ── */
      .zy-sidenav .zy-ssub, .adminui .zy-sidenav .zy-ssub {
        display: none;
      }
      .zy-sidenav .zy-ssub.open, .adminui .zy-sidenav .zy-ssub.open {
        display: block !important;
        background: transparent !important;
        position: relative !important;
        border: none !important;
        border-radius: 0px !important;
        box-shadow: none !important;
        padding: 2px 4px 6px 8px !important;
        animation: zySubDropOpen 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      @keyframes zySubDropOpen {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .zy-sidenav .zy-ssub div, .adminui .zy-sidenav .zy-ssub div {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        background: transparent !important;
        color: #475569 !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        letter-spacing: 0.15px !important;
        padding: 8px 12px 8px 16px !important;
        margin: 3px 6px 3px 12px !important;
        border: 1px solid transparent !important;
        border-radius: 10px !important;
        box-shadow: none !important;
        cursor: pointer !important;
        text-shadow: none !important;
        transition: all 0.16s cubic-bezier(0.4, 0, 0.2, 1) !important;
        position: relative !important;
      }
      .zy-sidenav .zy-ssub div::before, .adminui .zy-sidenav .zy-ssub div::before {
        content: "•";
        font-size: 16px;
        color: #94a3b8;
        line-height: 1;
      }
      .zy-sidenav .zy-ssub div:hover, .adminui .zy-sidenav .zy-ssub div:hover {
        background: #f4f8f6 !important;
        color: #00a86b !important;
        border-color: #d1dfd8 !important;
        padding-left: 20px !important;
        box-shadow: 0 2px 6px rgba(0, 168, 107, 0.06) !important;
        transform: translateX(2px) !important;
        text-shadow: none !important;
      }
      .zy-sidenav .zy-ssub div:hover::before, .adminui .zy-sidenav .zy-ssub div:hover::before {
        color: #00a86b !important;
      }
      .zy-sidenav .zy-ssub div.active, .adminui .zy-sidenav .zy-ssub div.active {
        background: #e6f7f0 !important;
        color: #00a86b !important;
        border-color: #a7f3d0 !important;
        font-weight: 800 !important;
        box-shadow: 0 2px 6px rgba(0, 168, 107, 0.08) !important;
      }
      .zy-sidenav .zy-ssub div.active::before, .adminui .zy-sidenav .zy-ssub div.active::before {
        color: #00a86b !important;
      }
      /* ── Fixed Sidebar & Sticky Bottom Profile Card ── */
      .zy-side, .adminui .zy-side {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        bottom: 0 !important;
        width: 230px !important;
        z-index: 1050 !important;
        background: #ffffff !important;
        border-right: 1px solid #e2e8f0 !important;
        box-shadow: 2px 0 12px rgba(15, 23, 42, 0.05) !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
      }
      .zy-side-head, .adminui .zy-side-head {
        flex-shrink: 0 !important;
        background: #ffffff !important;
        border-bottom: 2px solid #f1f5f9 !important;
      }
      .zy-sidenav, .adminui .zy-sidenav {
        flex: 1 1 auto !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        padding-bottom: 12px !important;
      }
      .zy-side-foot, .adminui .zy-side-foot {
        flex-shrink: 0 !important;
        width: 100% !important;
        min-height: 58px !important;
        height: auto !important;
        background: var(--header-gradient) !important;
        border-top: 1.5px solid rgba(255, 255, 255, 0.25) !important;
        box-shadow: 0 -3px 12px rgba(0, 0, 0, 0.28) !important;
        margin-top: auto !important;
        position: relative !important;
        z-index: 10 !important;
        display: block !important;
        opacity: 1 !important;
      }
      .zy-foot-profile {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 10px 14px !important;
        cursor: pointer !important;
        width: 100% !important;
        box-sizing: border-box !important;
        user-select: none !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
      .zy-foot-profile:hover {
        background: rgba(255, 255, 255, 0.16) !important;
      }
      .zy-foot-ava {
        width: 36px !important;
        height: 36px !important;
        border-radius: 50% !important;
        background: rgba(255, 255, 255, 0.18) !important;
        border: 1.5px solid rgba(255, 255, 255, 0.65) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: #ffffff !important;
        font-size: 15px !important;
        flex-shrink: 0 !important;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3) !important;
      }
      .zy-foot-ava i {
        color: #ffffff !important;
      }
      .zy-foot-meta {
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        gap: 2px !important;
        line-height: 1.25 !important;
        overflow: hidden !important;
        flex: 1 !important;
      }
      .zy-foot-title {
        font-size: 13.5px !important;
        font-weight: 800 !important;
        color: #ffffff !important;
        letter-spacing: 0.35px !important;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6) !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }
      .zy-foot-sub {
        font-size: 11.5px !important;
        font-weight: 700 !important;
        color: #4ade80 !important;
        letter-spacing: 0.25px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5) !important;
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
      }
      .zy-foot-dot {
        display: inline-block !important;
        width: 7px !important;
        height: 7px !important;
        border-radius: 50% !important;
        background: #22c55e !important;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.8) !important;
        flex-shrink: 0 !important;
      }
      .zy-foot-action {
        color: #ffffff !important;
        font-size: 12px !important;
        opacity: 0.9 !important;
        transition: transform 0.2s ease, opacity 0.2s ease !important;
        flex-shrink: 0 !important;
      }
      .zy-foot-profile:hover .zy-foot-action {
        opacity: 1 !important;
        transform: translateX(4px) !important;
      }

      /* ── Top Header Bar & Corner Sidebar Toggle ── */
      .zy-head-left {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
      }
      .zy-side-toggle {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 38px !important;
        height: 38px !important;
        border-radius: 6px !important;
        background: rgba(255, 255, 255, 0.16) !important;
        border: 1px solid rgba(255, 255, 255, 0.3) !important;
        color: #ffffff !important;
        font-size: 16px !important;
        cursor: pointer !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        flex-shrink: 0 !important;
        outline: none !important;
      }
      .zy-side-toggle:hover {
        background: rgba(255, 255, 255, 0.28) !important;
        border-color: rgba(255, 255, 255, 0.5) !important;
        transform: scale(1.05) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25) !important;
      }
      .zy-side-toggle:active {
        transform: scale(0.95) !important;
      }

      /* ── Top Header Brand & Professional Logo ── */
      .zy-logo, .zy-head-title {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        margin-left: 2px !important;
        cursor: default !important;
        user-select: none !important;
      }
      .zy-logo img, .zy-head-title img, .zy-badge-logo {
        height: 32px !important;
        width: auto !important;
        max-width: 140px !important;
        object-fit: contain !important;
        display: inline-block !important;
        vertical-align: middle !important;
        transition: all 0.2s ease !important;
      }
      @media (max-width: 768px) {
        .zy-logo img, .zy-head-title img, .zy-badge-logo {
          height: 26px !important;
          max-width: 110px !important;
        }
      }
      .brand-logo-img {
        width: auto !important;
        height: auto !important;
        max-width: 220px !important;
        max-height: 115px !important;
        object-fit: contain !important;
        display: block !important;
        margin: 0 auto !important;
      }
      @media (max-width: 768px) {
        .brand-logo-img {
          max-width: 195px !important;
          max-height: 105px !important;
        }
      }
      @media (max-width: 480px) {
        .brand-logo-img {
          max-width: 175px !important;
          max-height: 90px !important;
        }
      }
      .zy-panel-badge {
        font-size: 15.5px !important;
        font-weight: 800 !important;
        color: #0f172a !important;
        letter-spacing: 0.5px !important;
        text-transform: none !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        cursor: default !important;
      }
      .zy-panel-badge .zy-badge-name {
        color: #0f172a !important;
        font-weight: 800 !important;
      }
      .zy-header, .adminui .zy-header {
        background: #ffffff !important;
        color: #1e293b !important;
        border-bottom: 1.5px solid #d5e4dd !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02) !important;
        position: relative;
        transition: background 0.3s ease;
      }
      .zy-header-row {
        position: relative;
      }
      .zy-header a:not(.zy-user-menu a),
      .zy-header span:not(.zy-user-menu span):not(.zy-panel-badge),
      .zy-header i:not(.zy-user-menu i),
      .adminui .zy-header a:not(.zy-user-menu a),
      .adminui .zy-header span:not(.zy-user-menu span):not(.zy-panel-badge),
      .adminui .zy-header i:not(.zy-user-menu i) {
        color: #1e293b !important;
      }
      .zy-hamb span {
        background: #1e293b !important;
      }

      /* ── Top-right Profile Button: Solid Emerald Green Circular Avatar Badge ── */
      .zy-user, .adminui .zy-user {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: auto !important;
        height: auto !important;
        padding: 0 !important;
        background: transparent !important;
        border: none !important;
        border-radius: 50% !important;
        color: #ffffff !important;
        cursor: pointer !important;
        transition: transform 0.15s ease !important;
        user-select: none !important;
        box-shadow: none !important;
      }
      .zy-user:hover, .adminui .zy-user:hover {
        background: transparent !important;
        transform: scale(1.05) !important;
      }
      .zy-user #mgr-username, .zy-user #agent-username, .zy-user #client-username, .zy-user #tp-header-user, .zy-user .zy-name, .zy-user .zy-dot, .zy-user .fa-caret-down, .zy-user .zy-ava-caret,
      .adminui .zy-user #mgr-username, .adminui .zy-user #agent-username, .adminui .zy-user #client-username, .adminui .zy-user #tp-header-user, .adminui .zy-user .zy-name, .adminui .zy-user .zy-dot, .adminui .zy-user .fa-caret-down, .adminui .zy-user .zy-ava-caret {
        display: none !important;
      }
      .zy-user .zy-ava, .adminui .zy-user .zy-ava, .zy-avatar-circle {
        width: 38px !important;
        height: 38px !important;
        min-width: 38px !important;
        border-radius: 50% !important;
        background: #ffffff !important;
        border: 2px solid #00a86b !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: 0 2px 8px rgba(0, 168, 107, 0.25) !important;
        flex-shrink: 0 !important;
        overflow: hidden !important;
        padding: 1px !important;
      }
      .zy-user .zy-ava img, .adminui .zy-user .zy-ava img, .zy-user .zy-ava-dp-img, .zy-user .zy-ava-img {
        width: 100% !important;
        height: 100% !important;
        border-radius: 50% !important;
        object-fit: cover !important;
        display: block !important;
        filter: none !important;
      }
      .zy-avatar-lg {
        width: 48px !important;
        height: 48px !important;
        min-width: 48px !important;
        border-radius: 50% !important;
        background: #ffffff !important;
        border: 2px solid #00a86b !important;
        overflow: hidden !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 2px !important;
        box-shadow: 0 3px 10px rgba(0, 168, 107, 0.2) !important;
      }
      .zy-avatar-lg img {
        width: 100% !important;
        height: 100% !important;
        border-radius: 50% !important;
        object-fit: cover !important;
        display: block !important;
        filter: none !important;
      }

      /* ── Top-right Profile Dropdown Menu (Clean, Compact, White Card) ── */
      .zy-user-menu, .adminui .zy-user-menu {
        display: none;
        position: absolute !important;
        right: 0 !important;
        top: calc(100% + 8px) !important;
        width: 185px !important;
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        overflow: hidden !important;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15) !important;
        z-index: 9999 !important;
        padding: 4px 0 !important;
        animation: zyUserDropIn 0.18s ease-out !important;
      }
      @keyframes zyUserDropIn {
        from { opacity: 0; transform: translateY(-6px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .zy-user-menu.open, .adminui .zy-user-menu.open {
        display: block !important;
      }
      .zy-user-menu .zy-um-head, .adminui .zy-user-menu .zy-um-head {
        display: none !important;
      }
      .zy-user-menu a, .adminui .zy-user-menu a {
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        padding: 9px 14px !important;
        font-size: 13.5px !important;
        font-weight: 500 !important;
        color: #334155 !important;
        background: transparent !important;
        border: none !important;
        transition: all 0.15s ease !important;
        cursor: pointer !important;
        text-decoration: none !important;
      }
      .zy-user-menu a i, .adminui .zy-user-menu a i {
        color: #64748b !important;
        font-size: 13px !important;
        width: 16px !important;
        text-align: center !important;
      }
      .zy-user-menu a:hover, .adminui .zy-user-menu a:hover {
        background: #f8fafc !important;
        color: #0f172a !important;
        padding-left: 16px !important;
      }
      .zy-user-menu a:hover i, .adminui .zy-user-menu a:hover i {
        color: #0284c7 !important;
      }
      .zy-user-menu .zy-um-divider, .adminui .zy-user-menu .zy-um-divider {
        height: 1px !important;
        background: #f1f5f9 !important;
        margin: 4px 0 !important;
      }
      .zy-user-menu a.zy-um-logout, .adminui .zy-user-menu a.zy-um-logout,
      .zy-user-menu a:last-child, .adminui .zy-user-menu a:last-child {
        border-top: 1px solid #f1f5f9 !important;
        color: #ef4444 !important;
        font-weight: 600 !important;
      }
      .zy-user-menu a.zy-um-logout i, .adminui .zy-user-menu a.zy-um-logout i,
      .zy-user-menu a:last-child i, .adminui .zy-user-menu a:last-child i {
        color: #ef4444 !important;
      }
      .zy-user-menu a.zy-um-logout:hover, .adminui .zy-user-menu a.zy-um-logout:hover,
      .zy-user-menu a:last-child:hover, .adminui .zy-user-menu a:last-child:hover {
        background: #fef2f2 !important;
        color: #dc2626 !important;
        border-left: none !important;
      }
      .zy-user-menu .um-badge {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: #ef4444 !important;
        color: #ffffff !important;
        font-size: 10.5px !important;
        font-weight: 700 !important;
        min-width: 17px !important;
        height: 17px !important;
        padding: 0 4px !important;
        border-radius: 4px !important;
        margin-left: auto !important;
      }
      /* Completely hide top mega menu: navigation is strictly on the sidebar */
      .zy-mega, .adminui .zy-mega {
        display: none !important;
      }
      .btn-primary, .btn-submit, .submit-btn, .zy-btn-blue, button.primary {
        background: var(--brand-primary) !important;
        border-color: var(--brand-primary) !important;
      }
      .btn-primary:hover, .zy-btn-blue:hover, .submit-btn:hover {
        background: var(--brand-hover) !important;
        box-shadow: 0 4px 14px var(--brand-glow) !important;
      }
      body.rmsui .stat-value, .stat-value, .zy-strip-txt i, .zy-circle-txt b {
        color: var(--brand-primary) !important;
      }
      .zy-strip-up {
        color: var(--brand-accent, var(--brand-primary)) !important;
      }
      .tpui .zy-tile-on span {
        color: var(--brand-primary) !important;
      }
      .stat-card-ims.green, .stat-card-ims.blue {
        background: var(--header-gradient, linear-gradient(135deg, var(--brand-primary), var(--brand-hover))) !important;
      }
      .btn-success {
        background: var(--brand-primary) !important;
        border-color: var(--brand-primary) !important;
      }
      .btn-success:hover {
        background: var(--brand-hover) !important;
        border-color: var(--brand-hover) !important;
      }
      .zy-gentoken {
        background: var(--header-gradient, var(--brand-primary)) !important;
        border-color: var(--brand-primary) !important;
      }
      .logo-circle {
        border-color: var(--brand-accent) !important;
        box-shadow: 0 8px 30px var(--brand-glow) !important;
      }
      .captcha-box input:focus, .input-group input:focus {
        border-color: var(--brand-accent) !important;
      }
      .zy-hamb {
        transition: all 0.2s ease;
      }
      .zy-hamb:active {
        transform: scale(0.92);
      }

      /* ── Universal Responsive Layout (PC vs Mobile) ── */
      @media (max-width: 991px) {
        .settings-two-col, body.rmsui .settings-two-col {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          gap: 18px !important;
        }
        .settings-sticky-card {
          position: static !important;
          top: auto !important;
          width: 100% !important;
        }
        .settings-stops-grid {
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)) !important;
          gap: 10px !important;
        }
        .settings-subgrid-2 {
          grid-template-columns: 1fr !important;
          gap: 10px !important;
        }
        .settings-presets-grid {
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
        }
        .two-col, .two-col-panel, .three-col, .form-row,
        body.rmsui .two-col, body.rmsui .two-col-panel, body.rmsui .three-col,
        .adminui .zy-dash-panels, .adminui .zy-dash-mid {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          gap: 16px !important;
        }
        .stats-grid, body.rmsui .stats-grid, .adminui .zy-strips {
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 12px !important;
        }
        .charts-grid {
          grid-template-columns: 1fr !important;
        }
        .page-content {
          padding: 14px 10px !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .zy-body {
          padding: 12px 8px !important;
        }
        .card, body.rmsui .card {
          padding: 14px 12px !important;
          margin-bottom: 14px !important;
          box-sizing: border-box !important;
          width: 100% !important;
        }
        .card-header, body.rmsui .card-header {
          margin: -14px -12px 14px !important;
          padding: 10px 12px !important;
        }
        .table-wrap, .zy-dt-wrap, body.rmsui .table-wrap, body.rmsui .zy-dt-wrap {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch !important;
          width: 100% !important;
          display: block !important;
          border-radius: 6px !important;
        }
        table.zy-dt, table.zy-dt2-table, table {
          min-width: 520px;
        }
        .modal, #modal.zy-modal {
          width: calc(100% - 20px) !important;
          max-width: 100% !important;
          margin: 10px auto !important;
          max-height: 90vh !important;
          overflow-y: auto !important;
        }
        .page-header {
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: 10px !important;
          margin-bottom: 16px !important;
        }
        .page-actions {
          width: 100% !important;
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 8px !important;
          justify-content: flex-start !important;
        }
        .page-actions .btn {
          flex: 1 1 auto !important;
          min-width: 120px !important;
          justify-content: center !important;
        }
      }
      @media (max-width: 640px) {
        .stats-grid, body.rmsui .stats-grid,
        .stat-grid, .kpi-grid, .sp-kpi-grid,
        div[style*="grid-template-columns: repeat(2, 1fr)"],
        div[style*="grid-template-columns:repeat(2, 1fr)"],
        div[style*="grid-template-columns: repeat(3, 1fr)"],
        div[style*="grid-template-columns:repeat(3, 1fr)"],
        div[style*="grid-template-columns:repeat(3,1fr)"],
        div[style*="grid-template-columns: repeat(4, 1fr)"],
        div[style*="grid-template-columns:repeat(4, 1fr)"],
        div[style*="grid-template-columns:repeat(4,1fr)"] {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          display: grid !important;
          flex-direction: unset !important;
          gap: 8px 10px !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .stat-card, body.rmsui .stat-card, .stat-card-ims {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          padding: 10px 12px !important;
          min-height: auto !important;
          border-radius: 8px !important;
          overflow: hidden !important;
          position: relative !important;
        }
        .stat-card .stat-label, body.rmsui .stat-card .stat-label, body.rmsui .stat-label {
          font-size: 10.5px !important;
          font-weight: 700 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.3px !important;
          margin-bottom: 4px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
          max-width: 100% !important;
          line-height: 1.25 !important;
        }
        .stat-card .stat-value, body.rmsui .stat-card .stat-value, body.rmsui .stat-value {
          font-size: 18px !important;
          font-weight: 800 !important;
          line-height: 1.2 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
          max-width: 100% !important;
        }
        .stat-card .stat-change, body.rmsui .stat-card .stat-change {
          font-size: 10.5px !important;
          line-height: 1.2 !important;
          margin-top: 3px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: block !important;
          max-width: 100% !important;
          opacity: 0.85 !important;
        }
        .stat-card .stat-icon-corner, body.rmsui .stat-card .stat-icon-corner {
          width: 20px !important;
          height: 20px !important;
          right: 6px !important;
          bottom: 6px !important;
          font-size: 9px !important;
          opacity: 0.22 !important;
          pointer-events: none !important;
        }
        input[type="text"], input[type="number"], input[type="password"],
        input[type="email"], select, textarea {
          max-width: 100% !important;
          box-sizing: border-box !important;
        }
        .form-group {
          width: 100% !important;
        }
        .zy-filterbar {
          grid-template-columns: 1fr !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 8px !important;
          padding: 10px 10px 18px !important;
        }
      }
    `;

    // 4. Update Images / Logos across page
    const logoImgs = document.querySelectorAll('#zy-side-logo, #login-logo-img, .brand-logo-img, .zy-badge-logo, .zy-avatar-lg img, .zy-ava img, .zy-ava-dp-img, .logo-circle img, #preview-bar-logo, #logo-preview-img');
    logoImgs.forEach(img => {
      if (img && img.src !== logoUrl) {
        img.src = logoUrl;
        img.alt = siteName;
      }
    });

    // Ensure all avatars (.zy-avatar-lg, .zy-ava) render the brand DP logo with clean white background
    document.querySelectorAll('.zy-avatar-lg, .zy-ava, .adminui .zy-user .zy-ava, .zy-avatar-circle').forEach(av => {
      av.style.backgroundColor = '#ffffff';
      let img = av.querySelector('img');
      if (!img) {
        av.innerHTML = `<img src="${logoUrl}" class="zy-ava-dp-img" alt="${siteName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;background-color:#ffffff;">`;
      } else {
        img.style.backgroundColor = '#ffffff';
        if (img.src !== logoUrl) {
          img.src = logoUrl;
          img.alt = siteName;
        }
      }
    });

    // 5. Update Header Panel Name & Logo (Instantaneous sync across panels)
    const headerLogoContainer = document.getElementById('zy-logo');
    if (headerLogoContainer) {
      headerLogoContainer.innerHTML = `<span class="zy-panel-badge"><img class="zy-badge-logo" src="${logoUrl}" alt="${siteName}" onerror="this.style.display='none';"> <span class="zy-badge-name">${siteName}</span></span>`;
      headerLogoContainer.onclick = null;
      headerLogoContainer.style.cursor = 'default';
    }

    // Update all badge names, brand titles, and site name placeholders across the page
    document.querySelectorAll('.zy-badge-name, .brand-name, .app-name, .site-name, [data-brand="site-name"]').forEach(el => {
      el.textContent = siteName;
    });

    document.querySelectorAll('.zy-panel-badge').forEach(badge => {
      const nameEl = badge.querySelector('.zy-badge-name');
      if (nameEl) {
        nameEl.textContent = siteName;
      } else {
        badge.innerHTML = `<img class="zy-badge-logo" src="${logoUrl}" alt="${siteName}" onerror="this.style.display='none';"> <span class="zy-badge-name">${siteName}</span>`;
      }
    });

    // Update system payout invoice footers
    document.querySelectorAll('.inv-footer').forEach(inv => {
      inv.textContent = `Generated by ${siteName} Panel · System-generated payout invoice.`;
    });

    // 6. Update Login Page Text
    const loginHeaderP = document.querySelector('.login-header p');
    if (loginHeaderP) {
      loginHeaderP.textContent = `Sign in to your ${siteName} account`;
    }

    // 7. Update Footer Text if any
    const footers = document.querySelectorAll('.zy-footer, .footer, .login-footer');
    footers.forEach(f => {
      f.textContent = _currentSettings.footer_text || `© ${new Date().getFullYear()} ${siteName}. All rights reserved.`;
    });

    // 8. Initialize Mobile Drawer & Sidebar Controls
    initSidebarDrawer();

    // 9. Propagate to parent and child iframes
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'BRAND_THEME_UPDATE', settings: _currentSettings }, '*');
      }
      const frames = document.querySelectorAll('iframe');
      frames.forEach(f => {
        try { f.contentWindow.postMessage({ type: 'BRAND_THEME_UPDATE', settings: _currentSettings }, '*'); } catch (_) {}
      });
    } catch (_) {}
  }

  // Universal Mobile Drawer & Desktop Sidebar Controller
  function initSidebarDrawer() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // 1. Ensure backdrop exists
    let backdrop = document.getElementById('zy-side-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'zy-side-backdrop';
      backdrop.className = 'zy-side-backdrop';
      backdrop.setAttribute('aria-label', 'Close sidebar backdrop');
      backdrop.addEventListener('click', zyCloseSidebar);
      document.body.appendChild(backdrop);
    }

    // 2. Ensure close button exists in sidebar head on mobile
    const sideHead = sidebar.querySelector('.zy-side-head');
    if (sideHead && !sidebar.querySelector('.zy-side-close')) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'zy-side-close';
      closeBtn.type = 'button';
      closeBtn.innerHTML = '<i class="fas fa-times"></i>';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.setAttribute('title', 'Close');
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        zyCloseSidebar();
      });
      sideHead.appendChild(closeBtn);
    }

    // 3. Ensure corner sidebar toggle exists in header
    const headRow = document.querySelector('.zy-header-row');
    if (headRow) {
      let headLeft = headRow.querySelector('.zy-head-left');
      if (!headLeft) {
        headLeft = document.createElement('div');
        headLeft.className = 'zy-head-left';
        const logoEl = headRow.querySelector('#zy-logo, .zy-head-title');
        if (logoEl) {
          headRow.insertBefore(headLeft, logoEl);
          headLeft.appendChild(logoEl);
        } else {
          headRow.prepend(headLeft);
        }
      }
      if (!headLeft.querySelector('.zy-side-toggle')) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'zy-side-toggle';
        toggleBtn.type = 'button';
        toggleBtn.title = 'Toggle Sidebar';
        toggleBtn.setAttribute('aria-label', 'Toggle Sidebar');
        toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';
        toggleBtn.onclick = function(e) {
          e.stopPropagation();
          zyToggleSidebar();
        };
        headLeft.prepend(toggleBtn);
      }
    }

    // 4. Foot profile box removed in F2
    // 5. Close drawer automatically when any navigation item is clicked on mobile
    sidebar.addEventListener('click', (e) => {
      const item = e.target.closest('.zy-snav, .zy-ssub div, a');
      if (item && window.innerWidth < 992) {
        const isExpander = item.hasAttribute('aria-controls') || (item.hasAttribute('onclick') && (item.getAttribute('onclick').includes('zyToggleGroup') || item.getAttribute('onclick').includes('zySideSub')));
        if (!isExpander) {
          setTimeout(zyCloseSidebar, 120);
        }
      }
    });
  }

  function zyToggleSidebar() {
    if (window.innerWidth < 992) {
      const isOpen = document.body.classList.contains('sidebar-open');
      if (isOpen) {
        zyCloseSidebar();
      } else {
        zyOpenSidebar();
      }
    } else {
      // PC version: sidebar must NEVER hide or collapse per user instructions
      document.body.classList.remove('sidebar-collapsed');
    }
  }

  function zyOpenSidebar() {
    document.body.classList.add('sidebar-open');
    const side = document.getElementById('sidebar');
    if (side) side.classList.add('mobile-open');
    const bd = document.getElementById('zy-side-backdrop');
    if (bd) bd.classList.add('active');
  }

  function zyCloseSidebar() {
    document.body.classList.remove('sidebar-open');
    const side = document.getElementById('sidebar');
    if (side) side.classList.remove('mobile-open');
    const bd = document.getElementById('zy-side-backdrop');
    if (bd) bd.classList.remove('active');
  }

  // Globally expose sidebar functions so all hamburger buttons work seamlessly
  window.zyToggleSidebar = zyToggleSidebar;
  window.zyCloseSidebar = zyCloseSidebar;
  window.zyOpenSidebar = zyOpenSidebar;
  window.zyToggleMenu = zyToggleSidebar;
  window.toggleSidebar = zyToggleSidebar;

  window.zySwitchPanelRole = function(role) {
    if (window.SpeedAuth && typeof window.SpeedAuth.switchRole === 'function') {
      window.SpeedAuth.switchRole(role);
      return;
    }
    const routes = {
      owner: '/',
      manager: '/manager',
      agent: '/agent',
      client: '/client',
      testpanel: '/testpanel'
    };
    window.location.href = routes[role] || '/';
  };

  // ESC key to close sidebar on mobile
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
      zyCloseSidebar();
    }
  });

  // Mobile swipe to close drawer (swipe left)
  let touchStartX = 0;
  let touchStartY = 0;
  document.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches.length === 1) {
      const diffX = e.changedTouches[0].clientX - touchStartX;
      const diffY = Math.abs(e.changedTouches[0].clientY - touchStartY);
      if (document.body.classList.contains('sidebar-open') && diffX < -60 && diffY < 60) {
        zyCloseSidebar();
      }
    }
  }, { passive: true });

  // 1. Initial immediate synchronous execution (zero lag)
  applyBrandTheme(_currentSettings);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initSidebarDrawer();
      applyBrandTheme(_currentSettings);
      fetchLiveSettings();
    });
  } else {
    initSidebarDrawer();
    fetchLiveSettings();
  }

  // 2. Cross-tab & Cross-frame live theme synchronization
  window.addEventListener('storage', (e) => {
    if (e.key === 'app_brand_settings' && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        applyBrandTheme(parsed);
      } catch (err) {}
    }
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'BRAND_THEME_UPDATE' && e.data.settings) {
      applyBrandTheme(e.data.settings);
    }
  });

  // Real-time WebSocket listener for immediate instant propagation across all tabs
  (function initBrandRealtimeSync() {
    try {
      if (typeof window === 'undefined' || !window.WebSocket) return;
      var wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = wsProto + '//' + location.host + '/ws/live-traffic';
      var brandWs = null;

      function connect() {
        try {
          brandWs = new WebSocket(wsUrl);
          brandWs.onmessage = function(ev) {
            try {
              var payload = JSON.parse(ev.data);
              if (payload && (payload.type === 'brand_theme_updated' || payload.type === 'brand_updated' || payload.type === 'settings_updated')) {
                var newSettings = payload.settings || payload.data;
                if (newSettings && typeof newSettings === 'object') {
                  applyBrandTheme(newSettings);
                }
              }
            } catch(err) {}
          };
          brandWs.onclose = function() {
            setTimeout(connect, 6000);
          };
          brandWs.onerror = function() {
            try { brandWs.close(); } catch(_) {}
          };
        } catch(_) {}
      }

      setTimeout(connect, 1200);
    } catch(e) {}
  })();

  // Fetch live settings from server
  async function fetchLiveSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          applyBrandTheme(data);
        }
      }
    } catch (e) {
      console.warn('BrandTheme live fetch failed:', e);
    }
  }

  function zySideSub(id, trigger) {
    if (typeof window.zyToggleGroup === 'function') {
      return window.zyToggleGroup(id || trigger);
    }
  }
  window.zySideSub = window.zyToggleGroup || zySideSub;

  function buildGradient(opts) {
    if (!opts) return '';
    const angle = opts.angle || '180deg';
    const c1 = opts.color1 || '#78B800';
    const s1 = opts.stop1 !== undefined ? opts.stop1 : 0;
    const c2 = opts.color2 || '#005c90';
    const s2 = opts.stop2 !== undefined ? opts.stop2 : 60;
    const c3 = opts.color3 || '#2B4300';
    const s3 = opts.stop3 !== undefined ? opts.stop3 : 100;
    return `linear-gradient(${angle}, ${c1} ${s1}%, ${c2} ${s2}%, ${c3} ${s3}%)`;
  }

  function parseGradient(gradStr) {
    if (!gradStr || typeof gradStr !== 'string') return null;
    const m = gradStr.match(/linear-gradient\(\s*([\w\d]+deg)?\s*,\s*(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))\s*(\d+)%?\s*,\s*(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))\s*(\d+)%?\s*,\s*(#[a-fA-F0-9]{3,8}|rgba?\([^)]+\))\s*(\d+)%?\s*\)/i);
    if (m) {
      return {
        angle: m[1] || '180deg',
        color1: m[2], stop1: parseInt(m[3]) || 0,
        color2: m[4], stop2: parseInt(m[5]) || 50,
        color3: m[6], stop3: parseInt(m[7]) || 100
      };
    }
    return null;
  }

  // Expose globally
  window.BrandTheme = {
    apply: applyBrandTheme,
    getSettings: () => ({ ..._currentSettings }),
    palettes: THEME_PALETTES,
    headerGradients: HEADER_GRADIENTS,
    fonts: FONT_DEFS,
    buildGradient: buildGradient,
    parseGradient: parseGradient,
    reload: fetchLiveSettings
  };
})();
