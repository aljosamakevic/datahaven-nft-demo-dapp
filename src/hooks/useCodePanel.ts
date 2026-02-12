import { useState, useCallback } from 'react';

const STORAGE_KEY = 'datahaven_nft_code_panel_open';

function getInitialState(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === 'true';
}

export function useCodePanel(defaultSnippetId: string) {
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(getInitialState);
  const [activeSnippetId, setActiveSnippetId] = useState(defaultSnippetId);

  const toggleCodePanel = useCallback(() => {
    setIsCodePanelOpen((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  return { isCodePanelOpen, toggleCodePanel, activeSnippetId, setActiveSnippetId };
}
