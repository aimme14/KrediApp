"use client";

import { useState, useRef, useEffect, useMemo, useId, useCallback } from "react";

export type SelectConBusquedaOption = {
  value: string;
  label: string;
  /** Texto adicional para filtrar (código, cédula, etc.) */
  searchText?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectConBusquedaOption[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  id?: string;
  className?: string;
  /** Mensaje informativo debajo del campo (sin opciones elegibles, etc.) */
  hint?: string;
  noResultsText?: string;
};

function normalizeSearch(s: string): string {
  return s.toLowerCase().trim();
}

function optionMatchesQuery(opt: SelectConBusquedaOption, query: string): boolean {
  if (!query) return true;
  const haystack = normalizeSearch(`${opt.label} ${opt.searchText ?? ""}`);
  return haystack.includes(query);
}

export default function SelectConBusqueda({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  required = false,
  "aria-label": ariaLabel,
  id: idProp,
  className,
  hint,
  noResultsText = "Sin coincidencias",
}: Props) {
  const autoId = useId();
  const inputId = idProp ?? `select-busqueda-${autoId}`;
  const listboxId = `${inputId}-listbox`;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value]
  );

  const queryNorm = normalizeSearch(query);

  const filtered = useMemo(
    () => options.filter((o) => optionMatchesQuery(o, queryNorm)),
    [options, queryNorm]
  );

  const displayValue = open ? query : (selected?.label ?? "");

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlightIndex(-1);
  }, []);

  const selectOption = useCallback(
    (opt: SelectConBusquedaOption) => {
      onChange(opt.value);
      close();
      inputRef.current?.blur();
    },
    [onChange, close]
  );

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    setHighlightIndex(filtered.length > 0 ? 0 : -1);
  }, [open, queryNorm, filtered.length]);

  const handleInputChange = (text: string) => {
    setQuery(text);
    if (!open) setOpen(true);
    if (value) onChange("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (filtered.length === 0) return;
      setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open || filtered.length === 0) return;
      setHighlightIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
      return;
    }

    if (e.key === "Enter") {
      if (!open || filtered.length === 0) return;
      e.preventDefault();
      const idx = highlightIndex >= 0 ? highlightIndex : 0;
      const opt = filtered[idx];
      if (opt) selectOption(opt);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`select-busqueda${className ? ` ${className}` : ""}${disabled ? " select-busqueda--disabled" : ""}${open ? " select-busqueda--open" : ""}`}
    >
      <div className={`select-busqueda-field${open ? " select-busqueda-field--open" : ""}`}>
        <span className="select-busqueda-icon" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && highlightIndex >= 0 && filtered[highlightIndex]
              ? `${listboxId}-opt-${filtered[highlightIndex].value}`
              : undefined
          }
          aria-label={ariaLabel}
          className="select-busqueda-input"
          value={displayValue}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            setQuery(selected?.label ?? "");
          }}
          onKeyDown={handleKeyDown}
        />
        <span className="select-busqueda-chevron" aria-hidden>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>

      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          className="select-busqueda-required-proxy"
          value={value}
          required
          onChange={() => {}}
        />
      )}

      {open && !disabled && (
        <ul id={listboxId} role="listbox" className="select-busqueda-list" aria-label={ariaLabel}>
          {filtered.length === 0 ? (
            <li className="select-busqueda-empty" role="presentation">
              {noResultsText}
            </li>
          ) : (
            filtered.map((opt, index) => {
              const highlighted = index === highlightIndex;
              return (
                <li
                  key={opt.value}
                  id={`${listboxId}-opt-${opt.value}`}
                  role="option"
                  aria-selected={value === opt.value}
                  className={`select-busqueda-option${highlighted ? " select-busqueda-option--active" : ""}${value === opt.value ? " select-busqueda-option--selected" : ""}`}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectOption(opt)}
                >
                  {opt.label}
                </li>
              );
            })
          )}
        </ul>
      )}

      {hint && !open && (
        <p className="select-busqueda-hint" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
