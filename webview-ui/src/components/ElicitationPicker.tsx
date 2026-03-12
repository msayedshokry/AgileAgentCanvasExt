import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { Artifact, ElicitationMethod } from '../types';
import { Icon } from './Icon';

interface ElicitationPickerProps {
  artifact: Artifact;
  methods: ElicitationMethod[];
  onSelect: (method: ElicitationMethod) => void;
  onClose: () => void;
}

export function ElicitationPicker({ artifact, methods, onSelect, onClose }: ElicitationPickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the search input when the picker opens
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on Escape key (capture phase to intercept before DetailPanel)
  // If search has text, first Escape clears it; second Escape closes the picker
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (search) {
          setSearch('');
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, search]);

  // Build unique ordered category list
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    methods.forEach(m => {
      if (!seen.has(m.category)) {
        seen.add(m.category);
        result.push(m.category);
      }
    });
    return result;
  }, [methods]);

  // Count per category (for tab badges)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    methods.forEach(m => {
      counts[m.category] = (counts[m.category] || 0) + 1;
    });
    return counts;
  }, [methods]);

  // Filtered methods by category + search
  const filteredMethods = useMemo(() => {
    const q = search.toLowerCase().trim();
    return methods.filter(m => {
      const matchesCat = activeCategory === 'all' || m.category === activeCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        m.method_name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.output_pattern.toLowerCase().includes(q)
      );
    });
  }, [methods, activeCategory, search]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleMethodClick = useCallback((method: ElicitationMethod) => {
    onSelect(method);
  }, [onSelect]);

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="elicit-overlay" onClick={handleOverlayClick}>
      <div className="elicit-modal" role="dialog" aria-modal="true" aria-label="Choose Elicitation Method">
        {/* Header */}
        <div className="elicit-modal-header">
          <div className="elicit-modal-title">
            <span className="elicit-modal-icon"><Icon name="crystal-ball" size={24} /></span>
            <div>
              <h2>Choose Elicitation Method</h2>
              <p className="elicit-target-label">
                for: <strong>{artifact.type}</strong> — {artifact.title}
              </p>
            </div>
          </div>
          <button className="elicit-close-btn" onClick={onClose} title="Close (Esc)"><Icon name="close" size={16} /></button>
        </div>

        {/* Search */}
        <div className="elicit-modal-search">
          <span className="elicit-search-icon"><Icon name="search" size={14} /></span>
          <input
            ref={searchRef}
            type="text"
            className="elicit-search-input"
            placeholder="Search methods, descriptions, outputs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="elicit-search-clear" onClick={() => setSearch('')} title="Clear search"><Icon name="close" size={14} /></button>
          )}
        </div>

        {/* Category tabs */}
        <div className="elicit-modal-tabs" role="tablist">
          <button
            className={`elicit-tab ${activeCategory === 'all' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          >
            All
            <span className="elicit-tab-count">{methods.length}</span>
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`elicit-tab ${activeCategory === cat ? 'active' : ''}`}
              role="tab"
              aria-selected={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            >
              {capitalize(cat)}
              <span className="elicit-tab-count">{categoryCounts[cat]}</span>
            </button>
          ))}
        </div>

        {/* Methods list */}
        <div className="elicit-modal-methods" role="tabpanel">
          {filteredMethods.length === 0 ? (
            <div className="elicit-no-results">
              No methods match "{search}"
            </div>
          ) : (
            filteredMethods.map(method => (
              <button
                key={`${method.category}-${method.method_name}`}
                className="elicit-method-card"
                onClick={() => handleMethodClick(method)}
                title={`${method.description}\n\nOutput: ${method.output_pattern}`}
              >
                <div className="elicit-method-top">
                  <span className="elicit-method-name">{method.method_name}</span>
                  <span className="elicit-method-category">{capitalize(method.category)}</span>
                </div>
                <div className="elicit-method-desc">{method.description}</div>
                <div className="elicit-method-output">
                  <span className="elicit-output-arrow">→</span>
                  {method.output_pattern}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="elicit-modal-footer">
          <span className="elicit-footer-hint">
            {filteredMethods.length} method{filteredMethods.length !== 1 ? 's' : ''}
            {search ? ` matching "${search}"` : activeCategory !== 'all' ? ` in ${capitalize(activeCategory)}` : ''}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
