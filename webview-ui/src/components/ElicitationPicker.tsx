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

  // Group filtered methods by category (preserving category order)
  const groupedMethods = useMemo(() => {
    const groups = new Map<string, ElicitationMethod[]>();
    filteredMethods.forEach(m => {
      const group = groups.get(m.category) ?? [];
      group.push(m);
      groups.set(m.category, group);
    });
    // Re-sort groups by original category order
    return Array.from(groups.entries()).sort((a, b) => {
      const orderA = categories.indexOf(a[0]);
      const orderB = categories.indexOf(b[0]);
      return orderA - orderB;
    });
  }, [filteredMethods, categories]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const handleMethodClick = useCallback((method: ElicitationMethod) => {
    onSelect(method);
  }, [onSelect]);

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="wfl-overlay" onClick={handleOverlayClick}>
      <div className="wfl-modal" role="dialog" aria-modal="true" aria-label="Choose Elicitation Method">
        {/* Header */}
        <div className="wfl-modal-header">
          <div className="wfl-modal-title">
            <span className="wfl-modal-icon"><Icon name="crystal-ball" size={24} /></span>
            <div>
              <h2>Choose Elicitation Method</h2>
              <p className="wfl-subtitle">
                for: <strong>{artifact.type}</strong> — {artifact.title}
              </p>
            </div>
          </div>
          <button className="wfl-close-btn" onClick={onClose} title="Close (Esc)"><Icon name="close" size={16} /></button>
        </div>

        {/* Search */}
        <div className="wfl-modal-search">
          <span className="wfl-search-icon"><Icon name="search" size={14} /></span>
          <input
            ref={searchRef}
            type="text"
            className="wfl-search-input"
            placeholder="Search methods, descriptions, outputs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="wfl-search-clear" onClick={() => setSearch('')} title="Clear search"><Icon name="close" size={14} /></button>
          )}
        </div>

        {/* Category tabs */}
        <div className="wfl-modal-tabs" role="tablist">
          <button
            className={`wfl-tab ${activeCategory === 'all' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeCategory === 'all'}
            onClick={() => setActiveCategory('all')}
          >
            All
            <span className="wfl-tab-count">{methods.length}</span>
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              className={`wfl-tab ${activeCategory === cat ? 'active' : ''}`}
              role="tab"
              aria-selected={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            >
              {capitalize(cat)}
              <span className="wfl-tab-count">{categoryCounts[cat]}</span>
            </button>
          ))}
        </div>

        {/* Methods list */}
        <div className="wfl-modal-list" role="tabpanel">
          {filteredMethods.length === 0 ? (
            <div className="wfl-no-results">
              No methods match "{search}"
            </div>
          ) : (
            groupedMethods.map(([category, methods]) => (
              <div key={category} className="wfl-phase-group">
                {activeCategory === 'all' && (
                  <div className="wfl-phase-label">
                    {capitalize(category)}
                  </div>
                )}
                {methods.map(method => (
                  <button
                    key={`${method.category}-${method.method_name}`}
                    className="wfl-card"
                    onClick={() => handleMethodClick(method)}
                    title={`${method.description}\n\nOutput: ${method.output_pattern}`}
                  >
                    <div className="wfl-card-top">
                      <span className="wfl-card-name">{method.method_name}</span>
                      <span className="wfl-card-phase-badge">{capitalize(method.category)}</span>
                    </div>
                    <div className="wfl-card-desc">{method.description}</div>
                    <div className="wfl-card-trigger">
                      <span className="wfl-trigger-arrow">→</span>
                      {method.output_pattern}
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="wfl-modal-footer">
          <span className="wfl-footer-hint">
            {filteredMethods.length} method{filteredMethods.length !== 1 ? 's' : ''}
            {search ? ` matching "${search}"` : activeCategory !== 'all' ? ` in ${capitalize(activeCategory)}` : ''}
          </span>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
