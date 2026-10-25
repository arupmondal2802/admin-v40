import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  Tag, 
  Plus, 
  X, 
  Check, 
  Sparkles, 
  Flame, 
  RefreshCw, 
  Star, 
  ShieldAlert, 
  Building2, 
  Truck, 
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Search
} from 'lucide-react';
import { DEFAULT_SERVICE_TAGS } from '../../types';

export interface OrderTagsManagerProps {
  tags?: string[];
  onChange: (tags: string[]) => void;
  title?: string;
  description?: string;
  suggestedTags?: readonly string[] | string[];
  readOnly?: boolean;
  className?: string;
}

// Function to resolve semantic badge styling and icons for known tags
export const getTagTheme = (tag: string) => {
  const normalized = tag.trim().toLowerCase();

  if (normalized === 'vip') {
    return {
      bg: 'bg-amber-100 dark:bg-amber-950/80',
      text: 'text-amber-900 dark:text-amber-200',
      border: 'border-amber-300 dark:border-amber-700',
      icon: <Star className="w-3 h-3 text-amber-600 dark:text-amber-400 fill-amber-500/20" />,
      dot: 'bg-amber-500',
      description: 'High Value / VIP Client',
    };
  }

  if (normalized === 'urgent' || normalized === 'rush' || normalized === 'emergency') {
    return {
      bg: 'bg-red-100 dark:bg-red-950/80',
      text: 'text-red-900 dark:text-red-200',
      border: 'border-red-300 dark:border-red-700',
      icon: <Flame className="w-3 h-3 text-red-600 dark:text-red-400 animate-pulse" />,
      dot: 'bg-red-500 animate-ping',
      description: 'Immediate Priority',
    };
  }

  if (normalized === 'return-visit' || normalized === 'return visit' || normalized === 'revisit' || normalized === 'repeat') {
    return {
      bg: 'bg-sky-100 dark:bg-sky-950/80',
      text: 'text-sky-900 dark:text-sky-200',
      border: 'border-sky-300 dark:border-sky-700',
      icon: <RefreshCw className="w-3 h-3 text-sky-600 dark:text-sky-400" />,
      dot: 'bg-sky-500',
      description: 'Repeat Customer or Warranty Re-visit',
    };
  }

  if (normalized === 'first-timer' || normalized === 'first timer' || normalized === 'new customer') {
    return {
      bg: 'bg-emerald-100 dark:bg-emerald-950/80',
      text: 'text-emerald-900 dark:text-emerald-200',
      border: 'border-emerald-300 dark:border-emerald-700',
      icon: <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />,
      dot: 'bg-emerald-500',
      description: 'First Time Order',
    };
  }

  if (normalized === 'corporate' || normalized === 'b2b') {
    return {
      bg: 'bg-indigo-100 dark:bg-indigo-950/80',
      text: 'text-indigo-900 dark:text-indigo-200',
      border: 'border-indigo-300 dark:border-indigo-700',
      icon: <Building2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />,
      dot: 'bg-indigo-500',
      description: 'Corporate Account',
    };
  }

  if (normalized === 'fleet') {
    return {
      bg: 'bg-violet-100 dark:bg-violet-950/80',
      text: 'text-violet-900 dark:text-violet-200',
      border: 'border-violet-300 dark:border-violet-700',
      icon: <Truck className="w-3 h-3 text-violet-600 dark:text-violet-400" />,
      dot: 'bg-violet-500',
      description: 'Fleet Commercial Vehicle',
    };
  }

  if (normalized.includes('warranty')) {
    return {
      bg: 'bg-teal-100 dark:bg-teal-950/80',
      text: 'text-teal-900 dark:text-teal-200',
      border: 'border-teal-300 dark:border-teal-700',
      icon: <ShieldAlert className="w-3 h-3 text-teal-600 dark:text-teal-400" />,
      dot: 'bg-teal-500',
      description: 'Warranty Verification Required',
    };
  }

  // Default theme for general custom tags
  return {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-800 dark:text-slate-200',
    border: 'border-slate-300 dark:border-slate-600',
    icon: <Tag className="w-3 h-3 text-slate-500 dark:text-slate-400" />,
    dot: 'bg-slate-400',
    description: tag,
  };
};

// Reusable individual tag badge component
export const OrderTagBadge: React.FC<{
  tag: string;
  onRemove?: () => void;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}> = ({ tag, onRemove, size = 'sm', className = '' }) => {
  const theme = getTagTheme(tag);

  const sizeClasses = {
    xs: 'text-[10px] px-2 py-0.5 gap-1',
    sm: 'text-xs px-2.5 py-1 gap-1.5',
    md: 'text-sm px-3 py-1.5 gap-2',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-bold rounded-lg border shadow-2xs transition-all ${theme.bg} ${theme.text} ${theme.border} ${sizeClasses} ${className}`}
      title={theme.description}
    >
      {theme.icon}
      <span className="whitespace-nowrap tracking-tight">{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-current opacity-70 hover:opacity-100 transition-opacity cursor-pointer focus:outline-none"
          title={`Remove ${tag} tag`}
          aria-label={`Remove ${tag} tag`}
        >
          <X className="w-3 h-3 stroke-[2.5]" />
        </button>
      )}
    </span>
  );
};

export const OrderTagsManager: React.FC<OrderTagsManagerProps> = ({
  tags = [],
  onChange,
  title = 'Order Tags & Custom Labels',
  description = 'Add custom labels (e.g., VIP, Urgent, Return-Visit) to highlight priorities and specific handling instructions for field technicians.',
  suggestedTags = DEFAULT_SERVICE_TAGS,
  readOnly = false,
  className = '',
}) => {
  const [customInput, setCustomInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentTags = Array.isArray(tags) ? tags : [];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddTag = useCallback((tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed) return;

    // Check for duplicate (case-insensitive)
    if (currentTags.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
      setInputError(`Label "${trimmed}" already added`);
      setTimeout(() => setInputError(''), 2500);
      return;
    }

    if (trimmed.length > 30) {
      setInputError('Label length max 30 characters');
      setTimeout(() => setInputError(''), 2500);
      return;
    }

    onChange([...currentTags, trimmed]);
    setCustomInput('');
    setInputError('');
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
  }, [currentTags, onChange]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    onChange(currentTags.filter(t => t.toLowerCase() !== tagToRemove.toLowerCase()));
  }, [currentTags, onChange]);

  const handleToggleSuggested = useCallback((suggested: string) => {
    const isPresent = currentTags.some(t => t.toLowerCase() === suggested.toLowerCase());
    if (isPresent) {
      handleRemoveTag(suggested);
    } else {
      handleAddTag(suggested);
    }
  }, [currentTags, handleAddTag, handleRemoveTag]);

  // Filter suggested tags based on user input
  const trimmedInput = customInput.trim();
  const filteredSuggestions = suggestedTags.filter((preset) =>
    !trimmedInput || preset.toLowerCase().includes(trimmedInput.toLowerCase())
  );

  const isExactMatch = suggestedTags.some(
    (preset) => preset.toLowerCase() === trimmedInput.toLowerCase()
  );

  // Keyboard navigation inside dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsDropdownOpen(true);
      const totalOptions = filteredSuggestions.length + (trimmedInput && !isExactMatch ? 1 : 0);
      setHighlightedIndex((prev) => (prev + 1) % (totalOptions || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsDropdownOpen(true);
      const totalOptions = filteredSuggestions.length + (trimmedInput && !isExactMatch ? 1 : 0);
      setHighlightedIndex((prev) => (prev <= 0 ? (totalOptions - 1) : prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isDropdownOpen && highlightedIndex >= 0) {
        if (trimmedInput && !isExactMatch && highlightedIndex === 0) {
          handleAddTag(trimmedInput);
        } else {
          const suggestionIndex = trimmedInput && !isExactMatch ? highlightedIndex - 1 : highlightedIndex;
          if (filteredSuggestions[suggestionIndex]) {
            handleToggleSuggested(filteredSuggestions[suggestionIndex]);
            setIsDropdownOpen(false);
          }
        }
      } else if (trimmedInput) {
        handleAddTag(trimmedInput);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  return (
    <div className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs ${className}`}>
      {/* Title & Description */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <label className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
            <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>{title}</span>
            {currentTags.length > 0 && (
              <span className="ml-1 text-[11px] font-black px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {currentTags.length}
              </span>
            )}
          </label>
          {description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-normal">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Existing Tags Display as Pills */}
      <div className="mb-3 min-h-[42px] p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center gap-2">
        {currentTags.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-slate-500 italic flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5" />
            No custom labels assigned yet. Select from the dropdown below or enter custom tags.
          </span>
        ) : (
          currentTags.map((tag) => (
            <OrderTagBadge
              key={tag}
              tag={tag}
              onRemove={!readOnly ? () => handleRemoveTag(tag) : undefined}
            />
          ))
        )}
      </div>

      {!readOnly && (
        <div className="space-y-3">
          {/* Input field with integrated Dropdown menu to select or add new tags */}
          <div className="relative" ref={dropdownRef}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={customInput}
                  onChange={(e) => {
                    setCustomInput(e.target.value);
                    if (inputError) setInputError('');
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onKeyDown={handleKeyDown}
                  placeholder="Select or enter label (e.g. VIP, Urgent, Return-Visit)..."
                  maxLength={30}
                  className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen((prev) => !prev)}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                  title="Toggle tags dropdown"
                  aria-label="Toggle tags dropdown"
                >
                  {isDropdownOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleAddTag(customInput)}
                disabled={!customInput.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold shadow-2xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Tag</span>
              </button>
            </div>

            {inputError && (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1">
                ⚠️ {inputError}
              </p>
            )}

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto animate-fadeIn">
                <div className="p-2 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/40 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex justify-between items-center">
                  <span>Available Labels & Presets</span>
                  <span className="text-[10px] text-slate-400">Click to add/toggle</span>
                </div>

                <div className="p-1 space-y-0.5">
                  {/* Option to create custom tag if typed text isn't an exact match */}
                  {trimmedInput && !isExactMatch && (
                    <button
                      type="button"
                      onClick={() => handleAddTag(trimmedInput)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-between gap-2 transition-colors ${
                        highlightedIndex === 0
                          ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                          : 'hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5 text-indigo-600 stroke-[3]" />
                        <span>Add custom label: <strong className="underline">"{trimmedInput}"</strong></span>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">New</span>
                    </button>
                  )}

                  {/* Preset Tag Options */}
                  {filteredSuggestions.map((preset, idx) => {
                    const isSelected = currentTags.some((t) => t.toLowerCase() === preset.toLowerCase());
                    const theme = getTagTheme(preset);
                    const optionIndex = trimmedInput && !isExactMatch ? idx + 1 : idx;

                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          handleToggleSuggested(preset);
                          setCustomInput('');
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 transition-colors ${
                          highlightedIndex === optionIndex
                            ? 'bg-slate-100 dark:bg-slate-700'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-750'
                        } ${isSelected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`p-1 rounded-md border ${theme.bg} ${theme.border}`}>
                            {theme.icon}
                          </span>
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-100">{preset}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-2">
                              {theme.description}
                            </span>
                          </div>
                        </div>

                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>Added</span>
                          </span>
                        ) : (
                          <Plus className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
                        )}
                      </button>
                    );
                  })}

                  {filteredSuggestions.length === 0 && !trimmedInput && (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No presets found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Quick-Select Suggested Tag Presets for fastest 1-click toggling */}
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
              Quick Presets (1-Click Toggle):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestedTags.map((preset) => {
                const isSelected = currentTags.some((t) => t.toLowerCase() === preset.toLowerCase());
                const theme = getTagTheme(preset);

                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleToggleSuggested(preset)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                      isSelected
                        ? `${theme.bg} ${theme.text} ${theme.border} ring-1 ring-indigo-500 shadow-2xs`
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-750'
                    }`}
                  >
                    {isSelected ? (
                      <Check className="w-3 h-3 stroke-[3] text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Plus className="w-3 h-3 text-slate-400" />
                    )}
                    <span>{preset}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderTagsManager;
