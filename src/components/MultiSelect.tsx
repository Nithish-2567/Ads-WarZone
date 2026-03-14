import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';
import { cn } from '../lib/utils';

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder: string;
  label?: string;
  icon?: React.ReactNode;
}

export function MultiSelect({ options, selected, onChange, placeholder, icon }: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(searchTerm.toLowerCase()) && opt !== 'all'
  );

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const removeOption = (option: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter(item => item !== option));
  };

  return (
    <div className="relative" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "min-h-[40px] w-full pl-10 pr-10 py-1.5 bg-[#F1F3F4] border-transparent border focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500 rounded-lg text-sm transition-all cursor-pointer flex flex-wrap gap-1 items-center",
          isOpen && "bg-white ring-2 ring-indigo-500"
        )}
      >
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6368]">
          {icon}
        </div>
        
        {selected.length === 0 ? (
          <span className="text-[#5F6368]">{placeholder}</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {selected.map(item => (
              <span 
                key={item} 
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium"
              >
                {item}
                <X 
                  className="w-3 h-3 cursor-pointer hover:text-indigo-900" 
                  onClick={(e) => removeOption(item, e)}
                />
              </span>
            ))}
          </div>
        )}
        
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5F6368]">
          <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#E0E0E0] rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-[#F1F3F4]">
            <input
              type="text"
              className="w-full px-3 py-1.5 text-sm bg-[#F8F9FA] border-none rounded focus:ring-1 focus:ring-indigo-500"
              placeholder="Search options..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-sm text-[#5F6368]">No options found</div>
            ) : (
              filteredOptions.map(option => (
                <div
                  key={option}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOption(option);
                  }}
                  className="px-4 py-2 text-sm hover:bg-[#F1F3F4] cursor-pointer flex items-center justify-between group"
                >
                  <span className={cn(selected.includes(option) && "text-indigo-600 font-medium")}>
                    {option}
                  </span>
                  {selected.includes(option) && (
                    <Check className="w-4 h-4 text-indigo-600" />
                  )}
                </div>
              ))
            )}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-[#F1F3F4] bg-[#F8F9FA] flex justify-between items-center">
              <span className="text-[10px] text-[#5F6368] uppercase font-bold px-2">
                {selected.length} selected
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 uppercase font-bold px-2"
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
