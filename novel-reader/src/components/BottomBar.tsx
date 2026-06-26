import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import {
  MinusIcon, PlusIcon, BoldIcon, FontIcon,
  LineHeightIcon, LetterSpacingIcon, IndentIcon,
  AlignLeftIcon, AlignCenterIcon, AlignJustifyIcon,
  ContentWidthIcon, PlayIcon, PageModeIcon, ScrollModeIcon,
} from './FlatIcons';

const FONT_LIST = [
  { value: '', label: '默认衬线' },
  { value: "'PingFang SC','Microsoft YaHei',sans-serif", label: '无衬线 (苹方/雅黑)' },
  { value: "'STSong','SimSun',serif", label: '宋体' },
  { value: "'KaiTi','STKaiti',serif", label: '楷体' },
  { value: "'FangSong','STFangsong',serif", label: '仿宋' },
  { value: "'Source Han Serif SC','Noto Serif CJK SC',serif", label: '思源宋体' },
  { value: "'LXGW WenKai','STKaiti',serif", label: '霞鹜文楷' },
  { value: "'ZCOOL XiaoWei','Noto Serif SC',serif", label: '站酷小魏体' },
  { value: "'ZCOOL QingKe HuangYou','PingFang SC',sans-serif", label: '站酷清刻黄油体' },
  { value: "'Ma Shan Zheng','STKaiti',serif", label: '马善政楷书' },
  { value: "'Liu Jian Mao Cao','STKaiti',cursive", label: '柳建毛草体' },
  { value: "'ZCOOL KuaiLe',sans-serif", label: '站酷快乐体' },
];

const LINE_HEIGHT_PRESETS = [1.2, 1.5, 1.8, 2.0, 2.5, 3.0];
const WIDTH_PRESETS = [
  { label: '窄', value: 0 },
  { label: '适中', value: 2 },
  { label: '宽', value: 3 },
  { label: '全宽', value: 4 },
];

// ======== 工具组件 ========

function Btn({
  children, tip, active, onClick,
}: { children: React.ReactNode; tip: string; active?: boolean; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      className={`bb-btn${active ? ' active' : ''}`}
      onClick={onClick}
      style={{
        width: 36, height: 36, border: 'none', background: 'none',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', flexShrink: 0,
        transition: 'color 0.15s, background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
    >
      {children}
      <span className="bb-tooltip">{tip}</span>
    </button>
  );
}

function Div() {
  return <span style={{ width: 1, height: 22, background: 'var(--border-glass)', borderRadius: 1, flexShrink: 0, margin: '0 4px' }} />;
}

function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div className="bb-popover">
      {children}
    </div>
  );
}

function PresetGroup({ options, current, onChange }: {
  options: { label: string; value: number }[];
  current: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`bb-preset-btn${opt.value === current ? ' active' : ''}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onChange(opt.value); }}
          style={{
            padding: '3px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-glass)', fontSize: '.75rem',
            background: opt.value === current ? 'var(--accent)' : 'transparent',
            color: opt.value === current ? '#fff' : 'var(--text)',
            cursor: 'pointer',
          }}
        >{opt.label}</button>
      ))}
    </div>
  );
}

// ======== 主组件 ========

export default function BottomBar() {
  const {
    readingMode, setReadingMode,
    fontSize, setFontSize,
    fontBold, setFontBold,
    readerFont, setReaderFont,
    lineHeight, setLineHeight,
    letterSpacing, setLetterSpacing,
    textIndent, setTextIndent,
    textAlign, setTextAlign,
    windowSize, setWindowSize,
    autoFlipInterval, setAutoFlipInterval,
  } = useStore();

  const [visible, setVisible] = useState(false);
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // 底栏显示条件：popover 打开 或 鼠标在底部 44px（约底栏高度）
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setVisible(openPopover !== null || e.clientY >= window.innerHeight - 44);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [openPopover]);

  // 鼠标离开 popover 自动关闭 & 点击外部关闭
  useEffect(() => {
    if (!openPopover) return;

    const onMove = (e: MouseEvent) => {
      const popEl = document.elementFromPoint(e.clientX, e.clientY);
      // 鼠标在底栏（含 popover）内 → 保持打开
      if (popEl && barRef.current && barRef.current.contains(popEl)) return;
      // 离开 → 关闭
      setOpenPopover(null);
    };
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenPopover(null);
      }
    };

    const tid = window.setTimeout(() => {
      window.addEventListener('mousemove', onMove, { passive: true });
      document.addEventListener('mousedown', onDown);
    }, 50);

    return () => {
      clearTimeout(tid);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
    };
  }, [openPopover]);

  const togglePopover = (name: string) => {
    setOpenPopover((p) => (p === name ? null : name));
  };

  return (
    <div
      ref={barRef}
      className="reader-bottombar"
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
        height: 44, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 2,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
        borderTop: '1px solid var(--border-glass)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
      }}
    >
      <Btn
        tip={readingMode === 'page' ? '翻页模式' : '滚动模式'}
        onClick={() => { setReadingMode(readingMode === 'page' ? 'scroll' : 'page'); setOpenPopover(null); }}
      >
        {readingMode === 'page' ? <PageModeIcon size={18} /> : <ScrollModeIcon size={18} />}
      </Btn>

      <Div />

      <Btn tip="缩小字号" onClick={() => setFontSize(fontSize - 0.1)}><MinusIcon size={16} /></Btn>
      <span
        onClick={() => setFontSize(1.2)}
        style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--text)', minWidth: 28, textAlign: 'center', cursor: 'pointer', flexShrink: 0 }}
        title="点击重置为默认"
      >{fontSize.toFixed(1)}</span>
      <Btn tip="增大字号" onClick={() => setFontSize(fontSize + 0.1)}><PlusIcon size={16} /></Btn>

      <Div />

      <Btn tip="行间距" onClick={() => togglePopover('lineHeight')}>
        <LineHeightIcon size={18} />
      </Btn>

      <Btn tip="字间距" onClick={() => togglePopover('letterSpacing')}>
        <LetterSpacingIcon size={18} />
      </Btn>

      <Btn tip="段落缩进" onClick={() => togglePopover('textIndent')}>
        <IndentIcon size={18} />
      </Btn>

      <Div />

      <Btn
        tip={`对齐 · ${textAlign === 'left' ? '左' : textAlign === 'center' ? '居中' : '两端'}`}
        onClick={() => togglePopover('textAlign')}
      >
        {textAlign === 'left' ? <AlignLeftIcon size={18} />
          : textAlign === 'center' ? <AlignCenterIcon size={18} />
          : <AlignJustifyIcon size={18} />}
      </Btn>

      <Btn tip="内容宽度" onClick={() => togglePopover('width')}>
        <ContentWidthIcon size={18} />
      </Btn>

      <Btn tip={fontBold ? '取消粗体' : '粗体'} active={fontBold} onClick={() => setFontBold(!fontBold)}>
        <BoldIcon size={18} />
      </Btn>

      <Div />

      <Btn tip="字体" onClick={() => togglePopover('font')}>
        <FontIcon size={18} />
      </Btn>

      {/* 自动翻页滑块 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0 }}>
        <PlayIcon size={16} style={{ color: autoFlipInterval > 0 ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0 }} />
        <input
          type="range"
          min={0} max={300} value={autoFlipInterval}
          onChange={(e) => setAutoFlipInterval(Number(e.target.value))}
          title={`自动翻页: ${autoFlipInterval === 0 ? '关' : autoFlipInterval + '秒'}`}
          style={{ width: 64, accentColor: 'var(--accent)', height: 4, flexShrink: 0 }}
        />
        <span style={{ fontSize: '.65rem', color: autoFlipInterval > 0 ? 'var(--accent)' : 'var(--text-dim)', minWidth: 24, textAlign: 'right', flexShrink: 0 }}>
          {autoFlipInterval === 0 ? '关' : autoFlipInterval + 's'}
        </span>
      </div>

      {/* ===== Popovers ===== */}

      {openPopover === 'lineHeight' && (
        <Popover>
          <div style={{ fontSize: '.7rem', color: 'var(--text-dim)', marginBottom: 6 }}>行间距</div>
          <PresetGroup
            options={LINE_HEIGHT_PRESETS.map((v) => ({ label: String(v), value: v }))}
            current={lineHeight}
            onChange={setLineHeight}
          />
        </Popover>
      )}

      {openPopover === 'letterSpacing' && (
        <Popover>
          <div style={{ fontSize: '.7rem', color: 'var(--text-dim)', marginBottom: 4 }}>字间距</div>
          <input type="range" min={0} max={20} value={Math.round(letterSpacing * 5)}
            onChange={(e) => setLetterSpacing(Number(e.target.value) / 5)}
            style={{ width: 120, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: '.7rem', color: 'var(--accent)', fontWeight: 600 }}>{letterSpacing.toFixed(1)}px</span>
        </Popover>
      )}

      {openPopover === 'textIndent' && (
        <Popover>
          <div style={{ fontSize: '.7rem', color: 'var(--text-dim)', marginBottom: 4 }}>段落缩进</div>
          <input type="range" min={0} max={16} value={Math.round(textIndent * 4)}
            onChange={(e) => setTextIndent(Number(e.target.value) / 4)}
            style={{ width: 120, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: '.7rem', color: 'var(--accent)', fontWeight: 600 }}>{textIndent.toFixed(1)}em</span>
        </Popover>
      )}

      {openPopover === 'textAlign' && (
        <Popover>
          <div style={{ display: 'flex', gap: 2 }}>
            {([
              { a: 'left', Icon: AlignLeftIcon, label: '左对齐' },
              { a: 'center', Icon: AlignCenterIcon, label: '居中' },
              { a: 'justify', Icon: AlignJustifyIcon, label: '两端' },
            ] as const).map(({ a, Icon, label }) => (
              <button
                key={a}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setTextAlign(a); }}
                title={label}
                style={{
                  width: 30, height: 26, borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-glass)', cursor: 'pointer',
                  background: textAlign === a ? 'var(--accent)' : 'transparent',
                  color: textAlign === a ? '#fff' : 'var(--text-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><Icon size={15} /></button>
            ))}
          </div>
        </Popover>
      )}

      {openPopover === 'width' && (
        <Popover>
          <div style={{ fontSize: '.7rem', color: 'var(--text-dim)', marginBottom: 6 }}>内容宽度</div>
          <PresetGroup options={WIDTH_PRESETS} current={windowSize} onChange={setWindowSize} />
        </Popover>
      )}

      {openPopover === 'font' && (
        <Popover>
          <div style={{ fontSize: '.7rem', color: 'var(--text-dim)', marginBottom: 6 }}>字体</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 280, overflowY: 'auto' }}>
            {FONT_LIST.map((f) => (
              <button
                key={f.value}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setReaderFont(f.value); setOpenPopover(null); }}
                style={{
                  padding: '5px 10px', border: 'none', borderRadius: 'var(--radius-sm)',
                  background: (readerFont || '') === f.value ? 'rgba(var(--accent-rgb),0.12)' : 'transparent',
                  color: (readerFont || '') === f.value ? 'var(--accent)' : 'var(--text)',
                  fontSize: '.75rem', cursor: 'pointer', textAlign: 'left',
                  fontFamily: f.value || 'serif',
                }}
              >{(readerFont || '') === f.value ? '✓ ' : ''}{f.label}</button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
