import { useState, useEffect, useRef, useMemo } from 'react';
import { useStore } from '@/store/useStore';

interface Props {
  visible: boolean;
  editValue: string;
  onSelect: (functionName: string) => void;
  position: { top: number; left: number };
}

interface FunctionEntry {
  name: string;
  description: string;
  category: string;
  syntax: string;
}

/**
 * Extract the last incomplete function token being typed in a formula.
 * Handles mid-expression positions: =SUM(A1)+IF( → "IF"
 * Returns null when the cursor is not inside a function name context.
 */
function extractActiveToken(editValue: string): string | null {
  if (!editValue.startsWith('=')) return null;
  // Strip the leading '=' and find the last token that looks like a function name
  // A token starts after: '=', '(', '+', '-', '*', '/', ',', '&', '<', '>', ' '
  const expr = editValue.slice(1);
  const match = expr.match(/(?:^|[=(+\-*/,&<> ])([A-Z_][A-Z_0-9.]*)$/i);
  if (!match) return null;
  const token = match[1].toUpperCase();
  return token.length > 0 ? token : null;
}

/**
 * Score a function name against the typed token.
 * Prefix match scores highest, then substring match.
 */
function scoreMatch(name: string, token: string): number {
  if (name === token) return 0; // exact — exclude (already complete)
  if (name.startsWith(token)) return 1; // prefix
  if (name.includes(token)) return 2;   // substring
  return -1; // no match
}

export function FormulaAutocomplete({ visible, editValue, onSelect, position }: Props) {
  const engine = useStore((s) => s.engine);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const allFunctions = useMemo<FunctionEntry[]>(
    () => engine?.getFunctionList() ?? [],
    [engine],
  );

  const { token, filtered } = useMemo(() => {
    const tok = extractActiveToken(editValue);
    if (!tok) return { token: '', filtered: [] };

    const scored = allFunctions
      .map((fn) => ({ fn, score: scoreMatch(fn.name, tok) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => a.score - b.score || a.fn.name.localeCompare(b.fn.name))
      .slice(0, 12)
      .map(({ fn }) => fn);

    return { token: tok, filtered: scored };
  }, [editValue, allFunctions]);

  // Reset selection when the list changes
  useEffect(() => { setSelectedIndex(0); }, [filtered.length]);

  // Keyboard navigation — capture phase so we intercept before the grid
  useEffect(() => {
    if (!visible || filtered.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Tab':
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          onSelect(filtered[selectedIndex].name);
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onSelect('');
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, filtered, selectedIndex, onSelect]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!visible || filtered.length === 0) return null;

  const selectedFn = filtered[selectedIndex];

  return (
    <div
      className="fixed bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden"
      style={{ top: position.top, left: position.left, width: 360, maxHeight: 320 }}
    >
      {/* Header */}
      <div className="text-[10px] text-gray-400 px-3 py-1.5 border-b border-gray-100 bg-gray-50 uppercase tracking-wide font-medium flex items-center justify-between">
        <span>Functions</span>
        <span className="text-gray-300 normal-case tracking-normal">Tab or Enter to insert</span>
      </div>

      {/* List */}
      <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 200 }}>
        {filtered.map((fn, i) => {
          const isAI = fn.category.startsWith('AI');
          const isSelected = i === selectedIndex;
          // Highlight the matching prefix/substring in the name
          const nameDisplay = highlightMatch(fn.name, token);

          return (
            <div
              key={fn.name}
              className={`px-3 py-2 cursor-pointer flex items-start gap-3 text-sm transition-colors ${
                isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
              }`}
              onMouseDown={(e) => { e.preventDefault(); onSelect(fn.name); }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className={`font-mono font-semibold text-xs px-1.5 py-0.5 rounded shrink-0 ${
                isAI ? 'bg-purple-100/70 text-purple-600' : 'bg-blue-100/60 text-blue-600'
              }`}>
                {nameDisplay}
              </span>
              <div className="min-w-0">
                <div className="text-[11px] text-gray-500 truncate">{fn.description}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Argument hint for selected function */}
      {selectedFn && (
        <div className="border-t border-gray-100 bg-slate-50 px-3 py-2">
          <code className="text-[11px] text-slate-600 font-mono leading-relaxed break-all">
            {selectedFn.syntax}
          </code>
        </div>
      )}
    </div>
  );
}

/** Wrap the matched portion of a function name in a <strong> for visual emphasis. */
function highlightMatch(name: string, token: string): React.ReactNode {
  if (!token) return name;
  const idx = name.indexOf(token);
  if (idx === -1) return name;
  return (
    <>
      {name.slice(0, idx)}
      <strong>{name.slice(idx, idx + token.length)}</strong>
      {name.slice(idx + token.length)}
    </>
  );
}
