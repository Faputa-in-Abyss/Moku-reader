import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { FONT_LIST } from '../constants/fonts';
import {
  MinusIcon, PlusIcon, BoldIcon, FontIcon,
  LineHeightIcon, LetterSpacingIcon, IndentIcon,
  AlignLeftIcon, AlignCenterIcon, AlignJustifyIcon,
  ContentWidthIcon, FlipPageIcon, PageModeIcon, ScrollModeIcon,
  SinglePageIcon,
  PaletteIcon,
} from './FlatIcons';

const LINE_HEIGHT_PRESETS = [1.2, 1.5, 1.8, 2.0, 2.5, 3.0];
const WIDTH_PRESETS = [
  { label: '窄', value: 0 },
  { label: '适中', value: 2 },
  { label: '宽', value: 3 },
  { label: '全宽', value: 4 },
];

const COLOR_PRESETS = [
  '#e8ddd0', '#d4a96a', '#c0392b', '#e67e22',
  '#27ae60', '#2980b9', '#8e44ad', '#ecf0f1',
  '#bdc3c7', '#7f8c8d', '#2c3e50', '#1a1a2e',
];

function BtnAnchor({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'relative', display: 'inline-flex' }}>{children}</div>;
}

function Btn({ children, tip, active, onClick }: { children: React.ReactNode; tip: string; active?: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button className={`bb-btn${active ? ' active' : ''}`} onClick={onClick}
      style={{ width: 36, height: 36, border: 'none', background: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: active ? 'var(--accent)' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0, transition: 'color 0.15s, background 0.15s' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
      {children}
      <span className="bb-tooltip">{tip}</span>
    </button>
  );
}

function Div() {
  return <span style={{ width: 1, height: 22, background: 'var(--border-glass)', borderRadius: 1, flexShrink: 0, margin: '0 4px' }} />;
}

function Popover({ children }: { children: React.ReactNode }) {
  return <div className="bb-popover">{children}</div>;
}

function PresetGroup({ options, current, onChange }: { options: { label: string; value: number }[]; current: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map((opt) => (
        <button key={opt.value} className={`bb-preset-btn${opt.value === current ? ' active' : ''}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onChange(opt.value); }}
          style={{ padding: '3px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', fontSize: '.75rem', background: opt.value === current ? 'var(--accent)' : 'transparent', color: opt.value === current ? '#fff' : 'var(--text)', cursor: 'pointer' }}
        >{opt.label}</button>
      ))}
    </div>
  );
}

export default function BottomBar() {
  const { readingMode, setReadingMode, fontSize, setFontSize, fontWeight, setFontWeight,
    readerFont, setReaderFont, lineHeight, setLineHeight, letterSpacing, setLetterSpacing,
    textIndent, setTextIndent, textAlign, setTextAlign, windowSize, setWindowSize,
    readerDoublePage, setReaderDoublePage,
    readerTextColor, setReaderTextColor, readerBgColor, setReaderBgColor,
  } = useStore();

  const [visible, setVisible] = useState(false);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (openPopover) { setVisible(true); return; }
      setVisible(e.clientY >= window.innerHeight - 44);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [openPopover]);

  useEffect(() => {
    if (!openPopover) return;
    const onMove = (e: MouseEvent) => {
      const PAD = 30;
      let inZone = false;
      if (barRef.current) {
        const r = barRef.current.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - PAD && e.clientY <= r.bottom) inZone = true;
      }
      if (!inZone) {
        const pe = document.querySelector('.bb-popover');
        if (pe) {
          const r = pe.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom + PAD) inZone = true;
        }
      }
      if (!inZone) setOpenPopover(null);
    };
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenPopover(null);
    };
    const tid = window.setTimeout(() => {
      window.addEventListener('mousemove', onMove, { passive: true });
      document.addEventListener('mousedown', onDown);
    }, 50);
    return () => { clearTimeout(tid); window.removeEventListener('mousemove', onMove); document.removeEventListener('mousedown', onDown); };
  }, [openPopover]);

  const togglePopover = (name: string) => setOpenPopover((p) => (p === name ? null : name));

  return (
    <div ref={barRef} className="reader-bottombar" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301, height: 44, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 2,
      background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
      WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))', borderTop: '1px solid var(--border-glass)',
      opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(100%)', pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.25s ease, transform 0.25s ease',
    }}>
      <Btn tip={readingMode === 'page' ? '翻页模式' : '滚动模式'} onClick={() => { setReadingMode(readingMode === 'page' ? 'scroll' : 'page'); setOpenPopover(null); }}>
        <span key={readingMode} style={{ display: 'inline-flex', animation: 'iconFlip 0.3s ease' }}>
          {readingMode === 'page' ? <FlipPageIcon size={18} /> : <ScrollModeIcon size={18} />}
        </span>
      </Btn>
      <div style={{ opacity: readingMode === 'page' ? 1 : 0.4, transition: 'opacity 0.2s' }}>
        <Btn tip={readingMode === 'page' ? (readerDoublePage ? '切换为单页' : '切换为双页') : '滚动模式下不可用'}
          active={readerDoublePage}
          onClick={() => { if (window.innerWidth < 768) { return; } setReaderDoublePage(!readerDoublePage); }}>
          <span key={String(readerDoublePage)} style={{ display: 'inline-flex', animation: 'iconFlip 0.3s ease' }}>
            {readerDoublePage ? <PageModeIcon size={18} /> : <SinglePageIcon size={18} />}
          </span>
        </Btn>
      </div>
      <Div />
      <Btn tip="缩小字号" onClick={() => setFontSize(fontSize - 0.1)}><MinusIcon size={16} /></Btn>
      <span onClick={() => setFontSize(1.2)} style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text)', minWidth: 28, textAlign: 'center', cursor: 'pointer', flexShrink: 0 }} title="点击重置为默认">{fontSize.toFixed(1)}</span>
      <Btn tip="增大字号" onClick={() => setFontSize(fontSize + 0.1)}><PlusIcon size={16} /></Btn>
      <Div />

      <BtnAnchor>
        <Btn tip="行间距" onClick={() => togglePopover('lineHeight')}><LineHeightIcon size={18} /></Btn>
        {openPopover === 'lineHeight' && (
          <Popover>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: '.7rem', color: 'var(--text-dim)' }}>行间距</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={12} max={35} value={Math.round(lineHeight * 10)}
                  onChange={(e) => setLineHeight(Number(e.target.value) / 10)}
                  style={{ width: 120, accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '.75rem', color: 'var(--accent)', fontWeight: 600, minWidth: 28 }}>{lineHeight.toFixed(1)}</span>
              </div>
            </div>
          </Popover>
        )}
      </BtnAnchor>
      <BtnAnchor>
        <Btn tip="字间距" onClick={() => togglePopover('letterSpacing')}><LetterSpacingIcon size={18} /></Btn>
        {openPopover === 'letterSpacing' && (
          <Popover><div style={{ fontSize: '.7rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>字间距</div>
            <input type="range" min={0} max={20} value={Math.round(letterSpacing * 5)} onChange={(e) => setLetterSpacing(Number(e.target.value) / 5)} style={{ width: 120, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: '.7rem', color: 'var(--accent)', fontWeight: 600 }}>{letterSpacing.toFixed(1)}px</span></Popover>
        )}
      </BtnAnchor>
      <BtnAnchor>
        <Btn tip="段落缩进" onClick={() => togglePopover('textIndent')}><IndentIcon size={18} /></Btn>
        {openPopover === 'textIndent' && (
          <Popover><div style={{ fontSize: '.7rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>段落缩进</div>
            <input type="range" min={0} max={16} value={Math.round(textIndent * 4)} onChange={(e) => setTextIndent(Number(e.target.value) / 4)} style={{ width: 120, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: '.7rem', color: 'var(--accent)', fontWeight: 600 }}>{textIndent.toFixed(1)}em</span></Popover>
        )}
      </BtnAnchor>
      <Div />

      <BtnAnchor>
        <Btn tip={`对齐 · ${textAlign === 'left' ? '左' : textAlign === 'center' ? '居中' : '两端'}`} onClick={() => togglePopover('textAlign')}>
          {textAlign === 'left' ? <AlignLeftIcon size={18} /> : textAlign === 'center' ? <AlignCenterIcon size={18} /> : <AlignJustifyIcon size={18} />}
        </Btn>
        {openPopover === 'textAlign' && (
          <Popover><div style={{ display: 'flex', gap: 2 }}>
            {([{ a: 'left', Icon: AlignLeftIcon }, { a: 'center', Icon: AlignCenterIcon }, { a: 'justify', Icon: AlignJustifyIcon }] as const).map(({ a, Icon }) => (
              <button key={a} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setTextAlign(a); }}
                style={{ width: 30, height: 26, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glass)', cursor: 'pointer', background: textAlign === a ? 'var(--accent)' : 'transparent', color: textAlign === a ? '#fff' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={15} /></button>
            ))}</div></Popover>
        )}
      </BtnAnchor>
      <BtnAnchor>
        <Btn tip="内容宽度" onClick={() => togglePopover('width')}><ContentWidthIcon size={18} /></Btn>
        {openPopover === 'width' && (
          <Popover>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: '.7rem', color: 'var(--text-dim)' }}>内容宽度</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={0} max={4} step={1} value={windowSize}
                  onChange={(e) => setWindowSize(Number(e.target.value))}
                  style={{ width: 100, accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '.75rem', color: 'var(--accent)', fontWeight: 600, minWidth: 28 }}>
                  {['窄', '适中', '宽', '全宽', '超宽'][windowSize] || windowSize}
                </span>
              </div>
            </div>
          </Popover>
        )}
      </BtnAnchor>
      <BtnAnchor>
        <Btn tip="字重" onClick={() => togglePopover('fontWeight')}><BoldIcon size={18} /></Btn>
        {openPopover === 'fontWeight' && (
          <Popover>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: '.7rem', color: 'var(--text-dim)' }}>字重</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="range" min={0} max={2} step={1} value={[400, 700, 900].indexOf(fontWeight) >= 0 ? [400, 700, 900].indexOf(fontWeight) : 1}
                  onChange={(e) => { const v = [400, 700, 900][Number(e.target.value)]; if (v) setFontWeight(v); }}
                  style={{ width: 100, accentColor: 'var(--accent)' }} />
                <span style={{ fontSize: '.75rem', color: 'var(--accent)', fontWeight: 600, minWidth: 28 }}>
                  {['常规', '粗体', '特粗'][[400, 700, 900].indexOf(fontWeight)] || '常规'}
                </span>
              </div>
            </div>
          </Popover>
        )}
      </BtnAnchor>
      <Div />

      <BtnAnchor>
        <Btn tip="字体" onClick={() => togglePopover('font')}><FontIcon size={18} /></Btn>
        {openPopover === 'font' && (
          <Popover>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: '.7rem', color: 'var(--text-dim)' }}>字体</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxHeight: 216, overflowY: 'auto' }}>
                {FONT_LIST.map((f) => (
                  <button key={f.value} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setReaderFont(f.value); setOpenPopover(null); }}
                    style={{ padding: '4px 8px', border: 'none', borderRadius: 'var(--radius-sm)', background: (readerFont || '') === f.value ? 'rgba(var(--accent-rgb),0.12)' : 'transparent', color: (readerFont || '') === f.value ? 'var(--accent)' : 'var(--text)', fontSize: '.75rem', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: f.value || 'serif' }}
                  >{(readerFont || '') === f.value ? '✓ ' : ''}{f.label}</button>
                ))}
              </div>
            </div>
          </Popover>
        )}
      </BtnAnchor>
      <BtnAnchor>
        <Btn tip="主题颜色" onClick={() => togglePopover('colors')}><PaletteIcon size={18} /></Btn>
        {openPopover === 'colors' && (
          <Popover>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: '.7rem', color: 'var(--text-dim)' }}>字体颜色</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {COLOR_PRESETS.map((c) => (
                    <div key={'t' + c} onClick={() => setReaderTextColor(c)}
                      style={{ width: 16, height: 16, borderRadius: '2px', background: c, cursor: 'pointer', border: readerTextColor === c ? '2px solid var(--accent)' : '1px solid var(--border-glass)' }} />
                  ))}
                  {readerTextColor ? <span onClick={() => setReaderTextColor('')} style={{ fontSize: '.65rem', cursor: 'pointer', color: 'var(--text-dim)', marginLeft: 4 }}>重置</span> : null}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: '.7rem', color: 'var(--text-dim)' }}>背景颜色</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {COLOR_PRESETS.map((c) => (
                    <div key={'b' + c} onClick={() => setReaderBgColor(c)}
                      style={{ width: 16, height: 16, borderRadius: '2px', background: c, cursor: 'pointer', border: readerBgColor === c ? '2px solid var(--accent)' : '1px solid var(--border-glass)' }} />
                  ))}
                  {readerBgColor ? <span onClick={() => setReaderBgColor('')} style={{ fontSize: '.65rem', cursor: 'pointer', color: 'var(--text-dim)', marginLeft: 4 }}>重置</span> : null}
                </div>
              </div>
            </div>
          </Popover>
        )}
      </BtnAnchor>


    </div>
  );
}
