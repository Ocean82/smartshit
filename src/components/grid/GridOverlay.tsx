/**
 * GridOverlay - Handles overlay components like find/replace, context menu,
 * pending AI preview, and other floating UI elements.
 */

import { useStore } from '@/store/useStore';
import { FindReplaceDialog } from '@/components/FindReplaceDialog';
import { ContextMenu } from '@/components/ContextMenu';
import { Check, XCircle } from 'lucide-react';

interface GridOverlayProps {
  showFindReplace: boolean;
  setShowFindReplace: (show: boolean) => void;
  pendingPreview: any;
  applyAction: (actionId: string) => void;
  rejectAction: (actionId: string) => void;
}

export function GridOverlay({
  showFindReplace,
  setShowFindReplace,
  pendingPreview,
  applyAction,
  rejectAction,
}: GridOverlayProps) {
  return (
    <>
      {/* Find & Replace Dialog */}
      <FindReplaceDialog isOpen={showFindReplace} onClose={() => setShowFindReplace(false)} />

      {/* Context Menu */}
      <ContextMenu />

      {/* Pending AI Action Preview */}
      {pendingPreview && (
        <div className="sticky bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 px-3 py-2 bg-emerald-700 text-white shadow-lg border-t border-emerald-500">
          <div className="min-w-0 text-xs">
            <span className="font-bold tracking-wide">AI action staged: </span>
            <span className="font-medium text-emerald-100 truncate">
              {pendingPreview.action.description}
            </span>
            <span className="ml-2 text-emerald-200">
              ({pendingPreview.changes.length} cell{pendingPreview.changes.length === 1 ? '' : 's'})
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white text-emerald-800 rounded-lg hover:bg-emerald-50 transition-colors"
              onClick={() => applyAction(pendingPreview.action.id)}
            >
              <Check size={12} />
              Apply
            </button>
            <button
              type="button"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-emerald-900/40 text-white rounded-lg border border-emerald-400/50 hover:bg-emerald-900/60 transition-colors"
              onClick={() => rejectAction(pendingPreview.action.id)}
            >
              <XCircle size={12} />
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Screen reader live region — announces selection changes */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {useStore.getState().selection && `Cell ${useStore.getState().getActiveSheet().id}`}
      </div>
    </>
  );
}